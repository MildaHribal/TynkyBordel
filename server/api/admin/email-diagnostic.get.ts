import { requireAdmin } from '../../utils/session';
import { verifyMail, sendMail, getMailConfig, getShopNotificationRecipient } from '../../utils/email';

/**
 * Admin-only email diagnostic — lets you debug production email from the browser
 * (no SSH needed). Visit while logged in as an admin:
 *
 *   /api/admin/email-diagnostic              → shows config + connection check
 *   /api/admin/email-diagnostic?send=me@x.cz → also sends a real test email
 *
 * The SMTP password is never returned — only whether it is set.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const q = getQuery(event);
  // Exactly the values the sender uses — including quote stripping — so this
  // endpoint can never report a config the mailer doesn't actually use.
  const resolved = await getMailConfig();
  const { user, mailFrom } = resolved;

  const config = {
    ...resolved,
    // Seznam requires MAIL_FROM to equal the login address, or it rejects the send.
    mailFromMatchesUser: Boolean(user && mailFrom && mailFrom.toLowerCase().includes(user.toLowerCase())),
    notificationRecipient: await getShopNotificationRecipient(),
    // The raw value still carrying quotes is the classic env_file footgun.
    mailFromRawHadQuotes: /^\s*['"]/.test(process.env.MAIL_FROM || ''),
  };

  // Verify the connection + credentials without sending anything.
  const verify = await verifyMail();

  // Optionally send a real test email.
  let sent: { to: string; ok: boolean } | null = null;
  const to = typeof q.send === 'string' ? q.send.trim() : '';
  if (to) {
    const ok = await sendMail({
      to,
      subject: 'Test odesílání – Tynky Bordel ✅',
      html: '<p>Tohle je testovací email z produkce. Když ho čteš, odesílání funguje. 🎉</p>',
      text: 'Testovací email z produkce – odesílání funguje.',
    });
    sent = { to, ok };
  }

  // Human-readable hint about the most likely problem.
  let diagnosis: string;
  if (!config.host || !config.user) {
    diagnosis = 'SMTP proměnné na serveru CHYBÍ (host/user není nastavené) → emaily se vůbec neposílají. Doplň SMTP_* na VPS.';
  } else if (!config.passwordSet) {
    diagnosis = 'SMTP_PASS není nastavené → přihlášení selže. Doplň heslo ke schránce na VPS.';
  } else if (!verify.ok) {
    diagnosis = `Připojení/přihlášení selhalo: ${verify.error || 'neznámá chyba'}. Časté příčiny: špatné heslo, blokovaný port 465, nepovolený SMTP přístup ve schránce.`;
  } else if (!config.mailFromMatchesUser) {
    diagnosis = 'Připojení OK, ale MAIL_FROM ≠ SMTP_USER — Seznam takové emaily odmítá. Nastav MAIL_FROM na stejnou adresu jako SMTP_USER.';
  } else {
    diagnosis = 'Vše vypadá v pořádku. Přidej ?send=tvuj@email.cz a ověř doručení.';
  }

  return { ok: verify.ok, diagnosis, config, verify, sent };
});
