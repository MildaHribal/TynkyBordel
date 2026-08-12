/**
 * Transactional email helper.
 *
 * Configuration comes from two places, database first, environment second:
 *
 *   1. `app_settings` rows (smtp_host, smtp_port, smtp_secure, smtp_user,
 *      smtp_pass, mail_from, order_notification_email) — editable at
 *      /admin/emails/smtp, which is the only way to fix email on a box we
 *      cannot SSH into.
 *   2. env vars (e.g. in .env):
 *        SMTP_HOST=smtp.example.com
 *        SMTP_PORT=587
 *        SMTP_USER=apikey
 *        SMTP_PASS=...
 *        MAIL_FROM="Tynky Bordel <hello@tynky.cz>"
 *
 * With neither host nor user set, calls become no-ops that log to console. That
 * keeps dev environments from crashing when email isn't wired up.
 */

// Imported explicitly rather than left to Nitro's auto-imports: scripts/test-email.ts
// loads this module under plain tsx, where an auto-import would be an undefined global.
import { getSetting } from './settings';

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  // Set on shop-facing mail so hitting "Reply" answers the customer, not us.
  replyTo?: string;
  // Inline (CID) or regular attachments, passed straight to nodemailer.
  attachments?: Array<{
    filename: string;
    content: Buffer;
    cid?: string;
    contentType?: string;
  }>;
};

/**
 * Read an env var the same way in every environment.
 *
 * `.env` read by dotenv strips surrounding quotes; a Docker `env_file` (and
 * `docker run --env-file`) does NOT — it takes everything after `=` literally.
 * So `MAIL_FROM="Tynky Bordel <info@tynkybordel.shop>"` arrives in the container
 * WITH the quotes, and Seznam rejects the resulting From header (it demands
 * From == the login address). Same trap for a quoted SMTP_PASS.
 *
 * Stripping here means the shop behaves identically whichever way the value was
 * written, instead of failing only in production.
 */
