/**
 * Fakturoid API v3 client (server-side).
 *
 * Configure via env (see .env.production.example):
 *   FAKTUROID_CLIENT_ID=...
 *   FAKTUROID_CLIENT_SECRET=...
 *   FAKTUROID_SLUG=miroslavturhobr
 *
 * Three things about this API are easy to get wrong and cost a debugging
 * session each, so they are enforced here rather than left to call sites:
 *
 *  1. Auth is the OAuth 2.0 **client credentials** flow, not authorization
 *     code — this is one account talking to its own service, there is no user
 *     to redirect.
 *  2. The account slug goes in the PATH: `/api/v3/accounts/{slug}/...`.
 *     Dropping the `accounts` segment gives confusing 404s.
 *  3. A `User-Agent` identifying the app is **mandatory on every request**.
 *     Without it the API rejects the call with 400.
 *
 * The seller is a Czech sole trader and NOT a VAT payer, so invoice lines here
 * never carry `vat_rate`.
 */

const API_ROOT = 'https://app.fakturoid.cz/api/v3'

// Fakturoid requires a UA that identifies the application and gives them a
// contact address for it.
const USER_AGENT = 'TynkyBordel (info@tynkybordel.shop)'

export function fakturoidConfigured(): boolean {
  return Boolean(
    process.env.FAKTUROID_CLIENT_ID
    && process.env.FAKTUROID_CLIENT_SECRET
    && process.env.FAKTUROID_SLUG,
  )
}

function requireConfig() {
  if (!fakturoidConfigured()) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Fakturoid není nakonfigurován (chybí přihlašovací údaje).',
    })
  }
  return {
    clientId: process.env.FAKTUROID_CLIENT_ID!,
    clientSecret: process.env.FAKTUROID_CLIENT_SECRET!,
    slug: process.env.FAKTUROID_SLUG!,
  }
}

// ── Money ───────────────────────────────────────────────────────────────────

/**
 * Convert integer haléře to the decimal string Fakturoid expects.
 *
 * Money moves through this codebase as whole haléře precisely so no float ever
 * touches it; this is the single place that crosses back into decimals, and it
 * does so with integer arithmetic + string assembly rather than division, so
 * 249_90 can never become 249.90000000000003.
 */
export function halereToDecimalString(halere: number): string {
  if (!Number.isInteger(halere)) {
    throw new Error(`Amount must be an integer number of haléře, got ${halere}`)
  }
  const negative = halere < 0
  const abs = Math.abs(halere)
  const whole = Math.trunc(abs / 100)
  const cents = abs % 100
  return `${negative ? '-' : ''}${whole}.${String(cents).padStart(2, '0')}`
}

// ── Access token ────────────────────────────────────────────────────────────

interface TokenState {
  value: string
  /** Epoch ms after which the token must not be used any more. */
  expiresAt: number
}

let token: TokenState | null = null
// Concurrent callers must share one in-flight request. Without this, a burst of
// parallel calls each opens its own token request and the later responses
// invalidate the earlier ones.
let tokenRequest: Promise<string> | null = null

// Refresh this long before the stated expiry, so a token can't lapse between
// the check and the request landing at Fakturoid.
const EXPIRY_MARGIN_MS = 60_000

async function requestToken(): Promise<string> {
  const { clientId, clientSecret } = requireConfig()
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await $fetch<{ access_token: string, expires_in: number }>(
    `${API_ROOT}/oauth/token`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: { grant_type: 'client_credentials' },
    },
  )

  token = {
    value: res.access_token,
    // Fall back to a conservative 2 h if the field is ever missing; the 401
    // retry below is the real safety net.
    expiresAt: Date.now() + (res.expires_in ? res.expires_in * 1000 : 7200_000),
  }
  return token.value
}

async function accessToken(forceRefresh = false): Promise<string> {
  if (forceRefresh) {
    token = null
    tokenRequest = null
  }
  if (token && Date.now() < token.expiresAt - EXPIRY_MARGIN_MS) {
    return token.value
  }
  if (!tokenRequest) {
    tokenRequest = requestToken().finally(() => { tokenRequest = null })
  }
  return tokenRequest
}

// ── Low-level request ───────────────────────────────────────────────────────

interface FakturoidRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | undefined>
  /** `json` (default) or `arrayBuffer` for the PDF download. */
  responseType?: 'json' | 'arrayBuffer'
}

export interface FakturoidResponse<T> {
  status: number
  data: T
}

/**
 * Perform an authenticated request against the account's API root.
 *
 * `path` is relative to `/accounts/{slug}` — e.g. `/invoices`.
 *
 * Errors are re-thrown with Fakturoid's own response body attached. Their 422
 * payloads name the offending field, which is the difference between an admin
 * seeing "vystavení faktury selhalo" and seeing which field is wrong.
 */
