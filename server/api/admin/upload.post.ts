import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { requireAdmin } from '~~/server/utils/session'
import { saveProductImage } from '~~/server/utils/image-store'

const PUBLIC_URL_BASE = '/uploads/products'

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'])
const MAX_SIZE = 12 * 1024 * 1024 // 12 MB in (we re-encode down hard anyway)

// Every product photo is re-encoded to WebP and capped in size on upload, so the
// storefront only ever serves small, modern images no matter what the admin drops
// in (a 4 MB phone JPEG becomes a ~100–300 KB WebP). @nuxt/image/IPX still resizes
// per-breakpoint on top of this from the already-small source.
const MAX_EDGE = 1600   // px — longest side; plenty for a full-bleed product view
const WEBP_QUALITY = 80
// Encode cost is paid once per upload on the admin's click; the bytes are paid
// by every visitor forever. 6 is the highest effort that stays comfortably
// interactive (~1-2s for a phone photo on the VPS).
const WEBP_EFFORT = 6

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
      .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
      .toBuffer()
  } catch {
    throw createError({ statusCode: 422, statusMessage: 'Obrázek se nepodařilo zpracovat.' })
  }

  const fileName = `${Date.now()}-${randomBytes(4).toString('hex')}.webp`

  // Postgres first (the durable copy — production kept losing files written
  // only to disk), then the disk cache for IPX; both handled in the store.
  try {
    await saveProductImage(fileName, out, 'image/webp')
  } catch (err) {
    console.error('[upload] DB write failed:', err)
    throw createError({ statusCode: 500, statusMessage: 'Obrázek se nepodařilo uložit. Zkus to prosím znovu.' })
  }

  const url = `${PUBLIC_URL_BASE}/${fileName}`
  return { url, path: url }
})
