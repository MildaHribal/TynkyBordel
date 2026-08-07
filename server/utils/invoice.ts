import { BUSINESS, INVOICE_SELLER } from '~~/shared/shop'

// A simple Czech invoice ("faktura") for a non-VAT sole trader. Generated as a
// PDF with pdfkit and an embedded DejaVu Sans (the built-in PDF fonts can't render
// Czech diacritics). Returns a Buffer ready to attach to the confirmation email.

export type InvoiceData = {
  number: string | number          // faktura / order number
  issuedAt: Date
  customerName: string
  customerAddress: string          // multi-line allowed
  paymentMethod?: string | null
  variableSymbol?: string | number | null
  items: Array<{ title: string; quantity: number; price: number }>
  total: number
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Dobírka',
  'bank-transfer': 'Převodem na účet',
  card: 'Kartou přes PayPal',
  paypal: 'PayPal',
}

const czk = (n: number) => `${Math.round(n).toLocaleString('cs-CZ')} Kč`
const date = (d: Date) => d.toLocaleDateString('cs-CZ')

// Cache the embedded font buffers across invocations (they don't change).
let fontRegular: Buffer | null = null
let fontBold: Buffer | null = null
// Cache the logo buffer too. `undefined` = not tried yet, `null` = tried & failed.
let logo: Buffer | null | undefined = undefined

async function loadFonts() {
  if (fontRegular && fontBold) return
  const storage = useStorage('assets:server')
  const [r, b] = await Promise.all([
    storage.getItemRaw('invoice/DejaVuSans.ttf'),
    storage.getItemRaw('invoice/DejaVuSans-Bold.ttf'),
  ])
  fontRegular = Buffer.isBuffer(r) ? r : Buffer.from(r as ArrayBuffer)
  fontBold = Buffer.isBuffer(b) ? b : Buffer.from(b as ArrayBuffer)
}

async function loadLogo(): Promise<Buffer | null> {
  if (logo !== undefined) return logo
  try {
    const raw = await useStorage('assets:server').getItemRaw('invoice/logo.png')
    logo = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer)
  } catch {
    logo = null
  }
  return logo
}

