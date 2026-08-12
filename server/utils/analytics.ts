import { createHash } from 'node:crypto';
import { desc, gte, sql as raw } from 'drizzle-orm';
import { db } from './db';
import { pageViews, pageViewVisitors } from '../database/schema';

/**
 * Cookie-free traffic counting.
 *
 * PostHog is wired into this shop but sits behind opt-in cookie consent, so it
 * only ever counts visitors who click "accept" — useless for answering "how many
 * people came to my shop". This counts on the server from what the request
 * already carries, so it sees everyone, and stores nothing personal:
 *
 *   visitor = sha256(secret · today · ip · user-agent).slice(0, 32)
 *
 * The salt changes with the date, so the same person on two days produces two
 * unrelated hashes and the series cannot be used to follow anybody around. The
 * IP is never written to disk. Same design as Plausible/Fathom, which is what
 * makes it lawful without a consent banner.
 *
 * Counts are buffered in memory and flushed in batches — a shop page must never
 * wait on an analytics write, and a busy minute must not become a write storm.
 */

const FLUSH_INTERVAL_MS = 30_000;
/** Safety valve: flush early if a burst fills the buffer. */
const MAX_BUFFERED_PATHS = 500;
/** Visitor hashes older than this are pruned — the daily totals are kept. */
const VISITOR_RETENTION_DAYS = 90;

/** Never counted: assets, APIs, the admin, and the machinery of the site itself. */
const IGNORED_PREFIXES = [
  '/api/', '/_nuxt/', '/_fonts/', '/_ipx/', '/uploads/', '/pwa/', '/admin',
  '/.well-known/', '/@vite', '/__nuxt',
];
const IGNORED_EXACT = new Set([
  '/favicon.ico', '/robots.txt', '/sitemap.xml', '/manifest.webmanifest',
  '/sw.js', '/admin-sw.js',
]);

// Crawlers are traffic, but they are not visitors, and counting them makes the
// number a lie. Deliberately broad — a missed human costs less than a counted bot.
const BOT_RE = /bot|crawler|spider|crawling|slurp|facebookexternalhit|preview|scan|curl|wget|python-requests|node-fetch|headless|lighthouse|pingdom|uptime|monitor|semrush|ahrefs|dataprovider|phantom|axios/i;

export function isCountablePath(path: string): boolean {
  if (!path || !path.startsWith('/')) return false;
  const clean = path.split('?')[0]!;
  if (IGNORED_EXACT.has(clean)) return false;
  if (IGNORED_PREFIXES.some((p) => clean.startsWith(p))) return false;
  // Anything that looks like a file (has an extension) is an asset, not a page.
  // `_payload.json` is handled by the caller before this, because it IS a page
  // view — the one a client-side route change produces.
  if (/\.[a-z0-9]{2,5}$/i.test(clean)) return false;
  return true;
}

export function isBot(userAgent: string | undefined): boolean {
  if (!userAgent) return true; // no UA at all is a script, not a person
  return BOT_RE.test(userAgent);
}

/**
 * Nuxt fetches `/some/route/_payload.json` when the visitor navigates
 * client-side. Those are real page views and would otherwise be invisible,
 * since the SPA never asks the server for the HTML again.
 */
export function normalisePath(path: string): string {
  const clean = path.split('?')[0]!.replace(/\/+$/, '') || '/';
  if (clean.endsWith('/_payload.json')) {
    return clean.slice(0, -'/_payload.json'.length) || '/';
  }
  return clean;
}

export function today(): string {
  // Prague, not UTC — "yesterday's visits" should mean the owner's yesterday.
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' });
}

export function visitorHash(ip: string, userAgent: string, day: string): string {
  const secret = process.env.BETTER_AUTH_SECRET || 'shopik-analytics';
  return createHash('sha256').update(`${secret}:${day}:${ip}:${userAgent}`).digest('hex').slice(0, 32);
}

// day|path → count, and day|hash for the unique-visitor set.
const viewBuffer = new Map<string, number>();
const visitorBuffer = new Set<string>();

