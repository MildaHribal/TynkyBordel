import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { appSettings } from '../database/schema';

/**
 * Database-backed runtime settings.
 *
 * Why this exists: production is deployed as a Docker image built by CI, and the
 * only person who can edit `.env.production` on the VPS is its owner. When the
 * SMTP variables never reached the container, transactional email was dead and
 * there was no way to fix it from the application side. Settings stored here are
 * editable from the admin UI, survive redeploys (they're in Postgres, which is
 * also what gets backed up) and take precedence over the matching env var.
 *
 * Values are cached in memory: the mailer reads its config on every send, and
 * that must not become a database round-trip per email. `invalidateSettings()`
 * is called whenever the admin saves.
 */

/** Keys whose value is encrypted at rest and never returned to the client. */
export const SECRET_KEYS = new Set(['smtp_pass']);

const SCRYPT_SALT = 'shopik-app-settings-v1';
let keyCache: Buffer | null = null;

/**
 * AES key derived from BETTER_AUTH_SECRET.
 *
 * The database is dumped nightly into ./backups (and those dumps are meant to be
 * copied off the box), so a plaintext SMTP password here would turn every backup
 * into a credential leak. Deriving from an env secret keeps the dump useless on
 * its own. Returns null when the secret is missing — the caller then refuses to
 * store the password rather than silently writing it in the clear.
 */
function encryptionKey(): Buffer | null {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) return null;
  if (!keyCache) keyCache = scryptSync(secret, SCRYPT_SALT, 32);
  return keyCache;
}

export function canStoreSecrets(): boolean {
  return encryptionKey() !== null;
}

export function encryptSecret(plain: string): string {
  const key = encryptionKey();
  if (!key) {
    throw createError({
      statusCode: 500,
      statusMessage: 'BETTER_AUTH_SECRET není nastavené, heslo nelze bezpečně uložit.',
    });
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
}

/** Returns null on any failure — a rotated BETTER_AUTH_SECRET must not crash boot. */
export function decryptSecret(stored: string): string | null {
  try {
    const key = encryptionKey();
    if (!key) return null;
    const [version, iv, tag, payload] = stored.split(':');
    if (version !== 'v1' || !iv || !tag || !payload) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(payload, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

let cache: Map<string, string> | null = null;
let inFlight: Promise<Map<string, string>> | null = null;
let warnedMissingTable = false;

/**
 * Load every setting into memory (cached). Never throws: a missing `app_settings`
 * table (migration not applied yet) or an unreachable database must degrade to
 * "no overrides, use env vars", not take the storefront down.
 */
export async function loadSettings(): Promise<Map<string, string>> {
  if (cache) return cache;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const rows = await db.select().from(appSettings);
      cache = new Map(rows.map((r) => [r.key, r.value]));
      return cache;
    } catch (err: any) {
      // 42P01 = undefined_table. Anything else is worth a line in the log.
      if (err?.code !== '42P01' && !warnedMissingTable) {
        console.warn('[settings] could not read app_settings, falling back to env vars:', err?.message || err);
        warnedMissingTable = true;
      }
      // Deliberately NOT cached. The boot-time mail self-check can run before
      // 01-run-migrations has created the table, and a blip in the database must
      // not pin "no settings" in memory for the lifetime of the container —
      // that would silently disable email until the next restart.
      return new Map<string, string>();
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** A decrypted, trimmed setting — or undefined when unset/empty/undecryptable. */
export async function getSetting(key: string): Promise<string | undefined> {
  const settings = await loadSettings();
  const raw = settings.get(key);
  if (raw == null) return undefined;
  const value = SECRET_KEYS.has(key) ? decryptSecret(raw) : raw;
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Upsert settings. An empty string deletes the row, which is how the admin UI
 * clears an override and hands the field back to the env var.
 */
export async function saveSettings(values: Record<string, string>): Promise<void> {
  for (const [key, raw] of Object.entries(values)) {
    const value = String(raw ?? '').trim();
    if (!value) {
      await db.delete(appSettings).where(eq(appSettings.key, key));
      continue;
    }
    const stored = SECRET_KEYS.has(key) ? encryptSecret(value) : value;
    await db
      .insert(appSettings)
      .values({ key, value: stored, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: stored, updatedAt: new Date() } });
  }
  invalidateSettings();
}

export function invalidateSettings(): void {
  cache = null;
}

/** When each key was last written, for the admin UI. */
export async function settingsUpdatedAt(): Promise<Record<string, string>> {
  try {
    const rows = await db.select().from(appSettings);
    return Object.fromEntries(rows.map((r) => [r.key, r.updatedAt.toISOString()]));
  } catch {
    return {};
  }
}
