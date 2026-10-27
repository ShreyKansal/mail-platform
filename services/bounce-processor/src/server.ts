import { SMTPServer } from 'smtp-server';
import type { Db } from '@mp/database';
import { decodeVerp } from '@mp/mail-protocol';
import type { Logger } from '@mp/shared';
import { processBounce } from './processor';

export interface BounceServerOptions {
  db: Db;
  log: Logger;
  verpSecret: string;
  hostname: string;
  maxMessageBytes: number;
}

const smtpError = (code: number, message: string) => Object.assign(new Error(message), { responseCode: code });

/**
 * Receives DSNs for VERP return paths: both Postfix-generated non-delivery
 * reports (routed by transport_maps) and asynchronous bounces from remote
 * systems (via the bounce domain MX). Only authentic VERP recipients are
 * accepted, so this is never a relay and forged bounces are rejected at RCPT.
 */
export function createBounceServer(o: BounceServerOptions): SMTPServer {
  const server = new SMTPServer({
    name: o.hostname,
    banner: 'bounce processor',
    authOptional: true,
    disabledCommands: ['AUTH'],
    // STARTTLS for the public MX deployment is enabled with certificates in production.
    hideSTARTTLS: true,
    size: o.maxMessageBytes,
    maxClients: 100,
    onRcptTo(address, session, cb) {
      if (session.envelope.rcptTo.length >= 50) return cb(smtpError(452, '4.5.3 Too many recipients'));
      if (!decodeVerp(address.address, o.verpSecret)) return cb(smtpError(550, '5.1.1 Unknown recipient'));
      cb();
    },
    onData(stream, session, cb) {
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => {
        if ((stream as unknown as { sizeExceeded?: boolean }).sizeExceeded) return cb(smtpError(552, '5.3.4 Message too large'));
        const rcpts = session.envelope.rcptTo.map((r) => r.address);
        processBounce(o.db, o.log, o.verpSecret, rcpts, Buffer.concat(chunks))
          .then((res) => {
            o.log.info({ ...res, remote: session.remoteAddress }, 'bounce processed');
            cb(null, 'Bounce recorded');
          })
          .catch((err) => {
            o.log.error({ err }, 'bounce processing failed');
            cb(smtpError(451, '4.3.0 Temporary processing failure'));
          });
      });
    },
  });
  server.on('error', (err) => o.log.error({ err }, 'smtp server error'));
  return server;
}
