# Feature matrix

This is the implementation status against the master build specification. Each row is one of:

- **Built:** working backend, persistence, authorization, validation and tests.
- **Partial:** the parts that exist meet that bar, but some scope is missing. The missing part is named.
- **Not started:** no code exists yet.

Last reviewed: 2026-10-23. Resend comparison: [page coverage audit](RESEND-PARITY-AUDIT.md) and [requirement CSV](RESEND-PARITY-AUDIT.csv). Indexed coverage is not behavioral certification; full parity remains open.

## Foundation (Milestone 0)

| Area | Status | Notes |
| --- | --- | --- |
| Monorepo (pnpm, Turborepo, strict TS) | Built | Dependencies pinned to exact versions (`pnpm pin-deps`). |
| Database and migrations | Built | Drizzle schema, generated + hand-written SQL migrations, separate owner/app/service roles. |
| Docker Compose dev stack | Built | Postgres, Redis, Postfix, Mailpit, MX simulator. |
| CI | Built | Typecheck, unit tests, dashboard build, OpenAPI drift check, integration suites, image builds. |
| Design system | Built | Official Atlassian Design System packages (`@atlaskit/*` components and `@atlaskit/tokens`) with light, dark and increased-contrast themes, mymorphix Mailer branding, and component tests with axe-core checks. Storybook is not started. |
| In-app guides | Partial | Guides centre at `/guides` renders the repository Markdown docs, with search and a contextual "Guide" link on every page. Some catalogued guides are still being written and show a "being written" notice. |
| Kubernetes, Terraform, Ansible | Not started | Only Docker images exist so far. |

## Transactional core (Milestone 1)

| Area | Status | Notes |
| --- | --- | --- |
| Organizations, workspaces, projects | Partial | Created at signup. There is no UI or API yet to create extra workspaces/projects or switch between them, and member invitations are not started. |
| Email/password auth, sessions | Built | Argon2id, lockout, throttling, HttpOnly cookie, CSRF header and Origin check. |
| MFA (TOTP, WebAuthn), SSO (SAML, OIDC), SCIM | Not started | |
| RBAC | Built | 6 org roles plus 2 API key scopes, enforced server-side per route. Platform admin roles exist in the schema but have no admin console. |
| API keys | Built | Hashed, scoped, domain restriction, expiry, revocation, last-used tracking. |
| Domain onboarding and DNS verification | Built | Ownership TXT, DKIM, Return-Path MX/SPF (real SPF evaluation when outbound IPs are configured), DMARC parsing, propagation detection, scheduled re-verification, drift handling, cross-tenant claim protection. |
| DKIM | Built | 2048-bit encrypted keys; DNS-gated selector rotation, seven-day overlap, pending cancellation and verifier-driven retirement. Old public DNS records must remain published during overlap. |
| Custom Return-Path and VERP | Built | HMAC-authenticated tokens, per-recipient envelope, falls back to the platform bounce domain until verified. |
| `POST /v1/emails`, batch, get, list, cancel | Built | Idempotency, scheduling, attachments, header/CRLF injection protection, quotas. Rescheduling locks recipient rows against worker claims. List filters include date, key, source and literal search. |
| Attachment parity | Partial | HTTPS remote fetch with public DNS pinning, bounded reads, CID composition/preservation, and authorized list/retrieve endpoints. Stored in PostgreSQL; limits differ from Resend. |
| Email sharing and exports | Partial | Revocable 48-hour public content links; admin-session immediate CSV up to 1,000 emails and resumable background exports up to 100,000 rows with seven-day authenticated downloads. Other resources and completion emails remain missing. |
| Per-domain outbound TLS | Built | Opportunistic default; enforced policy uses a dedicated Postfix listener/transport with no plaintext fallback. Policy is checked at dispatch. |
| Deterministic delivery simulations | Partial | Explicit API `test_mode`, reserved success/defer/bounce/suppress addresses, no MTA handoff, repeatable outcomes and separate daily metrics. Complaint/label scenarios remain missing. |
| Templates and variables | Partial | Draft editor, typed/default variables, safe preview, immutable publications/history, pinned sending, revision conflict checks and archive/restore. Uses template.id/version/variables on sends. Visual editor, duplication and collaboration remain missing. |
| SMTP submission (587/465) | Built | Mandatory AUTH over TLS, credential IP restriction, auth throttling, revocation, CID preservation and 24-hour idempotency through `X-MP-Idempotency-Key`. |
| Postfix outbound integration | Built | Internal hand-off on :10025; Postfix owns remote retries. |
| Delivery state machine and reconciliation | Built | Postfix log reconciler, DELIVERY_UNKNOWN resolution, lease recovery. |
| Webhooks | Built | Signing, retries, dead-letter, secret rotation, SSRF protection, terminal-delivery replay and paginated attempt inspection. Replay retains history and starts a fresh retry cycle. Auto-disable after ten consecutive failed attempts spanning 24 hours, durable project notifications, health timestamps and signed test events. Team email notifications remain missing. |
| Logs/events API, overview analytics | Partial | `/v1/events`, `/v1/overview`, `/v1/analytics`, `/v1/usage`, and authenticated request metadata at `/v1/logs`. Dashboard logs and UTC daily metric tables. Unauthenticated request logs, rollups, rich deliverability insights and engagement tracking are not implemented. |

