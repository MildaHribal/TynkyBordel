import { randomBytes } from 'node:crypto'
import { writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
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
const MAX_SIZE = 8 * 1024 * 1024 // 8 MB

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
    throw createError({ statusCode: 413, statusMessage: 'Soubor je příliš velký (max 8 MB)' })
  }

  const originalName = (file.filename || 'image').replace(/[^\w.\-]/g, '_')
  const ext = (originalName.includes('.') ? originalName.split('.').pop() : '') || mime.split('/')[1] || 'bin'
  const fileName = `${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`

  if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true })
  await writeFile(resolve(UPLOAD_DIR, fileName), file.data)

  const url = `${PUBLIC_URL_BASE}/${fileName}`
  return { url, path: url }
})