function env(key: string): string | undefined {
  const raw = process.env[key];
  if (raw == null) return undefined;
  const value = raw.trim().replace(/^(['"])([\s\S]*)\1$/, '$2').trim();
  return value || undefined;
}

/**
 * Resolve one setting: the database wins, the env var is the fallback.
 *
 * Production is deployed as a prebuilt image and `.env.production` can only be
 * edited over SSH, which the shop owner doesn't have. Letting the admin UI store
 * SMTP credentials in the database means email can be fixed from the browser
 * instead of being permanently broken by an env var that never arrived.
 * A box whose env is already correct behaves exactly as before.
 */
async function setting(dbKey: string, envKey: string): Promise<{ value?: string; source: 'db' | 'env' | 'none' }> {
  const fromDb = await getSetting(dbKey);
  if (fromDb) return { value: fromDb, source: 'db' };
  const fromEnv = env(envKey);
  if (fromEnv) return { value: fromEnv, source: 'env' };
  return { source: 'none' };
}

/** Everything the transport needs, password included — never expose this directly. */
async function resolveMail() {
  const [host, portRaw, secureRaw, user, pass, mailFrom] = await Promise.all([
    setting('smtp_host', 'SMTP_HOST'),
    setting('smtp_port', 'SMTP_PORT'),
    setting('smtp_secure', 'SMTP_SECURE'),
    setting('smtp_user', 'SMTP_USER'),
    setting('smtp_pass', 'SMTP_PASS'),
    setting('mail_from', 'MAIL_FROM'),
  ]);

  const port = Number(portRaw.value || 587);
  return {
    host: host.value || null,
    port,
    // Port 465 is implicit TLS and MUST be `secure: true`. Auto-derive it from the
    // port so a missing/incorrect SMTP_SECURE doesn't silently break sending
    // (the #1 Seznam footgun: 465 with secure=false connects in plaintext and fails).
    secure: secureRaw.value ? secureRaw.value === 'true' : port === 465,
    secureSource: secureRaw.value ? secureRaw.source : 'auto-from-port',
    user: user.value || null,
    password: pass.value || null,
    mailFrom: mailFrom.value || null,
    sources: {
      host: host.source,
      port: portRaw.source,
      secure: secureRaw.source,
      user: user.source,
      password: pass.source,
      mailFrom: mailFrom.source,
    },
  };
}

/**
 * Resolved SMTP settings, shared by the transport, the self-check and diagnostics.
 * The password is reduced to a boolean here so it can't leak through the admin
 * diagnostic endpoint, which returns this object verbatim.
 */
export async function getMailConfig() {
  const { password, ...rest } = await resolveMail();
  return { ...rest, passwordSet: Boolean(password) };
}

let cachedTransport: any = null;

/**
 * Drop the memoised transport so the next send picks up freshly saved settings.
 * Without this the admin would have to redeploy for a password change to apply.
 */
export function invalidateMailTransport(): void {
  cachedTransport = null;
}

async function getTransport() {
  if (cachedTransport !== null) return cachedTransport;

  const cfg = await resolveMail();
  // Require both host AND user — a half-filled config (host set, no credentials)
  // would otherwise try to connect and hang/fail, slowing down signup/reset.
  if (!cfg.host || !cfg.user) {
    cachedTransport = false; // sentinel: no transport configured
    return cachedTransport;
  }

  // Dynamic import so the lib only loads when actually needed.
  const nodemailer = (await import('nodemailer')).default;

  cachedTransport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
    // Give slow/handshaking SMTP servers room, but don't hang a request forever.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return cachedTransport;
}

/**
 * Verify the SMTP connection + credentials without sending mail.
 * Returns { ok, configured, error } so a diagnostic endpoint/script can report
 * exactly why production email is failing (bad password, blocked port, etc.).
 */
export async function verifyMail(): Promise<{ ok: boolean; configured: boolean; error?: string }> {
  const transport = await getTransport();
  if (!transport) return { ok: false, configured: false };
  try {
    await transport.verify();
    return { ok: true, configured: true };
  } catch (err: any) {
    return { ok: false, configured: true, error: err?.message || String(err) };
  }
}

export async function sendMail({ to, subject, html, text, attachments, replyTo }: SendArgs): Promise<boolean> {
  try {
    const transport = await getTransport();
    if (!transport) {
      console.warn(
        `[mail] NOT SENT to ${to} ("${subject}") — SMTP is not configured in this process ` +
        '(no host/user in app_settings nor SMTP_HOST/SMTP_USER in the environment). ' +
        'Fix it without SSH at /admin/emails/smtp, or put the vars in .env.production and RECREATE ' +
        'the container (docker compose up -d) — a restart does not reload env_file.',
      );
      return false;
    }
    const from = (await resolveMail()).mailFrom || 'Tynky Bordel <noreply@localhost>';
    const info: any = await transport.sendMail({ from, to, subject, html, text, attachments, replyTo });
    // Log successes too. Without this, a production mailbox that never receives
    // anything is indistinguishable from code that never tried to send.
    console.log(`[mail] sent to ${to} ("${subject}") id=${info?.messageId ?? '?'} response=${info?.response ?? ''}`);
    return true;
  } catch (err: any) {
    // Include the code/command — that is what separates "wrong password" (EAUTH)
    // from "the VPS cannot reach the SMTP port" (ETIMEDOUT/ECONNREFUSED).
    console.error(
      `[mail] SEND FAILED to ${to} ("${subject}") code=${err?.code ?? '?'} command=${err?.command ?? '?'}: ${err?.message ?? err}`,
    );
    return false;
  }
}

/**
 * Where shop-facing mail (new orders, contact form) is delivered.
 *
 * ORDER_NOTIFICATION_EMAIL wins; otherwise fall back to the mailbox we already
 * send from, so notifications work out of the box on any correctly configured
 * SMTP setup without another env var to forget.
 */
export async function getShopNotificationRecipient(): Promise<string | null> {
  const explicit = await setting('order_notification_email', 'ORDER_NOTIFICATION_EMAIL');
  if (explicit.value) return explicit.value;

  const cfg = await resolveMail();

  // MAIL_FROM may be "Name <box@domain.tld>" — pull the address out.
  const match = cfg.mailFrom?.match(/<([^>]+)>/);
  if (match?.[1]) return match[1];
  if (cfg.mailFrom?.includes('@')) return cfg.mailFrom;

  return cfg.user?.includes('@') ? cfg.user : null;
}

// ── Shared email shell ──────────────────────────────────────────────────────────
// Emails can't rely on webfonts (Gmail/Outlook strip them), so the look is built
// on a warm cream card + deep-plum header with a psychedelic gradient rule, all
// using robust serif fallbacks — the "handmade cosmic receipt" of Tynky Bordel.
const FONT_SERIF = "Georgia,'Times New Roman',serif";
const FONT_SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";

/**
 * Escape anything customer-supplied before it goes into an email body.
 * Names, addresses and contact-form messages are attacker-controlled text —
 * without this they'd be injected as live HTML into our own inbox.
 */
function esc(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

type PillTone = 'pink' | 'green' | 'violet' | 'teal';
const PILL_TONES: Record<PillTone, { bg: string; fg: string; bd: string }> = {
  pink: { bg: '#fbe0e9', fg: '#b3305f', bd: '#f3b8cd' },
  green: { bg: '#d9f2e4', fg: '#1f7a4d', bd: '#a9dec2' },
  violet: { bg: '#eaddfb', fg: '#6a3fb0', bd: '#cfb4f2' },
  teal: { bg: '#d5f0f2', fg: '#1c7a83', bd: '#a6dfe4' },
};

function statusPill(label: string, tone: PillTone) {
  const t = PILL_TONES[tone];
  return `<span style="display:inline-block;background:${t.bg};color:${t.fg};border:1px solid ${t.bd};font-family:${FONT_SANS};font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;padding:7px 15px;border-radius:999px;">${label}</span>`;
}

/**
 * Wraps inner content in the shared shell (header band + gradient rule + footer).
 * `preheader` is the grey preview line shown by inbox clients.
 */
function emailShell(opts: { subject: string; preheader: string; content: string }) {
  return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${opts.subject}</title>
</head>
<body style="margin:0;padding:0;background:#ece3f0;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${opts.preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ece3f0;padding:34px 14px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#fbf4ea;border-radius:22px;overflow:hidden;box-shadow:0 14px 44px rgba(42,19,64,0.16);">
        <tr><td style="background:#1c0d2e;background-image:linear-gradient(135deg,#271247,#160a24);padding:30px 36px 26px;">
          <div style="font-family:${FONT_SANS};font-size:11px;letter-spacing:0.34em;text-transform:uppercase;color:#c6a2ff;margin-bottom:8px;">Ručně dělané originály</div>
          <div style="font-family:${FONT_SERIF};font-size:32px;font-weight:bold;color:#fbf4ea;letter-spacing:0.01em;">Tynky&nbsp;Bordel</div>
        </td></tr>
        <tr><td style="height:5px;line-height:5px;font-size:0;background:#ff5c8a;background-image:linear-gradient(90deg,#ff5c8a 0%,#a878ff 55%,#5ad1ff 100%);">&nbsp;</td></tr>
        <tr><td style="padding:30px 36px 10px;">${opts.content}</td></tr>
        <tr><td style="padding:22px 36px 30px;border-top:1px solid rgba(42,19,64,0.1);">
          <div style="font-family:${FONT_SERIF};font-size:14px;color:#2a1340;font-weight:bold;">Tynky Bordel</div>
          <div style="font-family:${FONT_SANS};font-size:12px;line-height:1.7;color:#8a6f9a;margin-top:3px;">
            Ručně dělané originály — obrazy, sochy, klíčenky.<br>
            <a href="https://www.instagram.com/tynky_bordel/" style="color:#b3305f;text-decoration:none;">Instagram</a>
            &nbsp;·&nbsp;
            <a href="mailto:info@tynkybordel.shop" style="color:#b3305f;text-decoration:none;">info@tynkybordel.shop</a>
          </div>
        </td></tr>
      </table>
      <div style="font-family:${FONT_SANS};font-size:11px;text-align:center;color:#a294ad;margin-top:16px;">© Tynky Bordel · Každý kousek je jeden na světě ✦</div>
    </td></tr>
  </table>
</body></html>`;
}

// ── Account emails (verification / password reset) ──────────────────────────────
/** Renders a branded action email (headline + text + a bulletproof button). */
function renderActionHtml(opts: {
  subject: string;
  preheader: string;
  pill: { label: string; tone: PillTone };
  headline: string;
  intro: string;
  buttonLabel: string;
  url: string;
  footnote?: string;
}) {
  const content = `
    ${statusPill(opts.pill.label, opts.pill.tone)}
    <h1 style="margin:14px 0 0;font-family:${FONT_SERIF};font-size:27px;line-height:1.18;color:#2a1340;">${opts.headline}</h1>
    <p style="margin:14px 0 0;font-family:${FONT_SERIF};font-size:16px;line-height:1.6;color:#4a3560;">${opts.intro}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 6px;">
      <tr><td style="border-radius:999px;background:#2a1340;background-image:linear-gradient(135deg,#3a1b5c,#2a1340);">
        <a href="${opts.url}" style="display:inline-block;font-family:${FONT_SANS};font-size:15px;font-weight:700;letter-spacing:0.02em;color:#fbf4ea;text-decoration:none;padding:15px 32px;border-radius:999px;">${opts.buttonLabel} →</a>
      </td></tr>
    </table>
    <p style="margin:18px 0 6px;font-family:${FONT_SANS};font-size:12px;line-height:1.55;color:#8a6f9a;">
      Kdyby tlačítko nefungovalo, otevři tento odkaz:<br>
      <a href="${opts.url}" style="color:#7a5f8a;word-break:break-all;">${opts.url}</a>
      ${opts.footnote ? `<br><br>${opts.footnote}` : ''}
    </p>`;
  return emailShell({ subject: opts.subject, preheader: opts.preheader, content });
}

/** Sent after registration so the user can confirm their address (soft, non-blocking). */
export async function sendVerificationEmail(args: { to: string; name?: string; url: string }): Promise<boolean> {
  const greeting = args.name ? `Ahoj <strong>${esc(args.name)}</strong>,` : 'Ahoj,';
  return sendMail({
    to: args.to,
    subject: 'Ověř svůj email ✨',
    html: renderActionHtml({
      subject: 'Ověř svůj email',
      preheader: 'Potvrď svůj email a je hotovo.',
      pill: { label: 'Vítej ✦', tone: 'violet' },
      headline: 'Ještě jeden krok',
      intro: `${greeting}<br>díky za registraci u Tynky Bordel! Klikni na tlačítko a potvrď, že tenhle email patří tobě.`,
      buttonLabel: 'Ověřit email',
      url: args.url,
      footnote: 'Pokud sis účet nezakládal/a, tenhle email klidně ignoruj.',
    }),
    text: `Ověř svůj email otevřením tohoto odkazu: ${args.url}`,
  });
}

/** Sent on a password-reset request; the URL leads to the reset-password page. */
export async function sendPasswordResetEmail(args: { to: string; name?: string; url: string }): Promise<boolean> {
  const greeting = args.name ? `Ahoj <strong>${esc(args.name)}</strong>,` : 'Ahoj,';
  return sendMail({
    to: args.to,
    subject: 'Obnovení hesla 🔐',
    html: renderActionHtml({
      subject: 'Obnovení hesla',
      preheader: 'Odkaz pro nastavení nového hesla (platí 1 hodinu).',
      pill: { label: 'Obnovení hesla', tone: 'pink' },
      headline: 'Zapomenuté heslo?',
      intro: `${greeting}<br>někdo (snad ty) požádal o obnovení hesla k tvému účtu. Klikni na tlačítko a nastav si nové heslo. Odkaz platí 1 hodinu.`,
      buttonLabel: 'Nastavit nové heslo',
      url: args.url,
      footnote: 'Pokud jsi o obnovení nežádal/a, nic nedělej — heslo zůstává beze změny.',
    }),
    text: `Nastav si nové heslo otevřením tohoto odkazu: ${args.url}`,
  });
}

// ── Order status email ──────────────────────────────────────────────────────────
type OrderForEmail = {
  id: number | string;
  customerName: string;
  customerEmail: string;
  totalPrice: number;
  shippingAddress: string;
  items?: Array<{ title: string; quantity: number; price: number }>;
  // Used to attach the invoice (faktura) to the order-confirmation email.
  paymentMethod?: string | null;
  variableSymbol?: string | number | null;
};

// Hardcoded defaults — used as fallback when a template row is missing in DB.
export const DEFAULT_TEMPLATES: Record<string, { subject: string; headline: string; body: string }> = {
  created: {
    subject: 'Objednávka přijata ✨',
    headline: 'Díky za objednávku!',
    body: 'Tvoji objednávku jsem přijala a chystám ji k odeslání. Ozvu se, jakmile balíček vyrazí.',
  },
  paid: {
    subject: 'Platba přijata 💜',
    headline: 'Platba byla přijata',
    body: 'Peníze dorazily. Chystám balíček a brzy ti dám vědět, že vyrazil na cestu.',
  },
  shipped: {
    subject: 'Tvoje objednávka je na cestě 💌',
    headline: 'Tvoje objednávka je odeslána',
    body: 'Zabalili jsme tvoje kousky a poslali je do světa. Brzy budou u tebe!',
  },
  delivered: {
    subject: 'Tvoje objednávka dorazila ✨',
    headline: 'Tvoje objednávka byla doručena',
    body: 'Snad ti všechno sedí. Kdyby cokoliv, dej vědět — ráda to vyřeším.',
  },
};

export type OrderStatusKey = keyof typeof DEFAULT_TEMPLATES;
export const TEMPLATE_KEYS = Object.keys(DEFAULT_TEMPLATES) as OrderStatusKey[];

// In-memory cache of custom template overrides. TTL keeps admin edits reflected
// within seconds without hammering the DB on every email send.
const TEMPLATE_CACHE_TTL_MS = 30_000;
let cachedTemplates: Record<string, { subject: string; headline: string; body: string }> | null = null;
let cacheExpiresAt = 0;

export function invalidateTemplateCache() {
  cachedTemplates = null;
  cacheExpiresAt = 0;
}

async function getTemplate(key: OrderStatusKey): Promise<{ subject: string; headline: string; body: string }> {
  const def = DEFAULT_TEMPLATES[key];
  const now = Date.now();

  if (!cachedTemplates || now > cacheExpiresAt) {
    try {
      const { db } = await import('./db');
      const { emailTemplates } = await import('../database/schema');
      const rows = await db.select().from(emailTemplates);
      const map: Record<string, { subject: string; headline: string; body: string }> = {};
      for (const row of rows) {
        map[row.key] = { subject: row.subject, headline: row.headline, body: row.body };
      }
      cachedTemplates = map;
      cacheExpiresAt = now + TEMPLATE_CACHE_TTL_MS;
    } catch (err) {
      console.warn('[mail] template DB load failed, using defaults:', err);
      cachedTemplates = {};
      cacheExpiresAt = now + TEMPLATE_CACHE_TTL_MS;
    }
  }

  return cachedTemplates[key] || def;
}

const ORDER_PILLS: Record<OrderStatusKey, { label: string; tone: PillTone }> = {
  created: { label: 'Objednávka přijata', tone: 'pink' },
  paid: { label: 'Zaplaceno', tone: 'green' },
  shipped: { label: 'Odesláno', tone: 'violet' },
  delivered: { label: 'Doručeno', tone: 'teal' },
};

function renderHtml(
  order: OrderForEmail,
  copy: { subject: string; headline: string; body: string },
  status: OrderStatusKey,
  extra?: BankTransferBlock,
) {
  const itemsRows = (order.items || [])
    .map(
      (i) => `
      <tr>
        <td style="padding:11px 0;border-bottom:1px solid rgba(42,19,64,0.08);font-family:${FONT_SERIF};font-size:15px;color:#2a1340;">${esc(i.title)} <span style="color:#9a7fab;">× ${i.quantity}</span></td>
        <td style="padding:11px 0;border-bottom:1px solid rgba(42,19,64,0.08);font-family:${FONT_SERIF};font-size:15px;color:#2a1340;text-align:right;white-space:nowrap;">${(i.price * i.quantity).toLocaleString('cs-CZ')} Kč</td>
      </tr>`,
    )
    .join('');

  const pill = ORDER_PILLS[status] || ORDER_PILLS.created;

  const content = `
    ${statusPill(pill.label, pill.tone)}
    <h1 style="margin:14px 0 0;font-family:${FONT_SERIF};font-size:27px;line-height:1.18;color:#2a1340;">${copy.headline}</h1>
    <p style="margin:14px 0 0;font-family:${FONT_SERIF};font-size:16px;line-height:1.6;color:#4a3560;">
      Ahoj <strong>${esc(order.customerName)}</strong>,<br>${copy.body}
    </p>

    <div style="margin-top:28px;font-family:${FONT_SANS};font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#9a7fab;font-weight:700;">Objednávka č. ${order.id}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;border-collapse:collapse;">
      ${itemsRows}
      <tr>
        <td style="padding:14px 0 0;font-family:${FONT_SANS};font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#8a6f9a;font-weight:700;vertical-align:bottom;">Celkem</td>
        <td style="padding:14px 0 0;text-align:right;font-family:${FONT_SERIF};font-size:24px;font-weight:bold;color:#2a1340;">${order.totalPrice.toLocaleString('cs-CZ')} Kč</td>
      </tr>
    </table>

    <div style="margin-top:24px;padding:16px 18px;background:rgba(42,19,64,0.04);border-radius:14px;">
      <div style="font-family:${FONT_SANS};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#8a6f9a;font-weight:700;margin-bottom:6px;">Doručovací adresa</div>
      <div style="font-family:${FONT_SERIF};font-size:15px;color:#3a2150;line-height:1.5;">${esc(order.shippingAddress).replace(/\n/g, '<br>')}</div>
    </div>

    ${extra ? `
    <div style="margin-top:16px;padding:18px 20px;background:#fff;border:1px solid rgba(255,92,138,0.3);border-radius:14px;">
      <div style="font-family:${FONT_SANS};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#b3305f;font-weight:700;margin-bottom:10px;">Platební údaje — převod na účet</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${FONT_SERIF};font-size:15px;color:#2a1340;line-height:1.7;">
        ${extra.accountNumber ? `<tr><td style="color:#8a6f9a;padding-right:12px;">Číslo účtu</td><td style="text-align:right;font-weight:bold;">${extra.accountNumber}</td></tr>` : ''}
        <tr><td style="color:#8a6f9a;padding-right:12px;">IBAN</td><td style="text-align:right;font-weight:bold;">${extra.iban}</td></tr>
        <tr><td style="color:#8a6f9a;padding-right:12px;">Částka</td><td style="text-align:right;font-weight:bold;">${extra.amount.toLocaleString('cs-CZ')} Kč</td></tr>
        <tr><td style="color:#8a6f9a;padding-right:12px;">Variabilní symbol</td><td style="text-align:right;font-weight:bold;">${extra.variableSymbol}</td></tr>
      </table>
      ${extra.qrBuffer
        ? `<div style="text-align:center;margin-top:14px;"><img src="cid:${QR_CID}" alt="QR kód pro platbu" width="172" height="172" style="display:inline-block;border-radius:10px;border:1px solid rgba(42,19,64,0.08);"></div>`
        : (extra.qrDataUrl ? `<div style="text-align:center;margin-top:14px;"><img src="${extra.qrDataUrl}" alt="QR kód pro platbu" width="172" height="172" style="display:inline-block;border-radius:10px;border:1px solid rgba(42,19,64,0.08);"></div>` : '')}
    </div>` : ''}`;

  return emailShell({ subject: copy.subject, preheader: copy.body.slice(0, 90), content });
}

export type BankTransferBlock = {
  iban: string;
  amount: number;
  variableSymbol: string | number;
  // Local Czech account format for humans (e.g. "8294444956/5500").
  accountNumber?: string | null;
  // data: URL — used for the on-screen checkout confirmation (browsers render it).
  qrDataUrl?: string | null;
  // PNG buffer — used for the email, sent as a CID inline attachment because
  // inbox clients block data: URI <img> tags.
  qrBuffer?: Buffer | null;
};

// CID referenced by the email QR <img> and set on the inline attachment.
const QR_CID = 'payment-qr';

export async function sendOrderStatusEmail(
  order: OrderForEmail,
  status: OrderStatusKey,
  extra?: BankTransferBlock,
): Promise<boolean> {
  if (!order.customerEmail) return false;
  const copy = await getTemplate(status);
  if (!copy) return false;

  // Send the QR as a CID inline attachment (data: URIs are blocked in email).
  const attachments: Array<{ filename: string; content: Buffer; cid?: string; contentType?: string }> =
    extra?.qrBuffer
      ? [{ filename: 'platba-qr.png', content: extra.qrBuffer, cid: QR_CID, contentType: 'image/png' }]
      : [];

  // Attach the invoice (faktura) to the order-confirmation email. Never let a PDF
  // failure block the email itself.
  if ((status === 'created' || status === 'paid') && order.items?.length) {
    try {
      const { generateInvoicePdf } = await import('./invoice');
      // Race against a timeout: the attachment is a nice-to-have, the email is not.
      // A stalled PDF must never cost the customer their order confirmation.
      const pdf = await Promise.race([
        generateInvoicePdf({
          number: order.id,
          issuedAt: new Date(),
          customerName: order.customerName,
          customerAddress: order.shippingAddress,
          paymentMethod: order.paymentMethod,
          variableSymbol: order.variableSymbol,
          items: order.items,
          total: order.totalPrice,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('invoice PDF generation timed out after 15s')), 15_000).unref?.(),
        ),
      ]);
      attachments.push({ filename: `faktura-${order.id}.pdf`, content: pdf, contentType: 'application/pdf' });
    } catch (err) {
      console.error('[email] invoice PDF generation failed (email still sent):', err);
    }
  }

  return sendMail({
    to: order.customerEmail,
    subject: copy.subject,
    html: renderHtml(order, copy, status, extra),
    text: `${copy.headline}\n\n${copy.body}\n\nObjednávka #${order.id}, celkem ${order.totalPrice.toFixed(0)} Kč.`,
    attachments,
  });
}

// ── Shop-facing notifications ───────────────────────────────────────────────────
/** One label/value row for the compact internal tables below. */
function infoRow(label: string, value: string) {
  return `<tr>
    <td style="padding:6px 14px 6px 0;font-family:${FONT_SANS};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#8a6f9a;white-space:nowrap;vertical-align:top;">${esc(label)}</td>
    <td style="padding:6px 0;font-family:${FONT_SERIF};font-size:15px;color:#2a1340;">${value}</td>
  </tr>`;
}

export type NewOrderNotification = {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  shippingAddress: string;
  paymentMethod?: string | null;
  paymentStatus: string;
  totalPrice: number;
  variableSymbol?: string | null;
  items: Array<{ title: string; quantity: number; price: number }>;
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Dobírka',
  'bank-transfer': 'Převod na účet',
  card: 'Karta (PayPal)',
};

/**
 * Tells the shop a new order has landed. Without this the only way to notice an
 * order was to open /admin/orders and look.
 *
 * Returns false (and logs) when no recipient can be resolved, so callers can
 * stay fire-and-forget.
 */
export async function sendNewOrderNotification(order: NewOrderNotification): Promise<boolean> {
  const to = await getShopNotificationRecipient();
  if (!to) {
    console.warn('[mail] no shop notification recipient configured — set ORDER_NOTIFICATION_EMAIL or MAIL_FROM.');
    return false;
  }

  const paid = order.paymentStatus === 'paid';
  const itemsRows = order.items
    .map(
      (i) => `<tr>
        <td style="padding:9px 0;border-bottom:1px solid rgba(42,19,64,0.08);font-family:${FONT_SERIF};font-size:15px;color:#2a1340;">${esc(i.title)} <span style="color:#9a7fab;">× ${i.quantity}</span></td>
        <td style="padding:9px 0;border-bottom:1px solid rgba(42,19,64,0.08);font-family:${FONT_SERIF};font-size:15px;color:#2a1340;text-align:right;white-space:nowrap;">${(i.price * i.quantity).toLocaleString('cs-CZ')} Kč</td>
      </tr>`,
    )
    .join('');

  const content = `
    ${statusPill(paid ? 'Nová objednávka — zaplaceno' : 'Nová objednávka', paid ? 'green' : 'pink')}
    <h1 style="margin:14px 0 0;font-family:${FONT_SERIF};font-size:27px;line-height:1.18;color:#2a1340;">Objednávka č. ${esc(order.orderNumber)}</h1>
    <p style="margin:12px 0 0;font-family:${FONT_SERIF};font-size:16px;line-height:1.6;color:#4a3560;">
      ${paid
        ? 'Peníze už dorazily — můžeš balit.'
        : order.paymentMethod === 'bank-transfer'
          ? 'Čeká se na platbu převodem. Až přijde, přepni objednávku na „Zaplaceno".'
          : 'Platba proběhne při převzetí (dobírka).'}
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;border-collapse:collapse;">
      ${infoRow('Zákazník', esc(order.customerName))}
      ${infoRow('E-mail', `<a href="mailto:${esc(order.customerEmail)}" style="color:#b3305f;text-decoration:none;">${esc(order.customerEmail)}</a>`)}
      ${order.customerPhone ? infoRow('Telefon', `<a href="tel:${esc(order.customerPhone)}" style="color:#b3305f;text-decoration:none;">${esc(order.customerPhone)}</a>`) : ''}
      ${infoRow('Doručení', esc(order.shippingAddress))}
      ${infoRow('Platba', esc(PAYMENT_LABELS[order.paymentMethod || ''] || order.paymentMethod || 'Neuvedeno'))}
      ${order.variableSymbol ? infoRow('Variabilní symbol', esc(order.variableSymbol)) : ''}
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;border-collapse:collapse;">
      ${itemsRows}
      <tr>
        <td style="padding:14px 0 0;font-family:${FONT_SANS};font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#8a6f9a;font-weight:700;vertical-align:bottom;">Celkem</td>
        <td style="padding:14px 0 0;text-align:right;font-family:${FONT_SERIF};font-size:24px;font-weight:bold;color:#2a1340;">${order.totalPrice.toLocaleString('cs-CZ')} Kč</td>
      </tr>
    </table>`;

  const textLines = [
    `Nová objednávka č. ${order.orderNumber}${paid ? ' (ZAPLACENO)' : ''}`,
    `${order.customerName} · ${order.customerEmail}${order.customerPhone ? ` · ${order.customerPhone}` : ''}`,
    `Doručení: ${order.shippingAddress}`,
    `Platba: ${PAYMENT_LABELS[order.paymentMethod || ''] || order.paymentMethod || 'Neuvedeno'}`,
    '',
    ...order.items.map((i) => `${i.title} × ${i.quantity} — ${i.price * i.quantity} Kč`),
    '',
    `Celkem: ${order.totalPrice} Kč`,
  ];

  return sendMail({
    to,
    subject: `🛒 Nová objednávka ${order.orderNumber} — ${order.totalPrice.toLocaleString('cs-CZ')} Kč`,
    html: emailShell({
      subject: `Nová objednávka ${order.orderNumber}`,
      preheader: `${order.customerName} — ${order.totalPrice.toLocaleString('cs-CZ')} Kč`,
      content,
    }),
    text: textLines.join('\n'),
    // Reply goes straight to the customer.
    replyTo: order.customerEmail,
  });
}

/** Delivers a contact-form message to the shop mailbox. */
export async function sendContactMessage(msg: {
  name: string;
  email: string;
  message: string;
}): Promise<boolean> {
  const to = await getShopNotificationRecipient();
  if (!to) {
    console.warn('[mail] contact form: no recipient configured — set ORDER_NOTIFICATION_EMAIL or MAIL_FROM.');
    return false;
  }

  const content = `
    ${statusPill('Zpráva z webu', 'violet')}
    <h1 style="margin:14px 0 0;font-family:${FONT_SERIF};font-size:27px;line-height:1.18;color:#2a1340;">Nová zpráva z kontaktního formuláře</h1>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border-collapse:collapse;">
      ${infoRow('Od', esc(msg.name))}
      ${infoRow('E-mail', `<a href="mailto:${esc(msg.email)}" style="color:#b3305f;text-decoration:none;">${esc(msg.email)}</a>`)}
    </table>

    <div style="margin-top:22px;padding:18px 20px;background:rgba(42,19,64,0.04);border-radius:14px;font-family:${FONT_SERIF};font-size:16px;line-height:1.6;color:#2a1340;white-space:pre-wrap;">${esc(msg.message)}</div>

    <p style="margin:18px 0 6px;font-family:${FONT_SANS};font-size:12px;color:#8a6f9a;">Odpovědí na tenhle e-mail píšeš rovnou zákazníkovi.</p>`;

  return sendMail({
    to,
    subject: `✉️ Zpráva z webu od ${msg.name}`,
    html: emailShell({
      subject: 'Nová zpráva z kontaktního formuláře',
      preheader: msg.message.slice(0, 90),
      content,
    }),
    text: `Od: ${msg.name} <${msg.email}>\n\n${msg.message}`,
    replyTo: msg.email,
  });
}
