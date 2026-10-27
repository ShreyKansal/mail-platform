# Broadcasts and white theme implementation

Implemented 25 October 2026. User-facing instructions are in [Broadcasts help](../help/BROADCASTS.md). The supplied Resend HTML established the list reference; the local editor and queue are independently implemented using the existing platform infrastructure.

## Working scope

- Persistent, tenant-isolated drafts, optimistic revisions, lightweight searchable/status-filtered cursor lists, duplication and draft deletion. Lists omit message bodies and selected-contact ID arrays.
- HTML/plain-text editing and sandboxed preview. All subscribed contacts or a paged/searchable selected-contact picker. Saved draft counts exclude archived, unsubscribed and suppressed contacts.
- Explicit real test sending, immediate/scheduled campaign start, cancellation and resuming failed pending work. Scheduling accepts future dates within 30 days. Starting freezes the audience and content; editing requires a new draft/duplicate thereafter.
- A durable per-contact ledger expanded in 25-contact transactions through the existing admission path. Each email has exactly one recipient and uses the marketing stream. Queue admission and its ledger update commit together; quota limits defer pending work instead of silently dropping contacts.
- Subscription/archive/address/cancellation checks run again before transport. Already handed-off email cannot be recalled. Completed means campaign fanout processing completed, not inbox delivery.
- Purpose-signed unsubscribe links, visible HTML/text footer, GET confirmation and idempotent POST unsubscribe. One-click headers are DKIM-covered by the existing composer; production campaign start requires an HTTPS public API URL. Header/POST design references [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.html). Capability paths are redacted from request logs.
- Separate broadcasts read/manage/send permissions, audits, API reference schemas and typed Morphmailer SDK lifecycle methods.
- Pure white light-theme canvas, sidebar and global header, including table toolbar/footer base surfaces. Dark/contrast support is retained. Small neutral hover/selected states remain distinct controls.

Migration `0009_broadcasts.sql` was generated with a schema snapshot/journal entry, tested against new isolated databases and applied to the local application DB. It adds campaigns/ledger tables, foreign keys, indexes, RLS policies and runtime-role grants. It does not alter existing mail or contact records. Workers default to both streams for the single local setup; separate production pools should explicitly select each stream (see queue architecture).

## Verification

- Dashboard/API/worker production builds; API, dashboard, worker, database and integration test typechecks; design audit.
- Dashboard 30 tests, core 29 tests, SDK 8 tests, existing API 3 tests.
- Six PostgreSQL integration scenarios in `tests/integration/broadcasts.test.ts`, run with `pnpm --filter @mp/tests exec vitest run --config vitest.broadcasts.config.ts`. Each run creates and drops its own randomly named database. SMTP is a recording transport, not an external send. Coverage: revision races, tenant RLS, list cursors/search, duplicate/delete, audience exclusions/freeze, competing workers, per-recipient marketing admission, post-queue unsubscribe checks, signed headers/links, GET versus POST behavior, future scheduling/cancel, interrupted-domain recovery, quota pause/resume and permission denial.
- `.data/check-broadcast-ui.mjs`: production workflows at 1440/390/320 light, 1280 dark and 1280 increased contrast. Verified pure-white base surfaces, empty/create/editor, failed-save recovery, normalized saves, contact selection across pages, review/schedule/cancel, same-revision worker progress, 73-record list paging, URL filters, API sheet and read-only controls. Axe checks run on empty, editor, review, completed and large-list states in each layout.
- Visual review: `.data/ui-check/broadcast-*.png`. Actual HTML preview text was additionally verified through the sandboxed frame; `.data/ui-check/broadcast-preview-verified.png` records it. The email frame preserves customer HTML styling; app chrome and code use Inter.
- REA controlled production-fixture list capture: `ev_7040016e48437822f7fba0d195393d933e7e5defe8cfda1d38161e20cec59ec3`, complete capture with no page errors, retained in `.data/reviews/broadcasts-implemented.evidence.json`. This is local fixture evidence, not a live Resend session or proof of remote inbox placement.

## Remaining parity boundaries

The working editor edits HTML/plain text; it is not Resend's visual or collaborative editor. Saved segments/topics, audience groups, open/click engagement tracking and campaign CSV export remain absent and are not exposed as pretend controls. [RESEND-FEATURE-COVERAGE.md](RESEND-FEATURE-COVERAGE.md) records the broader product gaps.
