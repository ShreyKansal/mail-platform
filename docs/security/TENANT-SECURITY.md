# Tenant security

The architecture is described in [architecture/TENANT-ISOLATION](../architecture/TENANT-ISOLATION.md). Operator summary:

* **Three database roles.** `mp_owner` runs migrations only. `mp_app` serves API and SMTP requests and is subject to RLS. `mp_service` is used by workers and pre-tenant authentication lookups, has BYPASSRLS, and its code filters by tenant explicitly.
* **RLS on every tenant table**: `org_id = app_current_org()`, for both `USING` and `WITH CHECK`. `withTenant()` sets `app.org_id` transaction-locally. Without it, `mp_app` sees nothing.
* **Append-only tables for `mp_app`**: `email_events`, `email_delivery_attempts`, `bounce_events`, `webhook_attempts` and `audit_logs` grant SELECT and INSERT only.
* **Service-only tables** (`user_sessions`, `mta_queue_messages`, `worker_checkpoints`) have RLS enabled and no `mp_app` policy, so an accidental grant fails closed.
* **Global uniqueness** where tenancy must not hide conflicts: verified domain names, API key hashes, SMTP usernames.
* **Per-tenant resources**: suppressions, quotas, DKIM keys and webhook endpoints are scoped to the organization or project.

Tests: `tests/security/isolation.test.ts` (API-level isolation, RLS reads and writes, column grants, domain-claim refusal).
