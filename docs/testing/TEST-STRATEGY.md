# Test strategy

Real dependencies over mocks: the integration suites run against real PostgreSQL (with RLS), Redis, Postfix, the MX simulator and Mailpit. No mock delivery results exist anywhere in the codebase.

## Suites

| Command | Needs infrastructure | Contents |
|---|---|---|
| `pnpm test` (turbo → each package's `vitest run`) | no | Unit tests |
| `pnpm --filter @mp/dashboard test` (included above) | no | Component tests under jsdom, including axe-core |
| `pnpm test:integration` | yes (`pnpm dev:infra`) | Integration, SMTP and security suites (`tests/vitest.integration.config.ts`) |
| `pnpm typecheck` | no | `tsc` across every workspace |

### Unit test files

| File | Covers |
|---|---|
| `packages/mail-protocol/src/protocol.test.ts` | Address parsing and IDN, header-injection rules, VERP encode/decode and forgery, SMTP reply parsing, bounce classification table, Postfix log parser (real 3.7.11 fixtures), DSN parser, state-machine invariants, MIME and DKIM (nodemailer signs, mailauth verifies) |
| `packages/dns-verification/src/verification.test.ts` | Expected records; ownership, DKIM, MX, SPF (including real evaluation) and DMARC statuses; propagation detection; SPF/DKIM/DMARC parsers |
| `packages/permissions/src/permissions.test.ts` | Role and scope matrices; escalation rules |
| `packages/core/src/webhook-signature.test.ts` | Signing, tampering, replay window, rotation; deterministic IDs |
| `services/mail-worker/src/mta.test.ts` | Hand-off error classification; backoff |
| `services/smtp-submission/src/submission.test.ts` | Envelope/header recipient handling, header carry-over, SMTP error mapping, CIDR matching |
| `apps/dashboard/src/components/components.test.tsx` | Field labelling, busy state, modal focus and Escape, table semantics and keyboard operation, axe checks (colour contrast excluded under jsdom) |

### Integration test files (`tests/`)

| File | Covers |
|---|---|
| `integration/delivery.test.ts` | Acceptance Tests A, B, C, E and F, idempotency, cancellation, greylisting, overview |
| `smtp/submission.test.ts` | Test D and SMTP security ([SMTP-TESTING](SMTP-TESTING.md)) |
| `security/isolation.test.ts` | Tenant isolation, input safety, scopes, quotas, CSRF, SSRF ([SECURITY-TESTS](SECURITY-TESTS.md)) |

**How the harness works** (`tests/support/`):
* `global-setup.ts` checks the ports, refuses to start if 2525 is busy, migrates `mail_platform_test` and truncates every table.
* `harness.ts` builds the real API (`fastify.inject`), dispatcher, reconciler, webhook dispatcher and a bounce server on :2525, then pumps the worker loops until a condition holds.
* Suites run sequentially because they share Postfix, the bounce port and the database. Test secrets are fixed so mail queued by one file can be dispatched by the next.
* `TEST_BOUNCE_BIND=0.0.0.0` is needed on Linux (Docker's `host-gateway` is the bridge interface, not loopback).

## CI (`.github/workflows/ci.yml`)

1. **checks**: install with the frozen lockfile, typecheck, unit tests, dashboard build, and a check that `docs/api/openapi.json` is up to date.
2. **integration**: `docker compose up --wait`, make the Postfix log readable, run the suites with `TEST_BOUNCE_BIND=0.0.0.0`, and print the Postfix log tail on failure.
3. **images**: build all eight production images.

## Rules

* Staging and tests never send to uncontrolled external addresses. Compose relays everything to Mailpit, and simulated failures use `@mx-sim.test`.
* No snapshot tests of generated secrets. No tests that depend on wall-clock ordering beyond the documented 1-second Postfix resolution.

## Not built yet

Load tests (100, 1,000 and 10,000 messages per minute profiles), Playwright end-to-end tests of the dashboard, contract tests for SDKs (no SDKs yet), and fuzzing of the MIME and DSN parsers.
