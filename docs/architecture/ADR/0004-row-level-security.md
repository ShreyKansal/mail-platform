# ADR 0004: Row-level security as defence in depth for tenant isolation

**Status:** Accepted

## Context

Every API query must be scoped to the caller's organization. A single missing `WHERE org_id = …` would expose another tenant's mail. Code review and tests reduce that risk but cannot eliminate it.

## Decision

- The API connects as `mp_app` (`NOBYPASSRLS`). Every tenant table has the policy `org_id = app_current_org()` for both `USING` and `WITH CHECK`, where `app_current_org()` reads the transaction-local setting `app.org_id`.
- Request handlers run tenant queries inside `withTenant(db.app, orgId, fn)`, which sets that value at the start of the transaction.
- Application code still filters by `org_id` explicitly. RLS is the second layer.
- Workers and pre-tenant lookups (credential resolution) use `mp_service` (`BYPASSRLS`). Their tenant ids come only from trusted sources.
- Grants restrict `mp_app` further: column-level `SELECT` on `users` (no password hashes), no access to sessions, and insert-only access to history tables.

Details: [TENANT-ISOLATION.md](../TENANT-ISOLATION.md).

## Consequences

- A missing filter in API code returns no foreign rows, and a cross-tenant insert fails. Both are covered by `tests/security/isolation.test.ts`.
- Every API database operation runs in a transaction, which adds a small `set_config` round trip.
- New tables need an explicit RLS policy and grants in a custom migration. Forgetting the grant fails closed (permission denied); forgetting the policy on a granted table would fail open. Review checklists must cover this.
- The service role is powerful; its use is confined to workers and the authentication modules.

## Alternatives considered

- **Application-level filtering only.** A single bug leaks data.
- **Schema or database per tenant.** Strong isolation, but heavy operational cost (migrations × tenants, connection counts) for a platform expecting many small tenants.
