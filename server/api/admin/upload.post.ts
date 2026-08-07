import { randomBytes } from 'node:crypto'
import { writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { requireAdmin } from '~~/server/utils/session'

// Where the running server actually serves static files from differs by mode:
//   dev  — Nuxt serves the project's `public/` directly
//   prod — Nitro serves `.output/public/`, and docker-compose mounts the
//          persistent `uploads` volume at `/app/.output/public/uploads`
// Writing to `public/` in production put files somewhere nothing serves and
// nothing persists, so every uploaded product image 404'd and vanished on the
// next rebuild.
const UPLOAD_DIR = resolve(
  process.cwd(),
  process.env.NODE_ENV === 'production'
    ? '.output/public/uploads/products'
    : 'public/uploads/products',
)
const PUBLIC_URL_BASE = '/uploads/products'

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'])
const MAX_SIZE = 12 * 1024 * 1024 // 12 MB in (we re-encode down hard anyway)

// Every product photo is re-encoded to WebP and capped in size on upload, so the
// storefront only ever serves small, modern images no matter what the admin drops
// in (a 4 MB phone JPEG becomes a ~100–200 KB WebP). @nuxt/image/IPX still resizes
// per-breakpoint on top of this from the already-small source.
const MAX_EDGE = 1600   // px — longest side; plenty for a full-bleed product view
const WEBP_QUALITY = 80

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Žádný soubor nebyl nahrán' })
  }

  const file = formData.find((f) => f.name === 'file')
  if (!file || !file.data) {
    throw createError({ statusCode: 400, statusMessage: 'Soubor nebyl nalezen' })
  }

  const mime = file.type || 'application/octet-stream'
  if (!ALLOWED_MIME.has(mime)) {
    throw createError({ statusCode: 400, statusMessage: `Nepodporovaný typ souboru: ${mime}` })
  }
  if (file.data.length > MAX_SIZE) {
    throw createError({ statusCode: 413, statusMessage: 'Soubor je příliš velký (max 12 MB)' })
  }

  // Convert → WebP, downscale to MAX_EDGE, strip metadata. GIFs are treated as
  // animated so they don't collapse to a single frame.
  const isGif = mime === 'image/gif'
  let out: Buffer
  try {
    out = await sharp(file.data, isGif ? { animated: true } : {})
      .rotate() // respect EXIF orientation before we strip metadata
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toBuffer()
  } catch (err: any) {
    throw createError({ statusCode: 422, statusMessage: 'Obrázek se nepodařilo zpracovat.' })
  }

  const fileName = `${Date.now()}-${randomBytes(4).toString('hex')}.webp`

  if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true })
  await writeFile(resolve(UPLOAD_DIR, fileName), out)

  const url = `${PUBLIC_URL_BASE}/${fileName}`
  return { url, path: url }
})
