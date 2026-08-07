#!/usr/bin/env node
/**
 * optimize-images.mjs — shrink the static image payload in `public/`, IN PLACE.
 *
 * WHY IN PLACE (and never renamed)
 * --------------------------------
 * Every file under `public/` is addressed by its exact URL path somewhere we
 * cannot rewrite from here:
 *   • `public/hero/*` and `public/logo.webp` are hardcoded in .vue components
 *     (Navbar, Footer, PageHero) and in the OG/`<link rel=icon>` meta tags.
 *   • `public/uploads/products/*.jpg` and `public/test-images/*` are stored as
 *     *URL strings inside the products table* (`products.image` /
 *     `products.images`). A rename would 404 for every existing row, and there
 *     is no migration that could fix an already-deployed database.
 * So this script only ever resizes + recompresses, keeping the filename AND the
 * container format (PNG stays PNG, JPEG stays JPEG, WebP stays WebP).
 *
 * WHY IT IS STILL WORTH IT
 * ------------------------
 * The storefront serves these through `<NuxtImg format="webp">` / IPX, which
 * re-encodes on demand. IPX has to *decode the source* on every cache miss, so a
 * 747 KB PNG costs real CPU and memory per miss even though the browser receives
 * a small WebP. Shrinking the source shrinks the deploy image, the SW cache, and
 * the IPX decode cost all at once.
 *
 * IDEMPOTENT
 * ----------
 * A file is only rewritten when the re-encode saves at least MIN_GAIN. Running
 * this twice is a no-op the second time. Images are never upscaled.
 *
 * USAGE
 * -----
 *   node scripts/optimize-images.mjs --dry-run     # report only, touch nothing
 *   node scripts/optimize-images.mjs               # write in place
 *   node scripts/optimize-images.mjs --filter=hero # only paths containing "hero"
 */

import { readFile, writeFile, rename, stat, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_DIR = path.join(ROOT, 'public')

/**
 * Rewrite only when the new file is at least this much smaller.
 *
 * IDEMPOTENCY / GENERATIONAL LOSS
 * -------------------------------
 * Every codec here is lossy, so re-encoding an already-encoded file keeps
 * shrinking it *by throwing away more image data each pass*. A plain size-gain
 * guard is therefore not enough — a 3 % gain on pass 2 is not a win, it is
 * damage. Two guards keep re-runs honest:
 *   1. A PNG that is already palette-indexed and already within its bounding box
 *      is skipped outright (`isAlreadyOptimal`). Re-quantising a palette PNG
 *      visibly posterises it a little more every time.
 *   2. For lossy formats that need no resize, we demand a much larger gain
 *      (MIN_GAIN_REENCODE). A genuinely unoptimised source blows past it; an
 *      already-processed file does not.
 */
const MIN_GAIN = 0.03
/** Bar for re-encoding a lossy file that does NOT need resizing. */
const MIN_GAIN_REENCODE = 0.08

/**
 * Declarative target table. First matching glob wins, so put specific entries
 * before catch-alls. Globs are relative to `public/`; `*` matches within one
 * path segment, `**` matches across segments.
 *
 *   maxWidth / maxHeight — bounding box, `fit: 'inside'`, never upscales.
 *   quality              — codec quality for the file's own format.
 *   palette              — PNG only: quantise to a palette (libimagequant).
 *                          This is where the large PNG wins come from.
 *   skip                 — matched, but deliberately left untouched.
 */
const TARGETS = [
  // ── Deliberately untouched ────────────────────────────────────────────────
  {
    glob: 'pwa/**',
    skip: true,
    why: 'PWA manifest icons must stay at their declared 192/512 px sizes.',
  },
  {
    glob: 'fonts/**',
    skip: true,
    why: 'Not images.',
  },

  // ── Storefront hero art (filenames hardcoded in .vue) ─────────────────────
  {
    glob: 'hero/logo-mushroom.png',
    maxWidth: 200,
    maxHeight: 200,
    quality: 90,
    palette: true,
    why: 'Rendered at 40 px (navbar) and 72 px (footer). Transparency preserved.',
  },
  {
    glob: 'hero/mushroom-eye.png',
    maxWidth: 560,
    maxHeight: 560,
    quality: 90,
    palette: true,
    why: 'Rendered at 440 px in the about section.',
  },
  {
    glob: 'hero/frog-forest-hero.png',
    maxWidth: 1200,
    maxHeight: 1200,
    quality: 90,
    palette: true,
    why: 'OG / social share image (wants ~1200x630) and PageHero background.',
  },
  {
    glob: 'hero/**',
    maxWidth: 1600,
    maxHeight: 1600,
    quality: 80,
    palette: true,
    why: 'Background art (frog-bg, trippy-bg).',
  },

  // ── Favicon ───────────────────────────────────────────────────────────────
  {
    glob: 'logo.webp',
    maxWidth: 180,
    maxHeight: 180,
    quality: 85,
    why: 'Used as <link rel="icon">; 1820 px was ~10x more than any favicon slot.',
  },

  // ── Real product photos (paths live in the products table) ────────────────
  {
    glob: 'uploads/products/**',
    maxWidth: 1600,
    maxHeight: 1600,
    quality: 78,
    why: 'Same cap the admin upload handler applies to new uploads (MAX_EDGE 1600).',
  },

  // ── Dev seed fixtures (paths written into products.image by seed-test.ts) ──
  {
    glob: 'test-images/**',
    maxWidth: 900,
    maxHeight: 900,
    quality: 80,
    palette: true,
    why:
      'Dev seed fixtures. They must stay under public/ because seed-test.ts writes ' +
      '"test-images/x.png" into products.image, which the storefront resolves to the ' +
      'URL /test-images/x.png — moving them would 404 every seeded product. Since they ' +
      'are throwaway fixtures they get a tighter 900 px cap than real product photos.',
  },
]

const IMAGE_EXT = /\.(png|jpe?g|webp|avif|gif)$/i

function globToRegExp(glob) {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++ // consume the second '*'
        if (glob[i + 1] === '/') {
          i++ // 'a/**/b' — zero or more whole path segments
          out += '(?:.*/)?'
        } else {
          out += '.*' // trailing '**' — everything below this point
        }
      } else {
        out += '[^/]*' // a single '*' stays within one segment
      }
    } else if ('.+^${}()|[]\\?'.includes(c)) {
      out += `\\${c}`
    } else {
      out += c
    }
  }
  return new RegExp(`^${out}$`)
}

