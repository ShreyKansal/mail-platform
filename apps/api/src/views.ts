import type { DomainWithRecords } from '@mp/core';
import type { apiKeys, smtpCredentials, suppressions, webhookDeliveries, webhookEndpoints } from '@mp/database';
import { AppError } from '@mp/shared';

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export function domainView({ domain, records, dkimSelector }: DomainWithRecords) {
  return {
    id: domain.id,
    name: domain.name,
    status: domain.status,
    sending_enabled: domain.sendingEnabled,
      tls_policy: domain.tlsPolicy,
    return_path_domain: `${domain.returnPathLabel}.${domain.name}`,
    custom_return_path_active: domain.returnPathVerifiedAt !== null,
    dkim_selector: dkimSelector,
    last_checked_at: iso(domain.lastCheckedAt),
    created_at: domain.createdAt.toISOString(),
    records: records.map((r) => ({
      purpose: r.purpose,
      type: r.type,
      host: r.host,
      value: r.value,
      priority: r.priority,
      required: r.required,
      status: r.status,
      observed: r.observed ?? [],
      detail: r.detail,
      checked_at: iso(r.checkedAt),
    })),
  };
}

export function apiKeyView(k: typeof apiKeys.$inferSelect) {
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scopes: k.scopes,
    domain_id: k.domainId,
    last_used_at: iso(k.lastUsedAt),
    expires_at: iso(k.expiresAt),
    revoked_at: iso(k.revokedAt),
    created_at: k.createdAt.toISOString(),
  };
}

export function smtpCredentialView(c: typeof smtpCredentials.$inferSelect) {
  return {
    id: c.id,
    name: c.name,
    username: c.username,
    domain_id: c.domainId,
    allowed_cidrs: c.allowedCidrs,
    last_used_at: iso(c.lastUsedAt),
    revoked_at: iso(c.revokedAt),
    created_at: c.createdAt.toISOString(),
  };
}

export function webhookView(w: typeof webhookEndpoints.$inferSelect) {
  return {
    id: w.id,
    url: w.url,
    description: w.description,
    event_types: w.eventTypes,
    enabled: w.enabled,
    disabled_reason: w.disabledReason,
      consecutive_failures: w.consecutiveFailures,
      first_failure_at: iso(w.firstFailureAt),
      last_failure_at: iso(w.lastFailureAt),
      last_success_at: iso(w.lastSuccessAt),
    created_at: w.createdAt.toISOString(),
  };
}

export function webhookDeliveryView(d: typeof webhookDeliveries.$inferSelect) {
  return {
    id: d.id,
    event_id: d.eventId,
    event_type: d.eventType,
    status: d.status,
    attempts: d.attempts,
    last_status_code: d.lastStatusCode,
    last_error: d.lastError,
    next_attempt_at: d.nextAttemptAt.toISOString(),
    created_at: d.createdAt.toISOString(),
  };
}

export function suppressionView(s: typeof suppressions.$inferSelect) {
  return {
    id: s.id,
    email: s.addressLower,
    reason: s.reason,
    detail: s.detail,
    created_at: s.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Keyset pagination over (created_at DESC, id DESC)
// ---------------------------------------------------------------------------

export interface Cursor {
  t: Date;
  id: string;
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify({ t: c.t.toISOString(), id: c.id })).toString('base64url');
}

export function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as { t?: unknown; id?: unknown };
    const t = new Date(String(v.t));
    if (Number.isNaN(t.getTime()) || typeof v.id !== 'string' || !/^[0-9a-f-]{36}$/.test(v.id)) throw new Error('bad');
    return { t, id: v.id };
  } catch {
    throw new AppError('validation_error', 'invalid cursor', [{ path: 'cursor', message: 'invalid cursor' }]);
  }
}

export function page<T extends { createdAt: Date; id: string }, V>(rows: T[], limit: number, map: (r: T) => V) {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice[slice.length - 1];
  return { data: slice.map(map), next_cursor: hasMore && last ? encodeCursor({ t: last.createdAt, id: last.id }) : null };
}