## Deliverability and BIMI (Milestone 2)

| Area | Status | Notes |
| --- | --- | --- |
| Bounce processing and suppression | Built | Postfix log and RFC 3464 DSNs, classification, automatic hard-bounce suppression, re-checked at dispatch. |
| Complaint / FBL ingestion (ARF) | Not started | |
| IP pools, dedicated IPs, warmup | Not started | Single Postfix transport today. |
| Reputation dashboards | Not started | |
| BIMI (records, SVG validation, VMC/CMC) | Not started | `mailauth` (already a dependency) provides BIMI/VMC validation primitives for this milestone. |
| Admin controls (abuse review, tier changes) | Not started | Tiers and limits exist in the database and are changed directly for now. |

## Later milestones

| Area | Status |
| --- | --- |
| Billing, plans, metering, invoices | Not started |
| Settings | Partial: account/project summary, team member list, admin team rename and operational links; invitations, MFA, SSO, recovery and account lifecycle remain pending |
| Audit log UI | Partial (audit records are written for credential, domain, webhook and suppression changes; there is no viewer yet) |
| Contacts | Partial: project-scoped CRUD, custom values, subscription status, archive/restore and atomic JSON import; property registry, CSV jobs, topics and segments are pending |
| Broadcasts, automations, RFC 8058 unsubscribe | Not started |
| Visual template editor | Not started |
| Inbound email routing | Not started |
| SDKs (TypeScript, Python, PHP, Go, Java, C#, Ruby), CLI | Not started. The OpenAPI document in `docs/api/openapi.json` is the contract they will be generated from. |
| Docs site (Docusaurus) | Not started. The Markdown in `docs/` is the source. |
| Load testing, penetration testing, DR drills | Not started |

## Known limitations of built features

- Attachments are stored base64 in PostgreSQL. Object storage is planned with the attachments/inbound work.
- SMTP inline content IDs are preserved. Messages still need at least one visible `To` recipient (BCC-only submissions are rejected).
- API attachments are limited to 10 MiB decoded per email and 24 MiB per request; remote URLs require public HTTPS, never follow redirects and time out after 10 seconds for connection/download. Sharing excludes recipient lists and attachments. Immediate CSV is capped at 1,000 emails; background email CSV at 100,000, with five active jobs per project, seven-day downloads and 30-day metadata retention.
- Request metadata logs retain only route templates, method, status, timing and identifiers for authenticated tenant requests. The worker purges logs after 30 days; email content retention remains unimplemented.
- High-volume tables (`email_events`, `email_delivery_attempts`) are not yet partitioned, and retention is not configurable yet.
- Postfix logs have one-second timestamp resolution, so remote-outcome times are clamped to be monotonic per recipient.
- Recipients stuck in `DISPATCHING`/`DELIVERY_UNKNOWN` resolve only while the delivery reconciler is running. Nothing reconciles `MTA_ACCEPTED`/`DEFERRED` recipients if a Postfix queue volume is lost.
- One Postfix node per database: the reconciler checkpoint name is fixed (`postfix-log`). Multiple MTA nodes need per-node checkpoints.
- Domain events (`domain.verified`, `domain.verification_lost`) reach webhooks and the audit log but are not listed by `GET /v1/events`.
- `CREATED`, `VALIDATING`, `ACCEPTED` and `REJECTED` are defined states, but admission currently writes recipients directly as `QUEUED`, `SCHEDULED` or `SUPPRESSED` in one transaction.
- `VERP_SECRET` has no dual-secret window: rotating it loses bounce correlation for mail still in flight.
- The bounce processor is ready for internal routing from Postfix, but not yet for use as the public bounce MX. It binds to loopback by default and has no STARTTLS certificate wired up.
- DMARC is checked at the organizational domain only. A `_dmarc` record published on a sending subdomain is not read.
- Deleting messages from the Postfix queue by hand (`postsuper -d`) writes no delivery line, so those recipients stay `MTA_ACCEPTED`. There's no admin endpoint to fail them yet.
- Removing an old `ENCRYPTION_KEYS` entry requires re-sealing stored secrets first, and there's no re-wrap job yet.
- Platform roles (`super_admin`, `security_admin`, `support`) exist in the schema but are unused. Sessions always use the organization's first project.
- New signups are not email-verified yet. Keep `ALLOW_PUBLIC_SIGNUP=false` in production until they are (see [../security/ABUSE-PREVENTION.md](../security/ABUSE-PREVENTION.md)).
