import { requireAdmin } from '../../utils/session';
import { getMailConfig, getShopNotificationRecipient } from '../../utils/email';
import { canStoreSecrets, settingsUpdatedAt } from '../../utils/settings';

/**
 * Current SMTP configuration for /admin/emails/smtp.
 *
 * Reports where each value came from (`db` = stored here and editable, `env` =
 * baked into the container and only changeable over SSH) so the admin can see at
 * a glance whether the box is running on settings they control. The password is
 * never returned — only whether one is set.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const cfg = await getMailConfig();
  const updatedAt = await settingsUpdatedAt();

  return {
    values: {
      smtp_host: cfg.host ?? '',
      smtp_port: String(cfg.port ?? ''),
      smtp_secure: String(cfg.secure),
      smtp_user: cfg.user ?? '',
      mail_from: cfg.mailFrom ?? '',
      order_notification_email: (await getShopNotificationRecipient()) ?? '',
    },
    sources: cfg.sources,
    passwordSet: cfg.passwordSet,
    secureSource: cfg.secureSource,
    // Without BETTER_AUTH_SECRET the password can't be encrypted, so the UI must
    // not offer to store one.
    canStoreSecrets: canStoreSecrets(),
    updatedAt,
  };
});
