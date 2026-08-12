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
  // Already paid → the payment QR is left out (nothing left to scan for).
  paid?: boolean
}

/**
 * Turn the stored shipping address into buyer-block lines.
 *
 * `orders.shipping_address` is a transport string: segments joined with " | ",
 * including `Tel: …` and `Doprava: …`, and for Zásilkovna orders the pickup
 * point often appears twice (once as the branch name, once as the street the
 * checkout filled in). Rendered raw it produced an unreadable blob that also
 * overflowed into the payment-method label. An invoice's ODBĚRATEL block is a
 * name and an address — contact and shipping details have their own places.
 */
function buyerAddressLines(raw: string): string[] {
  const seen = new Set<string>()
  return String(raw || '')
    .split(/\s*\|\s*|\n/)
    .map((s) => s.trim())
    .filter((s) => s && !/^tel:/i.test(s) && !/^doprava:/i.test(s))
    .filter((s) => {
      const key = s.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
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
  // A missing server asset comes back as null, and `Buffer.from(null)` throws an
  // opaque TypeError. Name the actual problem instead.
  if (!r || !b) {
    throw new Error(
      'Invoice fonts missing from server assets (invoice/DejaVuSans.ttf, invoice/DejaVuSans-Bold.ttf)',
    )
  }
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
  // MUST reject on error as well as resolve on end. With only the 'end' handler a
  // pdfkit failure left this promise pending forever — and because the caller
  // awaits it while building the order-confirmation email, that silently swallowed
  // the confirmation instead of sending it without the attachment.
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

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
  const buyerLines = buyerAddressLines(data.customerAddress)
  const sellerTop = y

  // Advance by the MEASURED height of each line, not a fixed 14pt step: a long
  // pickup-point line wraps inside its 225pt column, and pretending it is one
  // line tall made the whole block overlap the meta row below it.
  let sellerY = sellerTop
  for (const line of sellerLines) {
    doc.text(line, left, sellerY, { width: 240 })
    sellerY += Math.max(14, doc.heightOfString(line, { width: 240 }))
  }
  let buyerY = sellerTop
  for (const line of buyerLines) {
    doc.text(line, col2, buyerY, { width: 225 })
    buyerY += Math.max(14, doc.heightOfString(line, { width: 225 }))
  }

  y = Math.max(sellerY, buyerY) + 22

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

  // ── Payment QR (QR Platba) ─────────────────────────────────────────────
  // Only for unpaid bank transfers — the one case where the reader still has a
  // payment to make. Failures skip the box rather than break the invoice.
  if (data.paymentMethod === 'bank-transfer' && !data.paid) {
    try {
      const { buildSpayd, spaydToBuffer, getBankAccount } = await import('./spayd')
      const { iban, localFormat } = await getBankAccount()
      const spayd = await buildSpayd({
        amount: data.total,
        variableSymbol: data.variableSymbol ?? data.number,
        message: `Objednavka ${data.number}`,
      })
      const qr = spayd ? await spaydToBuffer(spayd) : null
      if (qr) {
        y += 40
        const boxH = 128
        doc.roundedRect(left, y, right - left, boxH, 8).strokeColor('#d8d8d8').stroke()
        doc.image(qr, left + 12, y + 12, { width: 104, height: 104 })

        const infoX = left + 132
        doc.font('bold').fontSize(11).fillColor(ACCENT).text('QR Platba', infoX, y + 14)
        doc.font('body').fontSize(9).fillColor(MUTED)
          .text('Naskenuj v bankovní aplikaci — částka, účet i variabilní symbol se vyplní samy.', infoX, y + 30, { width: right - infoX - 14 })

        const rows: Array<[string, string]> = [
          ['Účet', localFormat || iban],
          ['Variabilní symbol', String(data.variableSymbol ?? data.number)],
          ['Částka', czk(data.total)],
        ]
        let ry = y + 56
        for (const [label, value] of rows) {
          doc.font('body').fontSize(9).fillColor(MUTED).text(label, infoX, ry, { width: 110 })
          doc.font('bold').fontSize(10).fillColor(INK).text(value, infoX + 115, ry - 1, { width: right - infoX - 129 })
          ry += 20
        }
      }
    } catch (err) {
      console.error('[invoice] payment QR skipped:', err)
    }
  }

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
