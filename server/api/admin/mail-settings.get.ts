import { requireAdmin } from '../../utils/session';
import { getMailConfig, getShopNotificationRecipient } from '../../utils/email';
import { canStoreSecrets, getSetting, settingsUpdatedAt } from '../../utils/settings';
import { getBankAccount } from '../../utils/spayd';

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

  // Bank account for the payment QR — same DB-over-env resolution the QR
  // generator itself uses, so this page always shows what customers get.
  const bank = await getBankAccount();
  const bankSource = async (key: string) => ((await getSetting(key)) ? 'db' : 'env');

  return {
    values: {
      smtp_host: cfg.host ?? '',
      smtp_port: String(cfg.port ?? ''),
      smtp_secure: String(cfg.secure),
      smtp_user: cfg.user ?? '',
      mail_from: cfg.mailFrom ?? '',
      order_notification_email: (await getShopNotificationRecipient()) ?? '',
      bank_account_number: (await getSetting('bank_account_number')) || process.env.BANK_ACCOUNT_NUMBER?.replace(/['"]/g, '') || '',
      bank_account_bank_code: (await getSetting('bank_account_bank_code')) || process.env.BANK_ACCOUNT_BANK_CODE?.replace(/['"]/g, '') || '',
      bank_account_prefix: (await getSetting('bank_account_prefix')) || process.env.BANK_ACCOUNT_PREFIX?.replace(/['"]/g, '') || '',
      bank_account_holder: bank.holder,
    },
    bank: {
      localFormat: bank.localFormat,
      iban: bank.iban,
      checksumOk: bank.checksumOk,
      source: await bankSource('bank_account_number'),
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
