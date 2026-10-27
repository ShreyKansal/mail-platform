# Resend feature coverage

Reviewed 25 October 2026. This is a source and reference audit, not a claim of complete Resend parity or live email delivery validation. A working UI for existing resources does not implement missing product systems.

## Evidence and limits

- The retained official documentation snapshot is `.data/resend-docs/manifest.json`, generated 22 October 2026, with 425 entries. Markdown filenames are SHA-256 hashes of each page URL; the manifest's `sha256` is the content hash. Its earlier static-triage status fields are not implementation proof.
- The supplied Resend captures are retained as `.data/resend-reference/emails.html`, `emails-help.html` and corresponding PNGs. They establish captured email-page appearance, not every authenticated workflow, permission or account state.
- Official public pages were checked again on 25 October: [Receiving](https://resend.com/docs/dashboard/receiving/introduction), [Topics](https://resend.com/docs/dashboard/contacts/manage-topics), [Automations](https://resend.com/blog/introducing-automations), and [Inboxes](https://resend.com/blog/announcing-inboxes). Inboxes was announced on 22 October 2026 and is included below rather than silently omitted.
- Local evidence is the current route handlers, contracts, dashboard pages, permission definitions and SDK source. “Implemented” means a concrete code path exists; deployment, DNS propagation, remote SMTP behavior and full behavioral equivalence require separate integration validation.

## Capability matrix

| Capability | Local coverage | Concrete implementation and remaining difference |
| --- | --- | --- |
| Transactional sending | Implemented | `apps/api/src/routes/emails.ts`, `packages/contracts/src/index.ts`, dashboard `Emails.tsx`: send HTML/text, To/CC/BCC/reply-to, headers, tags and metadata. Limits and wire contracts are local product rules, not assumed identical to Resend. |
| Batch sending and idempotency | Implemented API | Same route file: batches up to 100, request hashing and idempotency replay/conflict handling. No full dashboard bulk operations equivalent. |
| Schedule, reschedule and cancel | Implemented | Email API and detail controls. Cancellation is limited to recipients not yet handed to the mail server; it cannot recall sent mail. |
| Attachment sending and retrieval | Implemented | Contracts support base64 or URL input and inline content IDs. Email attachment routes and detail downloads exist. Local attachment limits apply. |
| Email search, filters and pagination | Implemented | `Emails.tsx`, `EmailFiltersDialog.tsx`, `email-filters.ts`; status, date, source, key, mode and search. Cursor pagination keeps work bounded. This is not Resend's complete query-language equivalence. |
| Email inspection, content and events | Implemented | Email detail, per-recipient state/events, HTML/text and attachment access in `Emails.tsx`; backend content permission retained. Remote acceptance is not proof of inbox placement. |
| Share email | Implemented | `apps/api/src/routes/shares.ts`, email detail: expiring 48-hour links and revocation. |
| Resend/duplicate existing email | Missing dedicated workflow | No resend/duplicate handler or detail action found. A new send request can be made manually; that is not workflow parity. |
| CSV exports | Implemented | Filtered synchronous export up to 1,000 rows, background jobs/download lifecycle in `routes/exports.ts` and `pages/Operations.tsx`. |
| Receiving email | Missing | No received-email resource, inbound content parser/storage, receiving MX workflow, `email.received` contract or receiving tab. Bounce ingestion is not a receiving mailbox. [Reference](https://resend.com/docs/dashboard/receiving/introduction). |
| Shared inboxes and threaded collaboration | Missing | No inbox/thread/folder/label/draft/assignment/note resource. No agent inbox configuration. [Reference](https://resend.com/blog/announcing-inboxes). |
| Templates | Partial | `routes/templates.ts`, `Templates.tsx`: drafts, optimistic revisions, variables, publishing, history, preview, archive/restore, template-based sending. No Resend visual/AI editor or dedicated duplicate/import workflow established. [Reference](https://resend.com/docs/dashboard/templates/introduction). |
| Contacts | Partial | `routes/contacts.ts`, `Audience.tsx`: CRUD-style management, unsubscribe flag, archive/restore, search and atomic JSON import up to 500. JSON import is not the same as Resend CSV/import-job lifecycle. [Reference](https://resend.com/docs/dashboard/contacts/introduction). |
| Custom contact properties | Partial | `contactWrite`/`contactView` already store up to 50 properties, and the contact form exposes a JSON object. No separate property-definition catalog, typed property administration or broadcast personalization flow. [Reference](https://resend.com/docs/dashboard/contacts/properties). |
| Segments | Missing | No segment resource or contact membership routes/UI. Contact filtering does not create saved segments. [Reference](https://resend.com/docs/dashboard/contacts/manage-segments). |
| Topics and preference management | Missing | A contact's global unsubscribe flag exists, but there are no topic subscriptions, topic defaults/visibility or hosted per-topic preference pages. [Reference](https://resend.com/docs/dashboard/contacts/manage-topics). |
| Broadcast campaigns | Implemented core workflow; partial Resend parity | `routes/broadcasts.ts`, `core/src/broadcasts.ts`, dashboard `Broadcasts.tsx`: persisted drafts, HTML/plain-text editor/preview, all subscribed or selected contacts, audience snapshots, send/test/schedule/cancel, duplicate/delete drafts, resumable quota-aware worker, signed unsubscribe links and transport-state statistics. Missing: visual drag-and-drop editor, segment/topic targeting, engagement tracking and campaign CSV export. See `docs/help/BROADCASTS.md`. [Reference](https://resend.com/docs/dashboard/broadcasts/introduction). |
| Automation workflows | Implemented core workflow; partial Resend parity | Tenant-scoped custom events with typed schemas and idempotency, versioned publish, explicit connected steps, persistent delays/wait-for-event timeouts, typed AND/OR conditions, email personalization and template snapshots, pause/resume, run inspector, retry/cancel, dry-run preview, REST and SDK. Applications post events explicitly. No drag-and-drop graph canvas, organization-wide event catalog, cron or external connectors. See `docs/design/AUTOMATIONS-IMPLEMENTATION.md`. [Reference](https://resend.com/blog/introducing-automations). |
| Domain verification and sending security | Implemented local subset | `routes/domains.ts`, `Domains.tsx`, `packages/core/src/domains.ts`: add/list/detail/remove, DNS verification, DKIM rotation and outbound TLS policy. Resend regional sending, configuration and provider-specific DNS behavior are not proven equivalent. |
| Open/click tracking and custom tracking domains | Missing | Contracts enumerate transport/delivery events but no open/click event, tracking pixel, link rewrite or tracking-domain setting was found. Analytics must not invent these rates. [Reference](https://resend.com/docs/dashboard/domains/tracking). |
| API keys | Implemented local subset | `routes/credentials.ts`, `ApiKeys.tsx`, `packages/core/src/credentials.ts`: create/list/rename/revoke with scopes and secret lifecycle. Local permission model differs from Resend. |
| SMTP credentials and instructions | Implemented | Same credential route file and `Smtp.tsx`; own SMTP credential model and sending instructions. [Reference](https://resend.com/docs/send-with-smtp). |
| Webhooks | Implemented local subset | `routes/webhooks.ts`, `Webhooks.tsx`: CRUD, signed test, delivery attempts, replay, secret rotation. Events are the local `EVENT_TYPES`; absent receiving/contact/topic/inbox events must not be advertised. |
| API request logs | Implemented | `routes/insights.ts`, `Activity.tsx`: redacted request logs with inspection. Retention and query syntax are not asserted equivalent. |
| Analytics and usage | Partial | Selected-period overview, transport-event daily totals and accepted email/recipient usage. No engagement or campaign metrics; local data must remain accurately labeled. |
| Suppressions | Implemented | `routes/insights.ts`, `Suppressions.tsx`: list/add/remove and batch API operations. Global suppression is distinct from topic preference management. |
| Teams/workspaces and roles | Partial | Session organization/project isolation, six permission roles in `packages/permissions/src/index.ts`, member display and workspace rename in Settings. No invite/revoke invitation, role-change UI/API, switch/create team, ownership transfer or team deletion workflow found. [Reference](https://resend.com/docs/dashboard/settings/team). |
| Quotas and billing | Partial | Development sending limits and optional local unlimited mode exist. Production changes are administrator controlled. No plan checkout, invoices, payment methods or usage billing implementation. |
| SDK and developer tools | Partial | `packages/morphmailer` is a real JS/TS client for email send/list/get/update/cancel, batch send, the Broadcasts lifecycle, automation workflows, event submission and run controls; the API guides use real endpoints. It does not cover every local resource, other-language SDKs, Resend CLI, MCP or integration ecosystem. |

## Implementation rules for the revamp

1. Navigation and primary actions expose working local capabilities only. Missing modules belong in this engineering backlog, not as empty non-working tabs or invented sample metrics.
2. For each collection, distinguish first-use empty, filtered empty, loading, populated, long-content/cursor-paginated, permission denied and recoverable error. Preserve filters and focus through mutations and navigation.
3. Keep server filtering and cursor pagination as the large-data boundary. Do not label a loaded page's row count as the total dataset. Sorting loaded rows must not imply global sorting.
4. Add a missing feature with its contract, tenant/permission enforcement, persistence, worker/infrastructure behavior, recovery states and meaningful integration checks. A button or page alone cannot close a matrix gap.
5. Verify desktop and narrow layouts, actual production CSS, keyboard/overlay focus, Inter font loading, dark/contrast themes and long values. Browser fixtures verify UI states; they do not validate live infrastructure.

## Unverified scope

Authenticated Resend screens beyond the supplied capture, account/plan-specific controls, exact feature entitlements and real delivery infrastructure have not been exhaustively exercised. Consequently this document deliberately makes no “nothing missed” or full-clone claim. The matrix records major capability families and concrete known gaps so subsequent work can be tracked truthfully.
