/**
 * Contact-detail validation shared by the checkout page and the order API.
 *
 * Lives in `shared/` (not `server/utils/`) because BOTH sides must run the exact
 * same rules — `shared/shop.ts` is the established place in this repo for code
 * imported by a `.vue` and by Nitro alike. Pulling a `server/utils/*` file into
 * the client bundle works only by accident (no h3 auto-imports allowed in it)
 * and reads like a leak; `shared/` is the supported path.
 *
 * Everything here is pure and dependency-free — no zod, no libphonenumber — so
 * it can be unit-tested by importing the module and nothing else.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Phone
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Country prefixes we accept. The shop ships to Z-BOX / Balíkovna pickup points
 * in Czechia, and Slovak customers ordering to a Czech box are plausible enough
 * (shared language, Packeta operates in both) that rejecting +421 would cost
 * real orders. Everything else is rejected with an explicit message rather than
 * dragged through a hand-rolled country table we'd never keep correct.
 *
 * CZ and SK share the same shape: 9 significant digits, no trunk prefix, and a
 * leading digit of 2–9 (0 and 1 are reserved — 1xx are short/service codes).
 */
const DIAL_CODES = ['420', '421'] as const;

/** 9 digits, first one 2–9. Covers CZ mobile (6/7), CZ landline (2–5), SK (2–5/9). */
const NATIONAL_NUMBER = /^[2-9]\d{8}$/;

/** Only these may appear in raw input — digits plus the usual human decoration. */
const ALLOWED_PHONE_CHARS = /^[+\d\s()./-]+$/;

/**
 * Reduce a typed phone number to canonical E.164, e.g. `+420777123456`.
 *
 * Accepts every spelling a real customer produces: `777123456`,
 * `777 123 456`, `777-123-456`, `(777) 123 456`, `+420 777 123 456`,
 * `00420777123456`, `420777123456`. A bare 9-digit number is assumed Czech.
 *
 * @returns the canonical form, or `null` when the input isn't a valid CZ/SK number.
 */
export function normalisePhone(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const input = String(raw).trim();
  if (!input) return null;

  // Letters, emoji, a second "+" mid-string → not a phone number.
  if (!ALLOWED_PHONE_CHARS.test(input)) return null;
  if (input.indexOf('+') > 0) return null;

  const hadPlus = input.startsWith('+');
  let digits = input.replace(/\D/g, '');
  if (!digits) return null;

  // "00420…" is the same as "+420…" (IDD prefix instead of the plus).
  if (!hadPlus && digits.startsWith('00')) digits = digits.slice(2);

  for (const code of DIAL_CODES) {
    if (digits.startsWith(code) && digits.length === code.length + 9) {
      const national = digits.slice(code.length);
      return NATIONAL_NUMBER.test(national) ? `+${code}${national}` : null;
    }
  }

  // No country code: only a bare national number is acceptable, and only when
  // the user didn't type a "+" (a "+" means they meant a country code).
  if (!hadPlus && NATIONAL_NUMBER.test(digits)) return `+420${digits}`;

  return null;
}

/**
 * True when `raw` is a phone number we can actually deliver an SMS to (CZ +420
 * or SK +421). Named for the primary market; SK is accepted as documented above.
 */
export function isValidCzechPhone(raw: unknown): boolean {
  return normalisePhone(raw) !== null;
}

/**
 * A Czech, second-person error message for the offending field — or `''` when
 * the number is fine. Split out from the boolean so the page can explain *what*
 * is wrong instead of just painting the box red.
 */
export function phoneErrorMessage(raw: unknown): string {
  const input = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '';
  if (!input) return 'Doplň telefon — bez něj ti dopravce nepošle SMS o doručení.';
  if (isValidCzechPhone(input)) return '';

  if (!ALLOWED_PHONE_CHARS.test(input) || input.indexOf('+') > 0) {
    return 'Telefon může obsahovat jen číslice, mezery a předvolbu (např. +420 777 123 456).';
  }

  const hadPlus = input.startsWith('+');
  let digits = input.replace(/\D/g, '');
  if (!hadPlus && digits.startsWith('00')) digits = digits.slice(2);

  // Looks like a foreign number — say so, don't pretend it's a typo.
  const knownCode = DIAL_CODES.find((c) => digits.startsWith(c));
  if ((hadPlus || input.startsWith('00')) && !knownCode) {
    return 'Posíláme jen do Česka a na Slovensko — zadej číslo s předvolbou +420 nebo +421.';
  }

  const national = knownCode ? digits.slice(knownCode.length) : digits;
  if (national.length !== 9) {
    return 'Telefon musí mít 9 číslic (např. 777 123 456).';
  }
  return 'Telefon nezačíná správně — zkontroluj ho, mobil má tvar 777 123 456.';
}

// ─────────────────────────────────────────────────────────────────────────────
// E-mail
// ─────────────────────────────────────────────────────────────────────────────

/** RFC's practical limit for the whole address. */
const MAX_EMAIL_LENGTH = 254;
/** RFC 5321 limit for the part before the "@". */
const MAX_LOCAL_LENGTH = 64;

/**
 * Deliberately pragmatic, not RFC 5322. The characters below are the ones
 * consumer mailboxes actually use — crucially including "+", because rejecting
 * Gmail aliases (jan+eshop@gmail.com) is a classic self-inflicted bug.
 */
const LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
/** At least two labels, so `a@b` fails; TLD is 2+ letters. */
const DOMAIN_PART = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

/** True when the address is worth sending an order confirmation to. */
export function isValidEmail(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const value = raw.trim();
  if (!value || value.length > MAX_EMAIL_LENGTH) return false;
  if (/\s/.test(value)) return false;

  const parts = value.split('@');
  if (parts.length !== 2) return false; // exactly one "@"

  const [local, domain] = parts as [string, string];
  if (!local || local.length > MAX_LOCAL_LENGTH) return false;
  if (!domain || domain.length > 253) return false;
  if (value.includes('..')) return false;

  return LOCAL_PART.test(local) && DOMAIN_PART.test(domain);
}

/**
 * Canonical storage form: surrounding whitespace dropped and the domain
 * lower-cased (domains are case-insensitive). The local part is left exactly as
 * typed — it is technically case-sensitive, and lower-casing it is a bet on the
 * receiving server that isn't ours to make.
 *
 * @returns the tidied address, or `''` when it isn't valid.
 */
export function normaliseEmail(raw: unknown): string {
  if (!isValidEmail(raw)) return '';
  const value = (raw as string).trim();
  const at = value.lastIndexOf('@');
  return `${value.slice(0, at)}@${value.slice(at + 1).toLowerCase()}`;
}

/** Czech, second-person error message for the e-mail field — `''` when valid. */
export function emailErrorMessage(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return 'Doplň e-mail — pošleme na něj potvrzení objednávky.';
  if (isValidEmail(value)) return '';
  if (value.length > MAX_EMAIL_LENGTH) return 'E-mail je nesmyslně dlouhý — zkontroluj ho.';
  if (!value.includes('@')) return 'V e-mailu chybí zavináč (např. jan@email.cz).';
  return 'E-mail nemá správný tvar — zkus to jako jan@email.cz.';
}
