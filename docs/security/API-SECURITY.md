# API security

| Control | Implementation |
|---|---|
| Authentication | `Authorization: Bearer mp_…` (API keys) or the `mp_session` cookie (dashboard). An invalid bearer token always gets a uniform 401. |
| Authorization | Per-route permission ([RBAC](RBAC.md)); RLS-bound transactions for tenant data. |
| CSRF | Cookie-authenticated POST/PUT/PATCH/DELETE require `x-mp-csrf: 1` (a custom header, so cross-site requests need a preflight) **and**, when present, `Origin == DASHBOARD_ORIGIN`. Bearer requests carry no ambient credentials. |
| CORS | Only `DASHBOARD_ORIGIN`, with credentials; restricted allowed headers. |
| Input validation | Zod schemas on every body, query and parameter; `.strict()` request objects reject unknown fields; domain-level validation of addresses, headers, attachments and dates. |
| Errors | One envelope: `{ error: { code, message, details? }, request_id }`. Internal errors never leak stack traces. |
| Rate limiting | Redis fixed window per key or user per second (`RATE_LIMIT_PER_SECOND`, headers `x-ratelimit-*`, 429 + `retry-after`). Login: 20 per minute per IP. Signup: 5 per hour per IP. Domain verify: 1 per 10 s per domain. |
| Idempotency | `Idempotency-Key` header or `idempotency_key` field, stored per organization with the request hash for 24 h. Replay → same IDs plus `idempotent-replayed: true`; a different body → 409 `idempotency_conflict`. |
| Request IDs | Server-generated `req_…` in every response and log line. |
| Response headers | `x-content-type-options: nosniff`, `cache-control: no-store`. |
| Body limits | 1 MiB by default; 16 MiB `POST /v1/emails`; 32 MiB batch. |
| SSRF | Webhook URL guard at creation and at send time ([THREAT-MODEL](THREAT-MODEL.md)). |
| Secrets | Shown once; never returned by list endpoints (asserted in tests). |
| Public surface | `/healthz`, `/readyz`, `/docs`, `/auth/signup`, `/auth/login`. |

Gaps: API-key IP allow-lists, key expiry reminders, MFA for dashboard users, and Content-Security-Policy on the dashboard host.
