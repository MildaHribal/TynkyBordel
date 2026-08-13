import { requireAdmin } from '../../utils/session';
import { saveSettings } from '../../utils/settings';
import {
  DEFAULT_TICKER,
  TICKER_MAX_ITEMS,
  TICKER_MAX_LENGTH,
  TICKER_SETTING_KEY,
  getTicker,
  parseTicker,
} from '../../utils/site-content';

/**
 * Save the storefront copy edited in /admin/obsah.
 *
 * An empty value clears the override and restores the built-in text, which is
 * what makes "vrátit výchozí" a delete rather than a second copy of the default
 * strings to keep in sync.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const body = await readBody(event);
  if (typeof body?.ticker !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Chybí text pruhu.' });
  }

  const lines = parseTicker(body.ticker);
  const raw = String(body.ticker).split('\n').map((l) => l.trim()).filter(Boolean);

  // Refuse silently-truncating input rather than accepting it and quietly
  // dropping what the owner typed.
  if (raw.length > TICKER_MAX_ITEMS) {
    throw createError({
      statusCode: 400,
      statusMessage: `Maximálně ${TICKER_MAX_ITEMS} textů — zadal jsi ${raw.length}.`,
    });
  }
  const tooLong = raw.find((l) => l.length > TICKER_MAX_LENGTH);
  if (tooLong) {
    throw createError({
      statusCode: 400,
      statusMessage: `Text „${tooLong.slice(0, 24)}…" je delší než ${TICKER_MAX_LENGTH} znaků.`,
    });
  }

  // Blank → delete the row → the storefront falls back to DEFAULT_TICKER.
  await saveSettings({ [TICKER_SETTING_KEY]: lines.join('\n') });

  return { ticker: await getTicker(), isDefault: lines.length === 0, defaults: [...DEFAULT_TICKER] };
});
