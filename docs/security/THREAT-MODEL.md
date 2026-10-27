# Threat model

Scope: the components implemented today, namely the API, dashboard, smtp-submission, mail-worker, Postfix, delivery-reconciler, bounce-processor, webhook-dispatcher, domain-verifier, PostgreSQL and Redis. The format is STRIDE: each threat is listed with its mitigation **in code**, or marked **gap**.

## Assets

Customer sending reputation and domains; DKIM private keys; API keys and SMTP credentials; webhook secrets; message content and recipient addresses; platform IP reputation; tenant isolation.

## Spoofing

| Threat | Mitigation |
|---|---|
| Sending as a domain the tenant doesn't control | `From` must be on a domain verified **in the same project** with ownership TXT and DKIM (`findSendingDomain`). Checked for the API and SMTP alike. |
| Claiming another tenant's domain | The ownership token is random per domain row. A partial unique index allows only one *verified* owner per name, which `tests/security/isolation.test.ts` asserts. |
| Forged bounces suppressing addresses or marking mail bounced | VERP HMAC is verified at `RCPT TO` before any database access. |
| Stolen API key | Keys are hashed (SHA-256) and scoped. They can't create keys or manage members. Revocation is immediate, and keys can be restricted to one domain. **Gap:** no IP allow-lists for API keys, no anomaly detection. |
| Session theft | HttpOnly, SameSite=Lax, Secure in production; sessions are revocable and expire. **Gap:** no MFA or WebAuthn. |
| Brute-forcing passwords | Argon2id; account lockout for 15 minutes after 10 failures, with every further failure re-locking until a successful login resets the count; per-IP login throttle, generic error message, timing equalized for unknown accounts. |
| SMTP AUTH brute force | 10 failures per 10 minutes per IP. Credentials are 192-bit random. |

## Tampering

| Threat | Mitigation |
|---|---|
| Header / CRLF injection | Address, subject and header validation rejects control characters; reserved headers are platform-owned. Tests cover each case. |
| Altered message in transit | DKIM over the identity and list headers; TLS to Postfix receivers when offered. **Gap:** the hand-off to Postfix over the private network is plaintext. |
| Cross-tenant writes | Postgres RLS with `WITH CHECK` on every tenant table for `mp_app`. Tested. |
| Webhook payload tampering | HMAC-SHA256 Standard-Webhooks signatures with a timestamp. |

## Repudiation

An audit log records key, credential, domain, webhook and suppression changes and organization creation, with actor, IP and request ID. The table is append-only for `mp_app`. **Gap:** login events and SMTP auth failures are only in application logs.

## Information disclosure

| Threat | Mitigation |
|---|---|
| Cross-tenant reads | RLS (the app role sees zero rows without a bound tenant) plus explicit `org_id` filters. Tested. |
| Password hashes / sessions via the app role | Column-level grants: `mp_app` can't select `password_hash` or `user_sessions`. Tested. |
| Message content to under-privileged members | `emails:read_content` is required (analyst and read-only roles lack it). |
| Stored XSS via email HTML preview | Rendered in an `<iframe sandbox="">` with `srcDoc`: no scripts, opaque origin. |
| Secrets at rest | DKIM keys and webhook secrets are sealed with AES-256-GCM and an AAD bound to the row. API and SMTP secrets are hashed. |
| Secrets in logs | pino redaction list; bodies are never logged. |
| SSRF via webhooks | https only, no credentials in the URL, port allow-list, every resolved address must be public unicast, the connection is pinned to the validated IP, redirects aren't followed. Tested. |
| SSRF/LFI via message composition | nodemailer `disableFileAccess` and `disableUrlAccess`. |

## Denial of service

Per-key/user request rate (Redis, fails open); per-org daily and per-minute recipient quotas enforced transactionally under an advisory lock; body limits (1 MiB default, 16/32 MiB for send endpoints, 25 MiB SMTP); 50 recipients per email; 100 emails per batch; DNS verification throttled to once per 10 s per domain; webhook timeouts of 10 s. **Gap:** no global connection limits or WAF; a Redis outage disables per-request rate limiting.

## Elevation of privilege

Permissions are checked server-side on every route. Role assignment is limited to subsets of the actor's own permissions (`canAssignRole`; there's no member-management API yet). API keys are capped below user privileges. Workers use a separate BYPASSRLS role that is never reachable from request handlers.

## Abuse of the platform (spam, phishing)

See [ABUSE-PREVENTION](ABUSE-PREVENTION.md). Main gaps: no signup email verification, no content or malware scanning, no complaint loop.
