import { z } from 'zod';
import { baseEnv, databaseEnv, flags, mailIdentityEnv, parseEnv, secretsEnv, webhookTargetEnv } from '@mp/shared';

export const apiEnv = baseEnv
  .merge(databaseEnv)
  .merge(secretsEnv)
  .merge(mailIdentityEnv)
  .merge(webhookTargetEnv)
  .extend({
    API_HOST: z.string().default('127.0.0.1'),
    API_PORT: z.coerce.number().int().default(3000),
    METRICS_PORT: z.coerce.number().int().default(9100),
    PUBLIC_API_URL: z.string().url().default('http://localhost:3000'),
    DASHBOARD_ORIGIN: z.string().url().default('http://localhost:5173'),
    DOMAIN_CONNECT_APPROVED: flags.bool.default('false'),
    DOMAIN_CONNECT_PROVIDER_ID: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/).optional(),
    DOMAIN_CONNECT_SERVICE_ID: z.string().regex(/^[a-z0-9-]+$/).optional(),
    DOMAIN_CONNECT_KEY_LABEL: z.string().regex(/^_[a-zA-Z0-9_-]+$/).optional(),
    DOMAIN_CONNECT_PRIVATE_KEY: z.string().optional(),
    REDIS_URL: z.string().url(),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(24 * 7),
    COOKIE_SECURE: flags.bool.default('true'),
    /** Public signup. Keep closed in production until abuse controls are reviewed (docs/security/ABUSE-PREVENTION.md). */
    ALLOW_PUBLIC_SIGNUP: flags.bool.default('false'),
    /** Comma-separated recursive resolvers for domain verification; system resolvers when empty. */
    DNS_SERVERS: z
      .string()
      .default('')
      .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)),
    /** Development only: JSON zone file used instead of public DNS. Refused in production. */
    DNS_FIXTURE_FILE: z.string().optional(),
    /** Requests per second per API key / session. */
    RATE_LIMIT_PER_SECOND: z.coerce.number().int().min(1).default(10),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (env.DNS_FIXTURE_FILE) ctx.addIssue({ code: 'custom', path: ['DNS_FIXTURE_FILE'], message: 'not allowed in production' });
      if (!env.COOKIE_SECURE) ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'must be true in production' });
      for (const k of ['WEBHOOK_ALLOW_HTTP', 'WEBHOOK_ALLOW_PRIVATE_NETWORKS'] as const) {
        if (env[k]) ctx.addIssue({ code: 'custom', path: [k], message: 'not allowed in production' });
      }
    }
  });

export type ApiConfig = z.infer<typeof apiEnv>;

export const loadConfig = (): ApiConfig => parseEnv(apiEnv);