const COMPILED = TARGETS.map((t) => ({ ...t, re: globToRegExp(t.glob) }))

function targetFor(relPath) {
  return COMPILED.find((t) => t.re.test(relPath))
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const out = []
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(full)))
    else out.push(full)
  }
  return out
}

/** Re-encode `buf` keeping its original container format. */
async function encode(buf, meta, target) {
  const isGif = meta.format === 'gif'
  let pipeline = sharp(buf, isGif ? { animated: true } : {})
    .rotate() // apply EXIF orientation before metadata is stripped
    .resize({
      width: target.maxWidth,
      height: target.maxHeight,
      fit: 'inside',
      withoutEnlargement: true, // never upscale
    })

  switch (meta.format) {
    case 'png':
      pipeline = pipeline.png({
        compressionLevel: 9,
        palette: target.palette !== false,
        quality: target.quality,
        effort: 10,
      })
      break
    case 'jpeg':
      pipeline = pipeline.jpeg({
        quality: target.quality,
        mozjpeg: true,
        progressive: true,
      })
      break
    case 'webp':
      pipeline = pipeline.webp({ quality: target.quality, effort: 6 })
      break
    case 'avif':
      pipeline = pipeline.avif({ quality: target.quality, effort: 5 })
      break
    case 'gif':
      pipeline = pipeline.gif()
      break
    default:
      return null // unknown container — refuse rather than guess
  }

  // No .withMetadata() → sharp strips EXIF/ICC/XMP by default.
  return pipeline.toBuffer({ resolveWithObject: true })
}

/** True when the file already fits inside the target's bounding box. */
function fitsBounds(meta, target) {
  return meta.width <= target.maxWidth && meta.height <= target.maxHeight
}

/**
 * True when re-encoding could only degrade the file. Currently this catches
 * palette PNGs: once quantised, another quantisation pass costs colours for a
 * few kB. sharp reports indexed PNGs via `paletteBitDepth` (1/2/4/8); it is
 * undefined for truecolour PNGs.
 */
