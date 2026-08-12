/**
 * SPAYD (Short Payment Descriptor) — Czech instant-payment QR code format.
 *
 * Reference: https://qr-platba.cz/pro-vyvojare/specifikace-formatu/
 * Example: SPD*1.0*ACC:CZ6508000000192000145399*AM:350.00*CC:CZK*X-VS:1234*MSG:Objednavka 1234
 *
 * Configure via env:
 *   BANK_ACCOUNT_IBAN=CZ6508000000192000145399  (destination account)
 *   BANK_ACCOUNT_HOLDER="Tynky Bordel"          (only shown to customer, not in QR)
 */

// qrcode is a CJS module; use dynamic import to get compatible interop under Nitro.

export type SpaydArgs = {
  amount: number;
  variableSymbol: string | number;
  message?: string;
};

/**
 * Compute CZ IBAN from account number (with optional prefix) and 4-digit bank code.
 * Format: CZkk BBBB PPPPPP NNNNNNNNNN
 *   BBBB   = bank code
 *   PPPPPP = optional account prefix (left-padded to 6)
 *   NNNN…  = account number (left-padded to 10)
 * IBAN check digits per ISO 13616 (mod-97-10).
 */
export function computeCzIban(accountNumber: string, bankCode: string, prefix = ''): string {
  const bank = String(bankCode).padStart(4, '0');
  const pref = String(prefix || '').padStart(6, '0');
  const acc = String(accountNumber).padStart(10, '0');
  const bban = bank + pref + acc;
  // Move country code + "00" to end, convert letters (C=12, Z=35), compute mod 97.
  const numeric = bban + '123500'; // "CZ00" → 12 35 00
  // Mod 97 using string chunking (BigInt is fine, but chunking is portable).
  let mod = 0;
  for (const ch of numeric) mod = (mod * 10 + Number(ch)) % 97;
  const check = String(98 - mod).padStart(2, '0');
  return `CZ${check}${bban}`;
}

/**
 * Czech domestic account-number checksum (ČNB vyhláška 169/2011: weights
 * 6,3,7,9,10,5,8,4,2,1, sum mod 11 must be 0; same rule for the prefix with its
 * own weights 10,5,8,4,2,1).
 *
 * This exists because production shipped with a typo'd account number for
 * weeks: the QR encoded a syntactically perfect SPAYD whose account fails this
 * checksum, so every banking app refused it as "invalid" while all our
 * IBAN/format validation passed — the IBAN check digits are computed OVER the
 * typo and can't catch it. Banking apps validate the domestic checksum; so
 * must we, before the number reaches a customer.
 */
export function czAccountNumberValid(number: string, prefix = ''): boolean {
  const check = (digits: string, weights: number[]) => {
    const d = digits.padStart(weights.length, '0');
    if (!/^\d+$/.test(d) || d.length > weights.length) return false;
    return d.split('').reduce((a, c, i) => a + Number(c) * weights[i]!, 0) % 11 === 0;
  };
  const numberOk = check(String(number), [6, 3, 7, 9, 10, 5, 8, 4, 2, 1]);
  const prefixOk = !prefix || check(String(prefix), [10, 5, 8, 4, 2, 1]);
  return numberOk && prefixOk;
}

