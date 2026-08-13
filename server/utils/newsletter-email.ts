import { sendMail, emailShell } from '../utils/email';

/**
 * The double opt-in email.
 *
 * This is the only thing that turns a typed-in address into provable consent:
 * until someone opens this mail and clicks, we only know that *a browser* wrote
 * the address down, not that it belongs to whoever wrote it. It therefore says
 * plainly that ignoring it is a complete answer — a person who never asked for
 * anything must not have to do a thing to stay off the list.
 */

// Local copy: email.ts keeps its `esc` private, and reaching for a shared one
// would mean editing that file. Escaping matters here because the address is
// whatever the form was given.
function esc(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const FONT_SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const FONT_SERIF = "Georgia,'Times New Roman',serif";

export async function sendNewsletterConfirmationEmail(args: {
  to: string;
  url: string;
}): Promise<boolean> {
  const url = esc(args.url);
  const address = esc(args.to);

  const content = `
    <span style="display:inline-block;background:#fbe0e9;color:#b3305f;border:1px solid #f3b8cd;font-family:${FONT_SANS};font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;padding:7px 15px;border-radius:999px;">Newsletter</span>
    <h1 style="margin:14px 0 0;font-family:${FONT_SERIF};font-size:27px;line-height:1.18;color:#2a1340;">Potvrď odběr novinek</h1>
    <p style="margin:14px 0 0;font-family:${FONT_SERIF};font-size:16px;line-height:1.6;color:#4a3560;">
      Ahoj,<br>
      někdo přihlásil adresu <strong>${address}</strong> k odběru novinek Tynky Bordel.
      Než ti cokoliv pošleme, potřebujeme vědět, že jsi to byl/a ty — klikni na tlačítko.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 6px;">
      <tr><td style="border-radius:999px;background:#2a1340;background-image:linear-gradient(135deg,#3a1b5c,#2a1340);">
        <a href="${url}" style="display:inline-block;font-family:${FONT_SANS};font-size:15px;font-weight:700;letter-spacing:0.02em;color:#fbf4ea;text-decoration:none;padding:15px 32px;border-radius:999px;">Potvrdit odběr →</a>
      </td></tr>
    </table>
    <p style="margin:18px 0 6px;font-family:${FONT_SANS};font-size:12px;line-height:1.55;color:#8a6f9a;">
      Kdyby tlačítko nefungovalo, otevři tento odkaz:<br>
      <a href="${url}" style="color:#7a5f8a;word-break:break-all;">${url}</a>
      <br><br>
      Pokud jsi o novinky nežádal/a, tenhle e-mail klidně ignoruj — bez kliknutí ti nic posílat nebudeme a adresa zůstane nepotvrzená.
    </p>`;

  return sendMail({
    to: args.to,
    subject: 'Potvrď odběr novinek ✦',
    html: emailShell({
      subject: 'Potvrď odběr novinek',
      preheader: 'Jedno kliknutí a novinky ti začnou chodit.',
      content,
    }),
    text:
      `Někdo přihlásil adresu ${args.to} k odběru novinek Tynky Bordel.\n\n` +
      `Potvrď odběr otevřením tohoto odkazu:\n${args.url}\n\n` +
      `Pokud jsi o novinky nežádal/a, tenhle e-mail ignoruj — nic se nestane.`,
  });
}
