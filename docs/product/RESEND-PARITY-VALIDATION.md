# Resend parity validation ledger

Validated locally on **2026-10-23 (Asia/Calcutta)** against the configured Docker development stack. These results validate the implemented transactional slice, not every Resend capability.

| Check | Result |
| --- | --- |
| `pnpm exec turbo run typecheck --concurrency=1` | Passed in all 17 packages |
| `pnpm exec turbo run test --concurrency=1 -- --maxWorkers=1` | Passed: 123 unit tests across 8 packages; packages without test files are not counted as tested behavior |
| `pnpm test:integration` | Passed: 70 tests across 6 suites, including 10 Batch 1 and 7 product-foundation tests |
| `pnpm --filter @mp/dashboard build` | Passed |
| `pnpm openapi` | Generated successfully from current schemas |
| `pnpm db:migrate` | Applied migrations through `0007_templates_contacts` to the configured development database; integration setup applied them to the separate test database |
| `node scripts/audit-resend.mjs --offline` | Reproduced 425 indexed pages, 2,341 section review items and 29 manually reviewed requirements |
| Source/coverage checks | Every indexed URL is present in the CSV; all 425 cached source hashes match the manifest; migration journal order is valid |

## Behavioral evidence

- **Scheduling:** rescheduling changes all unclaimed scheduled recipients, rejects past/over-horizon/cancelled/cross-tenant requests, and serializes against a due recipient claim. Scheduled mail fails after sending-key revocation. The 24-hour idempotency boundary is checked against stored expiration.
- **Attachments:** signed MIME preserves CID images and ordinary disposition; SMTP conversion normalizes bracketed content IDs. Retrieval is tenant scoped. Remote-download tests use mocked HTTPS/DNS responses to verify positive byte delivery, DNS pinning, mixed public/private DNS rejection, redirect rejection, declared/streamed size caps and unexpected compression rejection. They make no external attachment requests.
- **Text alternatives and SMTP retries:** HTML-to-text generation honors explicit empty text. SMTP integration verifies identical raw-message retries reuse the queued ID and conflicting content or envelope reuse receives 550.
- **Sharing/content authorization:** 48-hour lifetime, expiration, revocation, restrictive CSP, escaped metadata, content-permission denial and RLS isolation for the new share table.
- **Webhooks:** replay retains history, resets only the retry cycle, rejects pending/disabled/cross-tenant requests, and fences expired workers from overwriting a new replay. Existing signed delivery and rotation tests continue to pass.
- **Logs/metrics/export:** request records contain metadata only, new log-table RLS hides other tenants, daily UTC usage/event endpoints read stored data, export requires an admin session, and spreadsheet formula cells are neutralized.
- **Management:** suppression batch atomicity, duplicate handling, lookup, removal and tenant boundaries; key rename retains scope and working authentication while rejecting other tenants.
- **TLS:** a domain configured for enforced TLS is routed through the separate internal transport. The plaintext-only Mailpit sink produces a TLS-related deferral, never plaintext delivery. Existing default delivery/SMTP tests still pass.

## Batch 1 behavioral evidence

- Background exports process 1,201 fixture rows across three chunks, survive a simulated crash/expired lease with a restarted worker, exclude later admissions, produce no duplicate rows, enforce authenticated admin access and the five-job cap, hide cross-tenant metadata/chunks through RLS, and deny expired downloads before purging chunks.
- DKIM keeps the original signing selector while new DNS is missing, switches only after matching TXT verification, rejects stale domain verification snapshots, preserves the old DNS fixture, enforces the seven-day retirement boundary and supports pending cancellation. Existing Postfix delivery tests still verify real signed MIME; no public DNS was changed.
- Simulations exercise success, deferral/recovery, hard bounce and suppression with an MTA spy that receives zero submissions. Repeated bounce runs remain repeatable; a crashed lease recovers without Postfix reconciliation; real/mixed destinations, unknown scenarios and remote attachment URLs are rejected. Events are labelled and daily analytics isolate live data by default.
- Webhook test events carry valid signatures and enforce endpoint throttling and tenant ownership. Health tests cover failure count, duration, auto-disable, durable RLS-protected notifications, successful recovery and a stale in-flight failure after manual re-enabling.
- Source requirements remain partial where behavior differs: exports have no completion email or other-resource support; webhook notifications are in-app; simulation has no complaint/plus-label scenario. DKIM rotation is recorded as an implemented project feature without inventing a matching external requirement.

## Product foundation evidence

- Seven integration tests verify template draft/publication separation, idempotent publishing, immutable send snapshots, pinned older versions, stale/concurrent edits, variable rejection/escaping, archive/restore, batch atomicity, contact duplicate identity, unsubscribe-preserving imports, archive preservation, import validation, pagination, role denial and team-setting tenant boundaries.
- Four renderer unit tests cover HTML escaping, typed defaults, required/unknown values, unsupported expressions and attributes, header injection, non-recursive substitution and bounded expansion.
- Existing non-template REST, signed Postfix delivery and SMTP clients pass the full integration run. A shared test-queue isolation defect discovered in the first full run was corrected by draining earlier real admissions before installing the simulation spy; the subsequent full run passed all 70 tests.
- Templates, Audience and Settings are working sidebar routes with persisted APIs. Published versions have a read/insert-only application grant. New tables enforce tenant RLS. Draft/conflicting writes return explicit errors, and management operations write audit records.
- These areas are partial: visual editing/collaboration, property definitions, CSV import jobs, segments/topics/preferences, broadcast/automation lifecycle, inboxes and account security/lifecycle still require implementation. See [foundation boundaries](../api/PRODUCT-FOUNDATIONS.md).

## Limits of this validation

- Page/section triage remains incomplete as a normative, requirement-by-requirement audit. Only the explicitly reviewed behaviors have been evaluated; no whole product parity percentage is claimed.
- Dashboard compilation and existing component/accessibility tests passed. New dashboard workflows have not had a browser-driven visual/end-to-end review.
- Delivery tests use local Postfix, Mailpit and the MX simulator. No production MX traffic, public DNS provisioning, inbox placement, provider partnerships or production-scale load is certified.
- The first parallel baseline failed from process/memory restrictions. Sequential runs resolved that baseline issue. A textarea typing error and local enforced-TLS relay routing defect found during implementation were corrected before the passing runs.
- Known missing capabilities and intentional API/limit differences remain in the [audit](RESEND-PARITY-AUDIT.md), [feature matrix](FEATURE-MATRIX.md), [roadmap](ROADMAP.md) and [transactional API notes](../api/TRANSACTIONAL-PARITY.md).
