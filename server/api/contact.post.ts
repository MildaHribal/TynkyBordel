import { sendContactMessage } from '../utils/email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_NAME = 100;
const MAX_MESSAGE = 5000;

/**
 * Contact form receiver. Delivers the message to the shop mailbox with the
 * sender's address as Reply-To.
 *
 * Rate limiting is handled globally in server/middleware/rate-limit.ts (the
 * generic 60/min POST bucket).
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const name = String(body?.name || '').trim();
  const email = String(body?.email || '').trim();
  const message = String(body?.message || '').trim();

  if (!name || !email || !message) {
    throw createError({ statusCode: 400, statusMessage: 'Vyplň prosím jméno, e-mail i zprávu.' });
  }
  if (!EMAIL_RE.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Zadaný e-mail nemá správný formát.' });
  }
  if (name.length > MAX_NAME) {
    throw createError({ statusCode: 400, statusMessage: 'Jméno je příliš dlouhé.' });
  }
  if (message.length > MAX_MESSAGE) {
    throw createError({ statusCode: 400, statusMessage: 'Zpráva je příliš dlouhá (max 5000 znaků).' });
  }
  // Header-injection guard: a newline in these fields must never reach the
  // Reply-To / subject line.
  if (/[\r\n]/.test(name) || /[\r\n]/.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Neplatný vstup.' });
  }

  const sent = await sendContactMessage({ name, email, message });
  if (!sent) {
    // Either SMTP isn't configured or the send failed — never pretend it worked.
    throw createError({
      statusCode: 503,
      statusMessage: 'Zprávu se teď nepodařilo odeslat. Napiš nám prosím přímo na info@tynkybordel.shop.',
    });
  }

  return { ok: true };
});