export function record(path: string, ip: string, userAgent: string): void {
  const day = today();
  const key = `${day}|${path}`;
  viewBuffer.set(key, (viewBuffer.get(key) ?? 0) + 1);
  visitorBuffer.add(`${day}|${visitorHash(ip, userAgent, day)}`);
  if (viewBuffer.size >= MAX_BUFFERED_PATHS) void flush();
}

let flushing = false;

/** Writes the buffer out. Never throws — analytics must not break the shop. */
export async function flush(): Promise<void> {
  if (flushing) return;
  if (viewBuffer.size === 0 && visitorBuffer.size === 0) return;
  flushing = true;

  // Swap the buffers out first, so requests arriving during the write are
  // counted into the next batch rather than lost or double-counted.
  const views = [...viewBuffer.entries()];
  const visitors = [...visitorBuffer];
  viewBuffer.clear();
  visitorBuffer.clear();

  try {
    for (const [key, count] of views) {
      const [day, path] = key.split('|') as [string, string];
      await db
        .insert(pageViews)
        .values({ day, path, views: count })
        .onConflictDoUpdate({
          target: [pageViews.day, pageViews.path],
          set: { views: raw`${pageViews.views} + ${count}` },
        });
    }

    for (const key of visitors) {
      const [day, hash] = key.split('|') as [string, string];
      await db.insert(pageViewVisitors).values({ day, hash }).onConflictDoNothing();
    }
  } catch (err: any) {
    // 42P01 = table not there yet (migration pending on a fresh boot).
    if (err?.code !== '42P01') console.error('[analytics] flush failed:', err?.message || err);
  } finally {
    flushing = false;
  }
}

/** Drop visitor hashes we no longer need. Daily view counts are kept forever. */
export async function pruneVisitors(): Promise<void> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - VISITOR_RETENTION_DAYS);
    const day = cutoff.toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' });
    await db.delete(pageViewVisitors).where(raw`${pageViewVisitors.day} < ${day}`);
  } catch {
    /* best effort */
  }
}

export const FLUSH_INTERVAL = FLUSH_INTERVAL_MS;

/** Everything the admin overview needs, in one round trip. */
export async function trafficSummary(days = 30) {
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  const fromDay = from.toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' });

  const [daily, topPages, visitorsByDay] = await Promise.all([
    db
      .select({ day: pageViews.day, views: raw<number>`sum(${pageViews.views})::int` })
      .from(pageViews)
      .where(gte(pageViews.day, fromDay))
      .groupBy(pageViews.day)
      .orderBy(pageViews.day),
    db
      .select({ path: pageViews.path, views: raw<number>`sum(${pageViews.views})::int` })
      .from(pageViews)
      .where(gte(pageViews.day, fromDay))
      .groupBy(pageViews.path)
      .orderBy(desc(raw`sum(${pageViews.views})`))
      .limit(10),
    db
      .select({ day: pageViewVisitors.day, visitors: raw<number>`count(*)::int` })
      .from(pageViewVisitors)
      .where(gte(pageViewVisitors.day, fromDay))
      .groupBy(pageViewVisitors.day)
      .orderBy(pageViewVisitors.day),
  ]);

  const visitorsFor = new Map(visitorsByDay.map((r) => [r.day, r.visitors]));
  const series = daily.map((r) => ({
    day: r.day,
    views: r.views,
    visitors: visitorsFor.get(r.day) ?? 0,
  }));

  const sum = (rows: typeof series, key: 'views' | 'visitors', since?: string) =>
    rows.filter((r) => !since || r.day >= since).reduce((acc, r) => acc + r[key], 0);

  const day7 = new Date();
  day7.setDate(day7.getDate() - 6);
  const from7 = day7.toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' });
  const now = today();

  return {
    series,
    topPages,
    totals: {
      today: { views: sum(series, 'views', now), visitors: sum(series, 'visitors', now) },
      last7: { views: sum(series, 'views', from7), visitors: sum(series, 'visitors', from7) },
      last30: { views: sum(series, 'views'), visitors: sum(series, 'visitors') },
    },
  };
}
