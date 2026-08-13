import { getSetting } from './settings';

/**
 * Editable storefront copy.
 *
 * Currently just the pink marquee under the hero. It lived as a hardcoded array
 * in app/pages/index.vue, so changing four words meant a code change and a
 * deploy — for the one piece of text on the shop most likely to change with a
 * promotion or a shipping delay.
 *
 * Stored in app_settings (same table as the SMTP config) rather than its own
 * table: it is a handful of strings, and the settings cache already keeps reads
 * off the database on every page render.
 */

export const TICKER_SETTING_KEY = 'home_ticker';

/** What the shop shipped with, and what an empty setting falls back to. */
export const DEFAULT_TICKER = [
  'odesílám do 2 dnů',
  'handmade',
  'platba převodem i dobírkou',
  'made with passion',
] as const;

export const TICKER_MAX_ITEMS = 12;
export const TICKER_MAX_LENGTH = 60;

/**
 * One phrase per line, which is the least fiddly thing to type and the easiest
 * to reason about. Blank lines are dropped so a stray Enter can't produce a gap
 * in the strip.
 */
export function parseTicker(raw: string | undefined | null): string[] {
  return String(raw ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, TICKER_MAX_ITEMS)
    .map((line) => line.slice(0, TICKER_MAX_LENGTH));
}

/** The marquee as the storefront should render it — never empty. */
export async function getTicker(): Promise<string[]> {
  const stored = parseTicker(await getSetting(TICKER_SETTING_KEY));
  return stored.length ? stored : [...DEFAULT_TICKER];
}
