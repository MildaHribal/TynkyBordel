import { requireAdmin } from '../../utils/session';
import { getSetting } from '../../utils/settings';
import {
  DEFAULT_TICKER,
  TICKER_MAX_ITEMS,
  TICKER_MAX_LENGTH,
  TICKER_SETTING_KEY,
  getTicker,
  parseTicker,
} from '../../utils/site-content';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const stored = parseTicker(await getSetting(TICKER_SETTING_KEY));

  return {
    ticker: await getTicker(),
    // So the editor can say "you're on the built-in text" rather than making the
    // owner guess whether their edit saved.
    isDefault: stored.length === 0,
    defaults: [...DEFAULT_TICKER],
    limits: { maxItems: TICKER_MAX_ITEMS, maxLength: TICKER_MAX_LENGTH },
  };
});
