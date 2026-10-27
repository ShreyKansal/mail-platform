import { z } from 'zod';

/**
 * Environment configuration shared by every service. Each service parses only
 * what it needs by composing these fragments; unknown variables are ignored.
 */
const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

export const baseEnv = z.object({
  LOCAL_UNLIMITED_SENDING: bool.default('false'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PLATFORM_NAME: z.string().min(1).default('MAIL_PLATFORM'),
});

export const databaseEnv = z.object({
  /** Connection as the RLS-restricted application role. */
  DATABASE_URL: z.string().url(),
  /** Connection as the service role (BYPASSRLS) for workers and authentication lookups. */
  DATABASE_SERVICE_URL: z.string().url(),
});

/** Workers connect with the service role only. */
export const serviceDatabaseEnv = z.object({
  DATABASE_SERVICE_URL: z.string().url(),
});

export const secretsEnv = z.object({
  /** `keyId:base64(32 bytes)[,older...]` — first key encrypts, all keys decrypt. */
  ENCRYPTION_KEYS: z.string().min(1),
  /** HMAC key for VERP bounce tokens. Rotating it invalidates in-flight bounce correlation. */
  VERP_SECRET: z.string().min(32),
});

export const mailIdentityEnv = z.object({
  /** Shared platform bounce domain used until a customer verifies a custom Return-Path. */
  PLATFORM_BOUNCE_DOMAIN: z.string().min(3),
  /** Hostname customers point their Return-Path MX at. */
  PLATFORM_BOUNCE_MX_HOST: z.string().min(3),
  /** SPF include customers add to their Return-Path TXT record. */
  PLATFORM_SPF_INCLUDE: z.string().min(3),
  /** Comma-separated public outbound IPs, used for SPF evaluation. Empty in local dev. */
  PLATFORM_OUTBOUND_IPS: z
    .string()
    .default('')
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)),
  /** Postfix internal submission endpoint (never exposed publicly). */
  MTA_HOST: z.string().default('127.0.0.1'),
  MTA_PORT: z.coerce.number().int().default(10025),
    MTA_ENFORCED_TLS_PORT: z.coerce.number().int().min(1).max(65535).default(10026),
});

/** Development-only relaxations for webhook targets; rejected when NODE_ENV=production. */
export const webhookTargetEnv = z.object({
  WEBHOOK_ALLOW_HTTP: bool.default('false'),
  WEBHOOK_ALLOW_PRIVATE_NETWORKS: bool.default('false'),
});

export const flags = { bool };

export function parseEnv<T extends z.ZodTypeAny>(schema: T, source: NodeJS.ProcessEnv = process.env): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