function isAlreadyOptimal(meta, target) {
  return meta.format === 'png' && meta.paletteBitDepth > 0 && fitsBounds(meta, target)
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`
const pad = (s, n) => String(s).padEnd(n)
const lpad = (s, n) => String(s).padStart(n)

async function main() {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const filterArg = argv.find((a) => a.startsWith('--filter='))
  const filter = filterArg ? filterArg.slice('--filter='.length) : null

  const files = (await walk(PUBLIC_DIR))
    .filter((f) => IMAGE_EXT.test(f))
    .filter((f) => !filter || f.includes(filter))
    .sort()

  const rows = []
  let totalBefore = 0
  let totalAfter = 0

  for (const file of files) {
    const rel = path.relative(PUBLIC_DIR, file).split(path.sep).join('/')
    const before = (await stat(file)).size
    totalBefore += before

    const target = targetFor(rel)
    if (!target || target.skip) {
      totalAfter += before
      rows.push({ rel, before, after: before, status: target ? 'skip (rule)' : 'skip (no rule)' })
      continue
    }

    const buf = await readFile(file)
    let meta
    try {
      meta = await sharp(buf).metadata()
    } catch (err) {
      totalAfter += before
      rows.push({ rel, before, after: before, status: `ERROR: ${err.message}` })
      continue
    }

    // Guard 1: re-encoding this file could only lose quality.
    if (isAlreadyOptimal(meta, target)) {
      totalAfter += before
      rows.push({ rel, before, after: before, status: 'already optimal (palette PNG, in bounds)' })
      continue
    }

    let result
    try {
      result = await encode(buf, meta, target)
    } catch (err) {
      totalAfter += before
      rows.push({ rel, before, after: before, status: `ERROR: ${err.message}` })
      continue
    }

    if (!result) {
      totalAfter += before
      rows.push({ rel, before, after: before, status: 'skip (unknown format)' })
      continue
    }

    const after = result.data.length
    const gain = (before - after) / before

    // Guard 2: a pure re-encode (no downscale) must earn its quality loss with a
    // large win; a resize only has to clear the ordinary bar.
    const bar = fitsBounds(meta, target) ? MIN_GAIN_REENCODE : MIN_GAIN

    if (gain < bar) {
      totalAfter += before
      rows.push({
        rel,
        before,
        after: before,
        status: `already optimal (${(gain * 100).toFixed(1)}% < ${(bar * 100).toFixed(0)}%)`,
      })
      continue
    }

    // Paranoia: never write a file sharp can't read back.
    try {
      await sharp(result.data).metadata()
    } catch (err) {
      totalAfter += before
      rows.push({ rel, before, after: before, status: `ERROR verify: ${err.message}` })
      continue
    }

    if (!dryRun) {
      const tmp = `${file}.tmp-opt`
      await writeFile(tmp, result.data)
      await rename(tmp, file) // atomic swap, same filename & extension
    }

    totalAfter += after
    rows.push({
      rel,
      before,
      after,
      status: `${meta.width}x${meta.height} → ${result.info.width}x${result.info.height}`,
    })
  }

  const w = Math.max(...rows.map((r) => r.rel.length), 4)
  console.log(dryRun ? '\nDRY RUN — nothing written\n' : '\nOptimizing public/ in place\n')
  console.log(`${pad('file', w)}  ${lpad('before', 10)}  ${lpad('after', 10)}  ${lpad('saved', 8)}  detail`)
  console.log('-'.repeat(w + 46))
  for (const r of rows) {
    const saved = r.before - r.after
    const pct = r.before ? ((saved / r.before) * 100).toFixed(0) : '0'
    console.log(
      `${pad(r.rel, w)}  ${lpad(kb(r.before), 10)}  ${lpad(kb(r.after), 10)}  ${lpad(saved ? `${pct}%` : '-', 8)}  ${r.status}`,
    )
  }
  console.log('-'.repeat(w + 46))
  const saved = totalBefore - totalAfter
  console.log(
    `${pad('TOTAL', w)}  ${lpad(kb(totalBefore), 10)}  ${lpad(kb(totalAfter), 10)}  ` +
      `${lpad(`${((saved / totalBefore) * 100).toFixed(0)}%`, 8)}  saved ${kb(saved)}`,
  )
  console.log()

  const errors = rows.filter((r) => r.status.startsWith('ERROR'))
  if (errors.length) {
    console.error(`${errors.length} file(s) failed:`)
    for (const e of errors) console.error(`  ${e.rel}: ${e.status}`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
