# Security tests

All of these are in `tests/security/isolation.test.ts` unless noted. They run against real Postgres RLS.

| Threat | Test |
|---|---|
| Cross-tenant reads via the API | "tenant B cannot read tenant A resources through the API" (emails, list, domains, cancel → 404 / empty) |
| RLS bypass by an unfiltered query | "row-level security hides other tenants…" (also: an unbound app role sees zero rows) |
| Cross-tenant writes | "row-level security rejects writes into another tenant" (UPDATE affects 0 rows; INSERT violates the policy) |
| Reading password hashes or sessions | "the app role cannot read password hashes or sessions" (permission denied) |
| Domain takeover | "a domain verified by tenant A cannot be claimed by tenant B…" (invalid token, then 409) |
| Unauthorized sender domain | "rejects unverified From domains" |
| Header / CRLF injection, reserved headers, executable attachments | "blocks header injection and unsafe input" (6 cases) |
| API key escalation and revocation | "enforces API key scopes and revocation" (sending key can't read domains; a key can't create keys; a revoked key → 401) |
| Quota bypass | "enforces the per-tenant sending quota" |
| CSRF | "requires the CSRF header and a matching Origin…" |
| Credential enumeration | "rejects wrong passwords with a generic message" |
| SSRF | "rejects private, loopback and metadata targets…" (169.254.169.254, 127.0.0.1, 10/8, ::1, http, userinfo) |
| Forged bounces | `mail-protocol` VERP tests (tampered MAC, wrong secret) |
| Webhook signature bypass and replay | `core/webhook-signature.test.ts` |
| Open SMTP relay; credential revocation | `tests/smtp/submission.test.ts` |
| Stored XSS in previews | By construction (sandboxed `iframe`). **No automated browser test yet.** |

Not yet tested: rate-limit bypass across many keys, inbound MIME attack corpora, timing attacks on login (mitigated in code but not measured), and pen-test findings.
