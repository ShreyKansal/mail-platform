import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { metrics, statusClass } from '@mp/observability';
import { REDACT_PATHS } from '@mp/shared';
import type { AppDeps } from './context';
import { registerErrorHandling } from './plugins/errors';
import { CSRF_HEADER, registerSecurity } from './plugins/security';
import { authRoutes } from './routes/auth';
import { credentialRoutes } from './routes/credentials';
import { domainRoutes } from './routes/domains';
import { emailRoutes } from './routes/emails';
import { insightRoutes } from './routes/insights';
import { webhookRoutes } from './routes/webhooks';
import { shareRoutes } from './routes/shares';
import { exportRoutes } from './routes/exports';
import { templateRoutes } from './routes/templates';
import { contactRoutes } from './routes/contacts';
import { settingsRoutes } from './routes/settings';
import { broadcastRoutes } from './routes/broadcasts';
import { automationRoutes } from './routes/automations';
import { automationMetricsRoutes } from './routes/automation-metrics';
import { dnsSetupRoutes } from './routes/dns-setup';
import { domainConnectRoutes } from './routes/domain-connect';
import { apiRequestLogs } from '@mp/database';

export async function buildApp(deps: AppDeps, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger === false ? false : { level: deps.config.LOG_LEVEL, redact: { paths: REDACT_PATHS, censor: '[redacted]' }, serializers: { req: (req: { method?: string; url?: string }) => ({ method: req.method, url: req.url?.startsWith('/v1/shared/emails/') ? '/v1/shared/emails/[redacted]' : req.url?.startsWith('/v1/broadcast-unsubscribe/') ? '/v1/broadcast-unsubscribe/[redacted]' : req.url?.split('?')[0] }) } },
    genReqId: () => `req_${randomUUID().replace(/-/g, '')}`,
    bodyLimit: 1024 * 1024,
    routerOptions: { maxParamLength: 1024 },
    trustProxy: deps.config.NODE_ENV === 'production',
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });
  app.addHook('onResponse', async (req, reply) => {
    metrics.apiRequests.inc({ route: req.routeOptions.url ?? 'unmatched', method: req.method, status_class: statusClass(reply.statusCode) });
    const p = req.principal;
    if (p && req.routeOptions.url?.startsWith('/v1/') && !req.routeOptions.url.startsWith('/v1/logs')) {
      // Store only route templates and timing; never headers, bodies, query values or share tokens.
      await deps.dbs.service.insert(apiRequestLogs).values({ orgId: p.orgId, projectId: p.projectId, requestId: req.id,
        apiKeyId: p.kind === 'api_key' ? p.keyId : null, method: req.method, route: req.routeOptions.url,
        statusCode: reply.statusCode, durationMs: Math.max(0, Math.round(reply.elapsedTime)) })
        .catch((err: unknown) => req.log.warn({ err }, 'request log persistence failed'));
    }
  });
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('cache-control', 'no-store');
    return payload;
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: [deps.config.DASHBOARD_ORIGIN],
    credentials: true,
    allowedHeaders: ['content-type', 'authorization', 'idempotency-key', CSRF_HEADER],
    exposedHeaders: ['x-request-id', 'idempotent-replayed', 'retry-after', 'x-ratelimit-limit', 'x-ratelimit-remaining'],
  });
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: `${deps.config.PLATFORM_NAME} API`,
        version: '1.0.0',
        description:
          'Transactional email API backed by platform-operated SMTP infrastructure. ' +
          'Statuses report what the platform observed (MTA hand-off, remote SMTP acceptance); they never claim inbox placement.',
      },
      servers: [{ url: deps.config.PUBLIC_API_URL }],
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'API key: `mp_…`' } } },
      security: [{ bearerAuth: [] }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  registerErrorHandling(app);
  registerSecurity(app, deps);

  app.get('/healthz', { config: { public: true }, schema: { hide: true } }, async () => ({ ok: true }));
  app.get('/readyz', { config: { public: true }, schema: { hide: true } }, async (_req, reply) => {
    const db = await deps.dbs.service.execute('select 1').then(() => true, () => false);
    const redis = await deps.redis.ping().then(() => true, () => false);
    return reply.status(db && redis ? 200 : 503).send({ db, redis });
  });

  authRoutes(app, deps);
  domainRoutes(app, deps);
  credentialRoutes(app, deps);
  emailRoutes(app, deps);
  shareRoutes(app, deps);
  exportRoutes(app, deps);
  templateRoutes(app, deps);
  contactRoutes(app, deps);
  broadcastRoutes(app, deps);
  automationRoutes(app, deps);
  automationMetricsRoutes(app);
  dnsSetupRoutes(app, deps);
  domainConnectRoutes(app, deps);
  settingsRoutes(app, deps);
  webhookRoutes(app, deps);
  insightRoutes(app, deps);

  return app;
}
