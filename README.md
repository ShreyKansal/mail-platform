# MAIL_PLATFORM

A multi-tenant email service provider that runs its **own SMTP delivery infrastructure**. Customers verify their domains, then send through a REST API or authenticated SMTP. The platform signs mail with DKIM and hands it to its own Postfix MTA, which delivers directly to recipient MX servers. It reports what actually happened: hand-off to the MTA, remote SMTP acceptance, deferral, bounce. It never claims inbox placement.

No third-party email-sending service is used anywhere in the delivery path.

> **Status:** Milestone 0 and a working core of Milestone 1. [docs/product/FEATURE-MATRIX.md](docs/product/FEATURE-MATRIX.md) lists exactly what is built, partial or not started. Production go-live is blocked on external prerequisites (public sending IPs with rDNS, port 25 egress, TLS certificates, DNS for the platform's own domains); see [docs/operations/PRODUCTION-DEPLOYMENT.md](docs/operations/PRODUCTION-DEPLOYMENT.md).

## What works today

- **Accounts and tenancy:** signup and login (Argon2id, lockout), organizations → workspaces → projects, RBAC with 6 roles and scoped API keys, PostgreSQL row-level security on every tenant table.
- **Domains:** DNS ownership challenge, generated 2048-bit DKIM keys (encrypted at rest), a custom Return-Path (MX + SPF), and DMARC diagnostics. The verifier distinguishes missing, invalid, conflict, propagating and temporary-error states, and schedules re-verification to detect drift.
- **Sending:** `POST /v1/emails` and batch, idempotency keys, scheduling, cancellation, attachments, header-injection protection, sandbox quotas. SMTP submission is on 587 (STARTTLS) and 465 (implicit TLS) with mandatory AUTH, so it is never an open relay.
- **Delivery:** a dispatcher with leased claims (`FOR UPDATE SKIP LOCKED`), VERP return paths with HMAC-authenticated tokens, and Postfix owning remote retries. Delivery outcomes are reconciled from the Postfix log, and ambiguous hand-offs are resolved without blind retries.
- **Bounces:** the remote SMTP reply and RFC 3464 DSNs are both parsed and classified (hard, soft, policy, authentication, greylisting and more). Hard bounces add the address to a tenant-scoped suppression list automatically.
- **Webhooks:** Standard-Webhooks HMAC signatures, a transactional outbox, retries with backoff, dead-lettering, and SSRF protection with DNS pinning.
- **Dashboard (mymorphix Mailer):** React, built with the official Atlassian Design System components and tokens (light, dark and increased-contrast themes). Pages cover an overview with a Get started checklist, emails with per-recipient timelines, domains with DNS records, API keys, SMTP credentials, webhooks and suppressions, plus an in-app guides centre.
- **Operations:** Prometheus metrics, structured and redacted logs, OpenAPI 3.1 with interactive docs at `/docs`, production Docker images, and CI.

## Quick start (local)

**Windows, one step:** start Docker Desktop, then double-click `run-local.cmd`. It installs dependencies and creates `.env` if needed, starts the containers, applies migrations, and runs every service in one window. Press Ctrl+C in that window to stop.

**Any OS, after the first-time setup below:** `pnpm dev:infra && pnpm db:migrate && pnpm dev` starts everything in one terminal.

Manual setup. Prerequisites: Node.js 24, pnpm 9.15.4, Docker.

```bash
pnpm install
pnpm setup                 # writes .env with fresh secrets, creates .data/
pnpm dev:infra             # Postgres, Redis, Postfix, Mailpit, MX simulator
pnpm db:migrate            # applies migrations as the schema owner (DATABASE_MIGRATION_URL in .env)

# one terminal per process (or your process manager of choice)
pnpm dev:api               # http://localhost:3000  (API docs at /docs)
pnpm dev:worker
pnpm dev:reconciler
pnpm dev:bounces
pnpm dev:webhooks
pnpm dev:verifier
pnpm dev:smtp              # 2587 STARTTLS / 2465 implicit TLS
pnpm dev:dashboard         # http://localhost:5173
```

Local mail never leaves your machine. Postfix relays everything to **Mailpit** (http://localhost:8025), except addresses at `mx-sim.test`, which go to a scriptable MX simulator. For example, `unknown…@mx-sim.test` returns 550 5.1.1 and `defer…@mx-sim.test` greylists. Domain verification reads DNS from `.data/dns-fixture.json`; run `pnpm --filter @mp/api dev:publish-dns <domain>` to "publish" a domain's records there. Full walkthrough: [docs/operations/LOCAL-DEVELOPMENT.md](docs/operations/LOCAL-DEVELOPMENT.md).

## Tests

```bash
pnpm typecheck
pnpm test                  # unit tests (protocol parsing, DNS, RBAC, signatures, components)
pnpm test:integration      # needs `pnpm dev:infra`; real Postgres, Redis, Postfix
```

The integration suites send real SMTP through Postfix and cover end-to-end delivery with DKIM verification, hard bounces and suppression, greylisting, signed webhooks, SMTP AUTH, open-relay rejection, cross-tenant isolation (API and RLS), header injection, quotas and SSRF. See [docs/testing/TEST-STRATEGY.md](docs/testing/TEST-STRATEGY.md).

## Repository layout

```
apps/api                    Fastify control-plane API (OpenAPI 3.1)
apps/dashboard              React dashboard
services/mail-worker        dispatcher: claim → compose + DKIM sign → hand off to Postfix
services/delivery-reconciler Postfix log → recipient states, bounces, suppressions
services/bounce-processor   SMTP receiver for VERP DSNs
services/webhook-dispatcher signed webhook delivery
services/domain-verifier    scheduled DNS (re)verification
services/smtp-submission    authenticated SMTP submission (587/465)
packages/*                  shared libraries (database, core, mail-protocol, dns-verification, contracts, permissions, tokens, observability, shared)
infrastructure/             Postfix image, MX simulator, Postgres init, app Dockerfile
tests/                      integration, SMTP and security suites
docs/                       architecture, API, guides, operations, security
```

## Documentation

The [Resend parity audit](docs/product/RESEND-PARITY-AUDIT.md), [CSV](docs/product/RESEND-PARITY-AUDIT.csv) and [validation ledger](docs/product/RESEND-PARITY-VALIDATION.md) track gaps and evidence. [Transactional additions](docs/api/TRANSACTIONAL-PARITY.md) cover rescheduling, attachments, sharing, export, logs, metrics, webhook replay and per-domain TLS. Full Resend parity is not yet implemented.

Start at [docs/README.md](docs/README.md).

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