export async function generateInvoicePdf(data: InvoiceData): Promise<Buffer> {
  await loadFonts()
  const { default: PDFDocument } = await import('pdfkit')

  const doc = new PDFDocument({ size: 'A4', margin: 50 })
  doc.registerFont('body', fontRegular!)
  doc.registerFont('bold', fontBold!)
  doc.font('body')

  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))))

  const INK = '#1a1a1a'
  const MUTED = '#6b6b6b'
  const ACCENT = '#182a1c'
  const left = 50
  const right = 545

  // ── Header ──────────────────────────────────────────────────────────────
  // Optional eshop logo, top-left. Never let a logo failure break the PDF.
  let titleX = left
  try {
    const logoBuf = await loadLogo()
    if (logoBuf) {
      doc.image(logoBuf, left, 44, { width: 54 })
      titleX = left + 54 + 14
    }
  } catch {
    titleX = left
  }

  doc.fillColor(ACCENT).font('bold').fontSize(24).text('FAKTURA', titleX, 50)
  doc.font('body').fontSize(11).fillColor(MUTED)
    .text(`č. ${data.number}`, titleX, 80)
  doc.fillColor(INK).font('body').fontSize(10)
    .text('Tynky Bordel', right - 200, 52, { width: 200, align: 'right' })
    .fillColor(MUTED)
    .text(BUSINESS.domain, right - 200, 66, { width: 200, align: 'right' })

  doc.moveTo(left, 104).lineTo(right, 104).strokeColor('#e0e0e0').stroke()

  // ── Seller / Buyer ──────────────────────────────────────────────────────
  const col2 = 320
  let y = 122
  doc.fontSize(9).fillColor(MUTED).font('bold').text('DODAVATEL', left, y)
  doc.text('ODBĚRATEL', col2, y)
  y += 16
  doc.font('body').fontSize(11).fillColor(INK)
  doc.text(INVOICE_SELLER.name, left, y, { width: 240 })
  doc.text(data.customerName, col2, y, { width: 225 })
  y += 16
  doc.fontSize(10).fillColor(MUTED)
  const sellerLines = [
    INVOICE_SELLER.address.street,
    `${INVOICE_SELLER.address.zip} ${INVOICE_SELLER.address.city}`,
    `IČO: ${INVOICE_SELLER.ico}`,
    INVOICE_SELLER.isVatPayer ? `DIČ: ${BUSINESS.dic}` : 'Neplátce DPH',
  ]
  const buyerLines = String(data.customerAddress || '').split('\n').filter(Boolean)
  const sellerTop = y
  sellerLines.forEach((l, i) => doc.text(l, left, sellerTop + i * 14, { width: 240 }))
  buyerLines.forEach((l, i) => doc.text(l, col2, sellerTop + i * 14, { width: 225 }))

  y = sellerTop + Math.max(sellerLines.length, buyerLines.length) * 14 + 22

  // ── Meta row (issue date / VS / payment) ─────────────────────────────────
  doc.fontSize(9).fillColor(MUTED).font('bold')
  doc.text('DATUM VYSTAVENÍ', left, y)
  doc.text('ZPŮSOB PLATBY', col2, y)
  if (data.variableSymbol) doc.text('VARIABILNÍ SYMBOL', left, y + 30)
  doc.font('body').fontSize(11).fillColor(INK)
  doc.text(date(data.issuedAt), left, y + 13)
  doc.text(data.paymentMethod ? (PAYMENT_LABELS[data.paymentMethod] || data.paymentMethod) : '—', col2, y + 13)
  if (data.variableSymbol) doc.text(String(data.variableSymbol), left, y + 43)

  y += data.variableSymbol ? 74 : 44

  // ── Items table ──────────────────────────────────────────────────────────
  const cols = { desc: left, qty: 340, unit: 410, total: 490 }
  doc.rect(left, y, right - left, 22).fill(ACCENT)
  doc.fillColor('#ffffff').font('bold').fontSize(9)
  doc.text('POPIS', cols.desc + 8, y + 7)
  doc.text('MN.', cols.qty, y + 7, { width: 50, align: 'right' })
  doc.text('CENA/KS', cols.unit, y + 7, { width: 60, align: 'right' })
  doc.text('CELKEM', cols.total, y + 7, { width: 55, align: 'right' })
  y += 22

  doc.font('body').fontSize(10).fillColor(INK)
  for (const item of data.items) {
    const lineTotal = item.price * item.quantity
    const descHeight = doc.heightOfString(item.title, { width: 270 })
    const rowH = Math.max(22, descHeight + 10)
    doc.fillColor(INK).text(item.title, cols.desc + 8, y + 6, { width: 270 })
    doc.text(String(item.quantity), cols.qty, y + 6, { width: 50, align: 'right' })
    doc.text(czk(item.price), cols.unit, y + 6, { width: 60, align: 'right' })
    doc.text(czk(lineTotal), cols.total, y + 6, { width: 55, align: 'right' })
    y += rowH
    doc.moveTo(left, y).lineTo(right, y).strokeColor('#eeeeee').stroke()
  }

  // ── Total ────────────────────────────────────────────────────────────────
  y += 14
  doc.font('bold').fontSize(13).fillColor(ACCENT)
  doc.text('Celkem k úhradě', cols.unit - 120, y, { width: 180, align: 'right' })
  doc.text(czk(data.total), cols.total - 40, y, { width: 95, align: 'right' })

  // ── Footer ─────────────────────────────────────────────────────────────
  const footY = 760
  doc.font('body').fontSize(8).fillColor(MUTED)
  doc.text(
    `${INVOICE_SELLER.name} · IČO ${INVOICE_SELLER.ico} · ${INVOICE_SELLER.address.street}, ${INVOICE_SELLER.address.zip} ${INVOICE_SELLER.address.city} · Neplátce DPH · ${INVOICE_SELLER.email}`,
    left, footY, { width: right - left, align: 'center' },
  )

  doc.end()
  return done
}