/** Same env-quote hygiene as the mailer — a Docker env_file keeps quotes. */
function cleanEnv(key: string): string {
  const raw = process.env[key];
  if (raw == null) return '';
  return raw.trim().replace(/^(['"])([\s\S]*)\1$/, '$2').trim();
}

/**
 * The destination account, database first, env second.
 *
 * The database half exists for the same reason the SMTP settings moved there:
 * the VPS is deployed as a prebuilt image, `.env.production` needs SSH nobody
 * here has, and a typo'd BANK_ACCOUNT_NUMBER in it was unfixable — customers
 * were being handed a payment QR for an account that does not exist. Values
 * saved from /admin/emails/smtp override the env vars; a box with a correct
 * env keeps working untouched.
 */
export async function getBankAccount() {
  const { getSetting } = await import('./settings');
  const pick = async (dbKey: string, envKey: string) => (await getSetting(dbKey)) || cleanEnv(envKey);

  const explicitIban = await pick('bank_account_iban', 'BANK_ACCOUNT_IBAN');
  const number = await pick('bank_account_number', 'BANK_ACCOUNT_NUMBER');
  const bank = await pick('bank_account_bank_code', 'BANK_ACCOUNT_BANK_CODE');
  const prefix = await pick('bank_account_prefix', 'BANK_ACCOUNT_PREFIX');
  const holder = (await pick('bank_account_holder', 'BANK_ACCOUNT_HOLDER')) || 'Tynky Bordel';

  let iban = explicitIban;
  if (!iban && number && bank) {
    iban = computeCzIban(number, bank, prefix);
  }

  return {
    iban,
    holder,
    // Local-format display (e.g. "8294444956/5500") for humans reading the details.
    localFormat: number && bank ? `${prefix ? prefix + '-' : ''}${number}/${bank}` : '',
    // Surfaced so diagnostics can say WHY a QR is being refused by banks.
    checksumOk: number ? czAccountNumberValid(number, prefix) : Boolean(explicitIban),
  };
}

/**
 * SPAYD values must be plain ASCII and must not contain `*` (the field
 * separator) — a stray one silently splits the payload into fields the banking
 * app cannot parse, which is exactly the "invalid QR" a customer would report.
 * Diacritics are decomposed and their accents dropped, so "Tynky Bordel s.r.o."
 * survives and "Tyňky" becomes "Tynky" rather than being blanked out.
 */
function asciiField(value: string | undefined, maxLength: number): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Build SPAYD payment string. Returns empty string if IBAN is not configured.
 * Message is stripped of non-ASCII and truncated to 60 chars per spec.
 */
export async function buildSpayd({ amount, variableSymbol, message }: SpaydArgs): Promise<string> {
  const { iban, holder, checksumOk } = await getBankAccount();
  if (!iban) return '';
  // Refuse to emit a QR for an account banking apps will reject — the details
  // block (rendered from the same source) at least lets a human spot the typo,
  // whereas a broken QR just reads as "the shop is broken".
  if (!checksumOk) {
    console.error('[spayd] bank account fails the CZ checksum — payment QR suppressed. Fix the account at /admin/emails/smtp.');
    return '';
  }

  const parts = [
    'SPD*1.0',
    `ACC:${iban}`,
    `AM:${amount.toFixed(2)}`,
    'CC:CZK',
  ];

  // Recipient name. Optional in the spec, but banking apps show it on the
  // confirmation screen and some refuse to pre-fill a payment without knowing
  // who it is going to — a nameless payment reads as suspicious to both the app
  // and the customer. ASCII-only and ≤35 chars, same rule the spec puts on MSG.
  const recipient = asciiField(holder, 35);
  if (recipient) parts.push(`RN:${recipient}`);

  // Variable symbol: digits only, max 10 — the spec is strict here and a
  // non-numeric value makes the whole descriptor invalid.
  const vs = String(variableSymbol).replace(/\D/g, '').slice(0, 10);
  if (vs) parts.push(`X-VS:${vs}`);

  const clean = asciiField(message, 60);
  if (clean) parts.push(`MSG:${clean}`);

  return parts.join('*');
}

/**
 * Generate a data-URL PNG QR code for the given SPAYD string.
 * Returns null if generation fails or the payload is empty.
 */
export async function spaydToDataUrl(spayd: string): Promise<string | null> {
  if (!spayd) return null;
  try {
    const mod: any = await import('qrcode');
    const toDataURL = mod.toDataURL || mod.default?.toDataURL;
    if (typeof toDataURL !== 'function') {
      console.error('[spayd] qrcode.toDataURL not found on module');
      return null;
    }
    return await toDataURL(spayd, {
      errorCorrectionLevel: 'M',
      // 4 modules is the quiet zone the QR standard requires. This used to be 1,
      // which strict scanners — bank apps among them — are entitled to reject.
      margin: 4,
      width: 400,
      color: { dark: '#000000', light: '#FFFFFF' },
    });
  } catch (err) {
    console.error('[spayd] QR generation failed:', err);
    return null;
  }
}

/**
 * Generate a PNG Buffer QR code for the given SPAYD string.
 * Used for email — inbox clients (Gmail, Seznam, Outlook) block `data:` URI
 * images, so the QR must be sent as a CID inline attachment instead.
 * Returns null if generation fails or the payload is empty.
 */
export async function spaydToBuffer(spayd: string): Promise<Buffer | null> {
  if (!spayd) return null;
  try {
    const mod: any = await import('qrcode');
    const toBuffer = mod.toBuffer || mod.default?.toBuffer;
    if (typeof toBuffer !== 'function') {
      console.error('[spayd] qrcode.toBuffer not found on module');
      return null;
    }
    return await toBuffer(spayd, {
      errorCorrectionLevel: 'M',
      // 4 modules is the quiet zone the QR standard requires. This used to be 1,
      // which strict scanners — bank apps among them — are entitled to reject.
      margin: 4,
      width: 400,
      color: { dark: '#000000', light: '#FFFFFF' },
    });
  } catch (err) {
    console.error('[spayd] QR buffer generation failed:', err);
    return null;
  }
}
