import { pino, type Logger } from 'pino';

/**
 * Paths that must never reach logs: credentials, message bodies, secrets.
 * Keep in sync with docs/operations/LOGGING.md.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  'password',
  '*.password',
  'secret',
  '*.secret',
  'token',
  '*.token',
  'apiKey',
  '*.apiKey',
  'api_token',
  '*.api_token',
  'req.body.api_token',
  'body.api_token',
  'api_key',
  '*.api_key',
  'req.body.api_key',
  'body.api_key',
  'api_secret',
  '*.api_secret',
  'req.body.api_secret',
  'body.api_secret',
  'privateKey',
  '*.privateKey',
  'DOMAIN_CONNECT_PRIVATE_KEY',
  '*.DOMAIN_CONNECT_PRIVATE_KEY',
  'html',
  '*.html',
  'text',
  '*.text',
  'attachments',
  '*.attachments',
];

export function createLogger(service: string, level = process.env.LOG_LEVEL ?? 'info'): Logger {
  return pino({
    name: service,
    level,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export type { Logger };
