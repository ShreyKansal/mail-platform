import nodemailer from 'nodemailer';

export interface Envelope {
  from: string;
  to: string;
}

/** Hand-off to the platform's own MTA (Postfix :10025 on the private network). */
export interface MtaClient {
  submit(envelope: Envelope, raw: Buffer): Promise<{ response: string }>;
  close(): void;
}

export function createMtaClient(opts: { host: string; port: number; connections: number }): MtaClient {
  const transport = nodemailer.createTransport({
    host: opts.host,
    port: opts.port,
    secure: false,
    // Private-network hop to our own Postfix; outbound TLS to remote MX is Postfix's job.
    ignoreTLS: true,
    pool: true,
    maxConnections: opts.connections,
    maxMessages: 1000,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 60_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    async submit(envelope, raw) {
      const info = await transport.sendMail({ envelope: { from: envelope.from, to: [envelope.to] }, raw });
      return { response: info.response };
    },
    close: () => transport.close(),
  };
}

export type SubmissionOutcome = 'permanent' | 'retry' | 'unknown';

const PRE_DATA_COMMANDS = new Set(['CONN', 'EHLO', 'HELO', 'LHLO', 'MAIL FROM', 'RCPT TO', 'STARTTLS']);

/**
 * Decides what a failed hand-off means for retry ownership:
 *
 * - The MTA replied (4xx/5xx): the message was definitely NOT queued.
 *   5xx -> permanent failure; 4xx -> safe to retry.
 * - No reply, failure before DATA (connection refused, timeout on connect):
 *   NOT queued -> safe to retry.
 * - No reply after DATA started (socket dropped awaiting the final 250):
 *   Postfix may or may not have queued it -> DELIVERY_UNKNOWN, resolved by
 *   reconciliation against the Postfix log instead of a blind retry.
 */
export function classifySubmissionError(err: unknown): SubmissionOutcome {
  const e = err as { responseCode?: unknown; code?: unknown; command?: unknown };
  if (typeof e.responseCode === 'number') return e.responseCode >= 500 ? 'permanent' : 'retry';
  if (e.code === 'ECONNECTION' || e.code === 'EDNS') return 'retry';
  if (typeof e.command === 'string' && PRE_DATA_COMMANDS.has(e.command)) return 'retry';
  return 'unknown';
}

/** Bounded exponential backoff with full jitter for application-side hand-off retries. */
export function backoffMs(attempt: number, random = Math.random): number {
  const cap = 30 * 60_000;
  const base = Math.min(cap, 15_000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base / 2 + random() * (base / 2));
}
