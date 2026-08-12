import { getMailConfig, verifyMail, getShopNotificationRecipient } from '../utils/email'

/**
 * Boot-time SMTP self-check.
 *
 * Order confirmations are fire-and-forget: nothing in the UI reports that one
 * failed, so a misconfigured production box looks completely healthy while every
 * customer email is silently dropped. This logs the resolved config and an actual
 * connection + login attempt once at startup, so the cause is visible with:
 *
 *   docker compose -f docker-compose.prod.yml logs app | grep '\[mail\]'
 *
 * Never throws and never blocks boot — the shop must come up even if email is down.
 */
export default defineNitroPlugin(async () => {
  const cfg = await getMailConfig()

  if (!cfg.host || !cfg.user) {
    console.warn(
      '[mail] DISABLED — no SMTP host/user in app_settings or the environment, so NO order ' +
      'confirmations, shop notifications or password resets will be sent. ' +
      'Fix it in the browser at /admin/emails/smtp (no SSH needed), or put SMTP_HOST/SMTP_USER ' +
      'in .env.production and recreate the container ' +
      '(docker compose -f docker-compose.prod.yml up -d) — `restart` does not reload env_file.',
    )
    return
  }

  console.log(
    `[mail] config: host=${cfg.host} port=${cfg.port} secure=${cfg.secure} (${cfg.secureSource}) ` +
    `user=${cfg.user} password=${cfg.passwordSet ? 'set' : 'MISSING'} ` +
    `from=${cfg.mailFrom ?? '(default)'} notifications→${(await getShopNotificationRecipient()) ?? '(none)'} ` +
    `source=${cfg.sources.host}`,
  )

  // Seznam refuses to send when the From address differs from the login address.
  if (cfg.mailFrom && !cfg.mailFrom.toLowerCase().includes(cfg.user.toLowerCase())) {
    console.warn(
      `[mail] MAIL_FROM (${cfg.mailFrom}) does not contain SMTP_USER (${cfg.user}) — ` +
      'Seznam rejects such messages. Make them the same address.',
    )
  }

  // Detached so a slow or blocked SMTP port delays nothing.
  verifyMail()
    .then(({ ok, error }) => {
      if (ok) {
        console.log('[mail] connection + login OK — transactional email is working.')
      } else {
        console.error(
          `[mail] CONNECTION/LOGIN FAILED: ${error}. ` +
          'Typical causes: wrong SMTP_PASS, the VPS blocking outbound port ' +
          `${cfg.port}, or SMTP access disabled for the mailbox.`,
        )
      }
    })
    .catch((err) => console.error('[mail] self-check crashed:', err))
})
