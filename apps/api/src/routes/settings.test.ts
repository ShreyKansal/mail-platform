import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { describe, expect, it } from 'vitest';
import type { Tx } from '@mp/database';
import type { AppDeps, Principal } from '../context';
import { settingsRoutes } from './settings';

function values(value: unknown): Array<string | number | boolean> {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return [value];
  if (Array.isArray(value)) return value.flatMap(values);
  if (value && typeof value === 'object') {
    if ('queryChunks' in value) return values(value.queryChunks);
    if ('value' in value) return values(value.value);
  }
  return [];
}

function harness(empty = false) {
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  const conditions: unknown[] = [];
  const results = empty ? [] : [[{ n: 12 }], [{ daily: 18, minute: 3 }], [{ n: 24 }], [{ n: 2 }], [{ n: 1 }], [{ n: 3 }], [{ n: 4 }]];
  let index = 0;
  let config: unknown;
  const tx = { select: () => {
    const result = results[index++] ?? [];
    const chain = { from: () => chain, where: (condition: unknown) => { conditions.push(condition); return Promise.resolve(result); } };
    return chain;
  } };
  app.addHook('onRoute', route => { if (route.url === '/v1/settings/usage') config = route.config; });
  app.addHook('preHandler', async req => {
    req.principal = { kind: 'user', orgId: 'org-one', projectId: 'project-one' } as Principal;
    req.tenant = async fn => fn(tx as unknown as Tx);
  });
  settingsRoutes(app, { core: { localUnlimitedSending: false }, config: { RATE_LIMIT_PER_SECOND: 17 } } as AppDeps);
  return { app, conditions, getConfig: () => config };
}

describe('settings usage', () => {
  it('scopes project resources and monthly live transactional usage while retaining organization-wide rolling quotas', async () => {
    const { app, conditions, getConfig } = harness();
    try {
      const response = await app.inject('/v1/settings/usage');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ timezone: 'UTC', monthly_emails: 12, daily_recipients: 18, minute_recipients: 3, contacts: 24, broadcasts: 2, automations: 1, domains: 3, members: 4, rate_limit_per_second: 17 });
      expect(getConfig()).toMatchObject({ permission: 'analytics:read', sessionOnly: true });
      for (const condition of conditions) expect(values(condition)).toContain('org-one');
      for (const i of [0, 2, 3, 4, 5]) expect(values(conditions[i])).toContain('project-one');
      expect(values(conditions[0])).toContain('transactional');
      expect(values(conditions[0])).toContain(false);
      expect(values(conditions[0]).join(' ')).toContain("date_trunc('month', now() at time zone 'UTC')");
      expect(values(conditions[1])).not.toContain('project-one');
      expect(values(conditions[1]).join(' ')).toContain("interval '24 hours'");
      expect(values(conditions[2]).join(' ')).toContain('is null');
      expect(values(conditions[5]).join(' ')).toContain("<> 'disabled'");
    } finally { await app.close(); }
  });

  it('returns zero usage for an empty workspace without inventing allowances', async () => {
    const { app } = harness(true);
    try {
      const response = await app.inject('/v1/settings/usage');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ monthly_emails: 0, daily_recipients: 0, minute_recipients: 0, contacts: 0, broadcasts: 0, automations: 0, domains: 0, members: 0, rate_limit_per_second: 17 });
    } finally { await app.close(); }
  });
});
