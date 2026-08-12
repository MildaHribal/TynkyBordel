import net from 'node:net';
import dns from 'node:dns/promises';

/**
 * Can this container actually open an outbound TCP connection?
 *
 * "Connection timeout" from nodemailer has two very different causes that look
 * identical from the application side: the mail host is refusing us, or the
 * hosting provider is dropping outbound SMTP altogether. Hetzner (where this
 * shop runs) blocks outbound 25/465/587 by default and only lifts it on
 * request, so telling those two apart decides whether the fix is a support
 * ticket or a rewrite onto an HTTP mail API.
 *
 * A control target on :443 is probed alongside, because "everything times out"
 * means a broken network, while "only the SMTP ports time out" is a block.
 */

export type ProbeResult = {
  label: string;
  host: string;
  port: number;
  ok: boolean;
  ms: number;
  error?: string;
};

export function probeTcp(label: string, host: string, port: number, timeoutMs = 6000): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;

    const finish = (ok: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ label, host, port, ok, ms: Date.now() - started, error });
    };

    const socket = net.connect({ host, port });
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false, 'timeout'));
    socket.once('error', (err: any) => finish(false, err?.code || err?.message || 'error'));
  });
}

/** DNS view of the mail host — an AAAA-only route is another way to hang. */
export async function resolveHost(host: string): Promise<{ v4: string[]; v6: string[] }> {
  const [v4, v6] = await Promise.all([
    dns.resolve4(host).catch(() => [] as string[]),
    dns.resolve6(host).catch(() => [] as string[]),
  ]);
  return { v4, v6 };
}

/**
 * Probe the configured mail host on the usual submission ports plus a :443
 * control. Runs in parallel, so the whole thing costs one timeout at worst.
 */
export async function probeOutbound(mailHost: string | null) {
  const host = mailHost || 'smtp.seznam.cz';

  const [dnsView, ...results] = await Promise.all([
    resolveHost(host).catch(() => ({ v4: [], v6: [] })),
    probeTcp('SMTP přes SSL', host, 465),
    probeTcp('SMTP přes STARTTLS', host, 587),
    probeTcp('SMTP klasický', host, 25),
    // Control: proves general outbound internet works from inside the container.
    probeTcp('Kontrolní spojení (HTTPS)', 'www.seznam.cz', 443),
  ]);

  const smtpPorts = results.filter((r) => r.port !== 443);
  const control = results.find((r) => r.port === 443)!;
  const anySmtpOpen = smtpPorts.some((r) => r.ok);

  let verdict: string;
  if (!control.ok) {
    verdict = 'Ze serveru nefunguje ani běžné HTTPS spojení ven — problém je v síti serveru, ne v SMTP.';
  } else if (anySmtpOpen) {
    const open = smtpPorts.filter((r) => r.ok).map((r) => r.port).join(', ');
    verdict = `Server ven dosáhne a port ${open} je průchozí. Timeout tedy nedělá blokovaný port — zkus ten port nastavit výše.`;
  } else {
    verdict =
      'Internet ze serveru funguje, ale VŠECHNY SMTP porty (25, 465, 587) končí timeoutem. ' +
      'To je typické blokování odchozího SMTP u poskytovatele (Hetzner ho má ve výchozím stavu zavřené). ' +
      'Buď o odblokování požádá majitel serveru u podpory, nebo se musí přejít na odesílání přes HTTP API.';
  }

  return { host, dns: dnsView, results, verdict };
}