export async function fakturoidFetch<T = any>(
  path: string,
  opts: FakturoidRequest = {},
  _isRetry = false,
): Promise<FakturoidResponse<T>> {
  const { slug } = requireConfig()
  const bearer = await accessToken()

  try {
    const res = await $fetch.raw(`${API_ROOT}/accounts/${slug}${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${bearer}`,
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json',
      },
      query: opts.query,
      body: opts.body as any,
      responseType: opts.responseType === 'arrayBuffer' ? 'arrayBuffer' : 'json',
    })
    return { status: res.status, data: res._data as T }
  } catch (err: any) {
    const status: number | undefined = err?.response?.status ?? err?.statusCode

    // The cached token can be revoked server-side; get a fresh one and retry
    // exactly once so a revocation doesn't surface as a failed invoice.
    if (status === 401 && !_isRetry) {
      await accessToken(true)
      return fakturoidFetch<T>(path, opts, true)
    }

    // Respect Retry-After on rate limiting, once.
    if (status === 429 && !_isRetry) {
      const retryAfter = Number(err?.response?.headers?.get?.('retry-after')) || 2
      await sleep(Math.min(retryAfter, 30) * 1000)
      return fakturoidFetch<T>(path, opts, true)
    }

    const detail = err?.data ? ` — ${JSON.stringify(err.data)}` : ''
    throw createError({
      statusCode: 502,
      statusMessage: `Fakturoid: ${opts.method ?? 'GET'} ${path} selhalo (${status ?? 'network'})${detail}`,
    })
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// ── Subjects (customers) ────────────────────────────────────────────────────

export interface SubjectInput {
  email: string
  name: string
  street?: string | null
  city?: string | null
  zip?: string | null
  phone?: string | null
}

/**
 * Normalised lookup key for a customer.
 *
 * The `fakturoid_subjects` unique index is a plain btree and therefore
 * case-sensitive, so `Jan@Example.cz` and `jan@example.cz` would each get their
 * own row — and their own duplicate subject in Fakturoid. Every read and write
 * of that table must go through this.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Find a subject by e-mail, or create one.
 *
 * Fakturoid's own search is used as the source of truth rather than trusting a
 * local mapping blindly — a subject deleted in Fakturoid would otherwise leave
 * a stale id behind that fails at invoice time.
 */
export async function findOrCreateSubject(input: SubjectInput): Promise<number> {
  const email = normaliseEmail(input.email)

  const found = await fakturoidFetch<Array<{ id: number, email: string }>>(
    '/subjects/search.json',
    { query: { query: email } },
  )
  const match = (found.data ?? []).find(s => normaliseEmail(s.email ?? '') === email)
  if (match) return match.id

  const created = await fakturoidFetch<{ id: number }>('/subjects.json', {
    method: 'POST',
    body: {
      name: input.name,
      email,
      street: input.street || undefined,
      city: input.city || undefined,
      zip: input.zip || undefined,
      phone: input.phone || undefined,
    },
  })
  return created.data.id
}

// ── Invoices ────────────────────────────────────────────────────────────────

export interface InvoiceLine {
  name: string
  quantity: number
  /** Unit price in integer haléře. */
  unitPriceHalere: number
}

export interface CreateInvoiceInput {
  subjectId: number
  /** Order number — also used as the variable symbol. */
  variableSymbol: string
  paymentMethod: 'bank' | 'cod'
  lines: InvoiceLine[]
  note?: string
}

export interface FakturoidInvoice {
  id: number
  number: string
  [key: string]: unknown
}

/**
 * Create an invoice.
 *
 * Note there is no `vat_rate` anywhere: the seller is not a VAT payer, and
 * sending one would put a VAT breakdown on a document that must not have it.
 */
export async function createInvoice(input: CreateInvoiceInput): Promise<FakturoidInvoice> {
  const res = await fakturoidFetch<FakturoidInvoice>('/invoices.json', {
    method: 'POST',
    body: {
      subject_id: input.subjectId,
      variable_symbol: input.variableSymbol,
      payment_method: input.paymentMethod,
      note: input.note,
      lines: input.lines.map(line => ({
        name: line.name,
        quantity: line.quantity,
        unit_price: halereToDecimalString(line.unitPriceHalere),
      })),
    },
  })
  return res.data
}

/** Fetch a single invoice (used to re-read state after an interrupted issue). */
export async function getInvoice(id: number): Promise<FakturoidInvoice> {
  const res = await fakturoidFetch<FakturoidInvoice>(`/invoices/${id}.json`)
  return res.data
}

// PDF rendering is asynchronous on Fakturoid's side, so the first few calls can
// legitimately answer 204 with no body. These delays sum to ~15 s.
const PDF_RETRY_DELAYS_MS = [500, 1000, 2000, 3000, 4000, 5000]

/**
 * Download an invoice PDF.
 *
 * `/invoices/{id}/download.pdf` returns **204 No Content** while the document
 * is still being rendered. Retries with a growing delay and throws if it never
 * arrives — it must never return an empty buffer, because the caller archives
 * whatever it gets and a 0-byte invoice is worse than a failed one.
 */
export async function downloadInvoicePdf(id: number): Promise<Buffer> {
  for (let attempt = 0; attempt <= PDF_RETRY_DELAYS_MS.length; attempt++) {
    const res = await fakturoidFetch<ArrayBuffer>(
      `/invoices/${id}/download.pdf`,
      { responseType: 'arrayBuffer' },
    )

    if (res.status !== 204 && res.data) {
      const buf = Buffer.from(res.data)
      if (buf.length > 0) return buf
    }

    const delay = PDF_RETRY_DELAYS_MS[attempt]
    if (delay === undefined) break
    await sleep(delay)
  }

  throw createError({
    statusCode: 504,
    statusMessage: `Fakturoid nestihl vygenerovat PDF faktury ${id}. Zkus to prosím znovu za chvíli.`,
  })
}

/** Test-only hook: drop the cached token so a test can exercise a fresh fetch. */
export function __resetFakturoidTokenCache() {
  token = null
  tokenRequest = null
}
