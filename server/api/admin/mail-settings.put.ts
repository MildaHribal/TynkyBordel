import { requireAdmin } from '../../utils/session';
import { getMailConfig, invalidateMailTransport, verifyMail } from '../../utils/email';
import { saveSettings } from '../../utils/settings';

/**
 * Store SMTP configuration in the database, from the browser.
 *
 * This is the shop's only way to fix transactional email: the container is built
 * by CI and `.env.production` needs SSH access nobody here has. Saved values take
 * precedence over the env vars (see server/utils/email.ts).
 *
 * Field semantics:
 *   - a provided empty string CLEARS the override, handing the field back to env
 *   - `smtp_pass` absent from the body leaves the stored password untouched, so
 *     the UI never has to round-trip the secret it was never shown
 */

const TEXT_FIELDS = ['smtp_host', 'smtp_user', 'mail_from', 'order_notification_email'] as const;

export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const body = await readBody(event);
  const updates: Record<string, string> = {};

  for (const field of TEXT_FIELDS) {
    if (!(field in body)) continue;
    updates[field] = String(body[field] ?? '').trim();
  }

  if ('smtp_port' in body) {
    const raw = String(body.smtp_port ?? '').trim();
    if (raw) {
      const port = Number(raw);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw createError({ statusCode: 400, statusMessage: 'Port musí být číslo 1–65535.' });
      }
      updates.smtp_port = String(port);
    } else {
      updates.smtp_port = '';
    }
  }

  if ('smtp_secure' in body) {
    const raw = String(body.smtp_secure ?? '').trim();
    if (raw && raw !== 'true' && raw !== 'false') {
      throw createError({ statusCode: 400, statusMessage: 'Šifrování musí být true nebo false.' });
    }
    updates.smtp_secure = raw;
  }

  if ('smtp_pass' in body) {
    updates.smtp_pass = String(body.smtp_pass ?? '');
  }

  for (const field of ['smtp_user', 'order_notification_email'] as const) {
    const value = updates[field];
    if (value && !value.includes('@')) {
      throw createError({ statusCode: 400, statusMessage: `Pole ${field} musí být e-mailová adresa.` });
    }
  }

  await saveSettings(updates);
  // The transport memoises host/credentials, so a save has to drop it or the new
  // password wouldn't apply until the next deploy.
  invalidateMailTransport();

  // Verify straight away: the whole point of this screen is finding out whether
  // the settings actually work, not whether they were written down.
  const verify = await verifyMail();
  const cfg = await getMailConfig();

  return { saved: Object.keys(updates), verify, passwordSet: cfg.passwordSet, sources: cfg.sources };
});
