# Tenant isolation

Every tenant-owned row carries `org_id`. Isolation is enforced twice. First, every query in application code filters by the caller's organization. Second, the PostgreSQL role the API runs as enforces row-level security (RLS), so a forgotten `WHERE` clause cannot leak another tenant's data. Decision record: [ADR 0004](ADR/0004-row-level-security.md).

## Database roles

| Role | Created by | Attributes | Used by |
| --- | --- | --- | --- |
| `mp_owner` | Postgres image (`POSTGRES_USER`) | Owner of the schema | Migrations only (`DATABASE_MIGRATION_URL`). No runtime service connects as it. |
| `mp_app` | `infrastructure/docker/postgres/init/01-roles.sh` | `NOBYPASSRLS` | API request path (`DATABASE_URL`) and the SMTP submission gateway's admission path. |
| `mp_service` | same | `BYPASSRLS` | Workers (dispatcher, reconciler, bounce processor, webhook dispatcher, domain verifier) and pre-tenant lookups in the API: API-key and session resolution, signup, login. |

In production these roles are expected to be created by infrastructure provisioning. The migration grants privileges to them but does not create them.

## Binding a tenant: `withTenant`

`packages/database/src/client.ts`:

```ts
withTenant(db.app, orgId, async (tx) => { … })
// BEGIN; SELECT set_config('app.org_id', $orgId, true); …; COMMIT
```

The setting is transaction-local (`is_local = true`), so it cannot leak to the next request that reuses the pooled connection. In the API, `request.tenant(fn)` wraps this with the authenticated principal's `orgId`.

## Policies (migration `0001_rls_and_grants.sql`)

```sql
CREATE FUNCTION app_current_org() RETURNS uuid
  AS $$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;

CREATE POLICY tenant_isolation ON <table> TO mp_app
  USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());
```

Applied to: `workspaces`, `projects`, `organization_members`, `api_keys`, `smtp_credentials`, `domains`, `dns_records`, `dkim_keys`, `emails`, `email_contents`, `email_attachments`, `email_recipients`, `email_idempotency_keys`, `email_events`, `email_delivery_attempts`, `bounce_events`, `suppressions`, `webhook_endpoints`, `webhook_deliveries`, `webhook_attempts`, `audit_logs`. `organizations` uses `id = app_current_org()`.

Without a bound tenant, `app_current_org()` is `NULL` and every comparison is false, so an unbound `mp_app` connection sees no tenant rows at all.

`user_sessions`, `mta_queue_messages` and `worker_checkpoints` have RLS enabled with **no** `mp_app` policy and no `mp_app` grant. They are service-only, and an accidental future grant would still return nothing.

## Grants

| Grant to `mp_app` | Tables |
| --- | --- |
| `SELECT, INSERT, UPDATE, DELETE` | mutable tenant tables (workspaces … webhook_deliveries) |
| `SELECT, INSERT` only (append-only) | `email_events`, `email_delivery_attempts`, `bounce_events`, `webhook_attempts`, `audit_logs` |
| `SELECT, UPDATE` | `organizations` |
| `SELECT (id, email, name, created_at)` | `users`: column-level, so `password_hash` and lockout state are unreadable from the request path |
| none | `user_sessions`, `mta_queue_messages`, `worker_checkpoints` |

`mp_service` has full DML on all tables, plus default privileges for future tables.

## Cross-tenant uniqueness that RLS cannot see

Unique indexes apply across all rows regardless of RLS, and two of them are deliberate isolation guarantees:

- `domains_verified_name_uq` on `name WHERE ownership_verified_at IS NOT NULL AND status <> 'disabled'`: at most one organization can hold verified ownership of a domain. Other tenants may add the same name, but their verification fails with `409 conflict`. Each domain row also has its own random `ownership_token`, so publishing tenant A's token never verifies tenant B's row.
- `api_keys_hash_uq`, `smtp_credentials_username_uq`: credentials resolve to exactly one tenant.

## Service-role discipline

Workers use `mp_service`, which bypasses RLS. Code on that path filters by ids that come from trusted sources: claimed rows, HMAC-verified VERP tokens, or the org id read from the row being processed. Customer input never chooses the tenant on this path.

## Credential scoping

API keys carry scopes (`full_access`, `sending_access`) mapped to permissions in `packages/permissions`. No key scope includes `api_keys:manage`, `members:manage` or `billing:manage`, so a leaked key cannot mint new credentials. Keys and SMTP credentials can additionally be restricted to one domain (`domain_id`). SMTP credentials can be restricted to client CIDRs.

## What the tests prove

`tests/security/isolation.test.ts` runs against the real database:

- Tenant B gets `404` for tenant A's email, empty lists for emails and domains, and `404` when cancelling A's email.
- Through `mp_app` bound to B, `SELECT … FROM emails` without a `WHERE` returns none of A's rows; unbound, it returns none at all.
- An `UPDATE organizations … WHERE id = A` while bound to B affects 0 rows; an `INSERT` into `suppressions` with A's `org_id` is rejected by the RLS `WITH CHECK`.
- `SELECT password_hash FROM users` and `SELECT … FROM user_sessions` fail with `permission denied`.
- B cannot verify a domain A has verified, even after B's own token and key are published (`409`).
- Unverified From domains, header injection, reserved headers, key-scope escalation, revoked keys, quota limits, CSRF and webhook SSRF targets are all rejected.

## Not yet implemented

Workspace and project selection: every session and key is bound to one project, and the dashboard always uses the organization's first project. Multi-organization switching, member invitations and the platform-admin roles are also not implemented. The `platform_role` column exists but nothing reads it.
