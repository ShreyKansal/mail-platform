import type { Redis } from 'ioredis';
import { SMTPServer } from 'smtp-server';
import { authenticateSmtpCredential, type SmtpPrincipal } from '@mp/core';
import type { Databases } from '@mp/database';
import { parseAddress } from '@mp/mail-protocol';
import { metrics } from '@mp/observability';
import type { Logger } from '@mp/shared';
import { ipAllowed, SmtpReplyError, submitMessage, toSmtpError } from './submission';

export interface SubmissionServerOptions {
  dbs: Databases;
  redis: Redis;
  log: Logger;
  hostname: string;
  tls: { key: string; cert: string };
  /** true: implicit TLS (465); false: STARTTLS required before AUTH (587). */
  secure: boolean;
  maxMessageBytes: number;
  maxRecipients: number;
  localUnlimitedSending?: boolean;
}

const smtpError = (code: number, message: string) => Object.assign(new Error(message), { responseCode: code });

/** Failed AUTH attempts per client IP: 10 per 10 minutes. Fails open if Redis is down. */
async function authThrottled(redis: Redis, ip: string): Promise<boolean> {
  try {
    return Number((await redis.get(`smtp-auth-fail:${ip}`)) ?? 0) >= 10;
  } catch {
    return false;
  }
}

async function recordAuthFailure(redis: Redis, ip: string): Promise<void> {
  try {
    await redis.multi().incr(`smtp-auth-fail:${ip}`).expire(`smtp-auth-fail:${ip}`, 600).exec();
  } catch {
    // best effort
  }
}

export function createSubmissionServer(o: SubmissionServerOptions): SMTPServer {
  const server = new SMTPServer({
    name: o.hostname,
    banner: `${o.hostname} ESMTP submission`,
    secure: o.secure,
    key: o.tls.key,
    cert: o.tls.cert,
    // AUTH is mandatory and only offered over TLS: never an open relay, never plaintext credentials.
    authOptional: false,
    allowInsecureAuth: false,
    authMethods: ['PLAIN', 'LOGIN'],
    size: o.maxMessageBytes,
    maxClients: 500,
    socketTimeout: 120_000,
    async onAuth(auth, session, cb) {
      const ip = session.remoteAddress;
      if (await authThrottled(o.redis, ip)) return cb(smtpError(454, '4.7.0 Too many failed authentication attempts'));
      const principal = await authenticateSmtpCredential(o.dbs.service, auth.username ?? '', auth.password ?? '').catch(() => null);
      if (!principal || !ipAllowed(ip, principal.allowedCidrs)) {
        await recordAuthFailure(o.redis, ip);
        o.log.warn({ ip, username: auth.username?.slice(0, 40) }, 'smtp authentication failed');
        return cb(smtpError(535, '5.7.8 Authentication credentials invalid'));
      }
      if (principal.orgStatus !== 'active') return cb(smtpError(535, '5.7.1 Sending is not enabled for this account'));
      o.log.info({ ip, credentialId: principal.credentialId, orgId: principal.orgId }, 'smtp authenticated');
      cb(null, { user: principal });
    },
    onRcptTo(address, session, cb) {
      if (session.envelope.rcptTo.length >= o.maxRecipients) return cb(smtpError(452, '4.5.3 Too many recipients'));
      try {
        parseAddress(address.address);
      } catch {
        return cb(smtpError(553, '5.1.3 Invalid recipient address'));
      }
      cb();
    },
    onData(stream, session, cb) {
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => {
        if ((stream as unknown as { sizeExceeded?: boolean }).sizeExceeded) return cb(smtpError(552, '5.3.4 Message exceeds size limit'));
        const principal = session.user as unknown as SmtpPrincipal;
        submitMessage(o.dbs, principal, session.envelope.rcptTo.map((r) => r.address), Buffer.concat(chunks), o.localUnlimitedSending)
          .then((id) => {
            metrics.emailAccepted.inc({ source: 'smtp' });
            cb(null, `2.0.0 Queued as ${id}`);
          })
          .catch((err) => {
            const e = toSmtpError(err);
            const code = (err as { code?: string }).code ?? (e.responseCode >= 500 ? 'smtp_permanent' : 'smtp_temporary');
            metrics.rejected.inc({ reason: code });
            if (code === 'quota_exceeded' || code === 'rate_limited') metrics.tenantLimitExceeded.inc({ kind: code });
            if (!(err instanceof SmtpReplyError) && e.responseCode === 451) o.log.error({ err }, 'smtp submission failed');
            cb(smtpError(e.responseCode, e.message));
          });
      });
    },
  });
  server.on('error', (err) => o.log.error({ err }, 'smtp server error'));
  return server;
}
