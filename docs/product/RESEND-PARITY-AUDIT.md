# Resend parity audit

Generated: 2026-10-22T21:08:47.147Z. Source: [Resend documentation index](https://resend.com/docs/llms.txt).

Coverage: **425 indexed pages**, **2341 section-level review items**, **29 manually reviewed behavioral requirements**. Successful source fetches: **425**.

**Overall parity remains incomplete.** Page/section rows are static triage, not normative specifications or behavioral certification. Manually reviewed requirements below cover individual behaviors only. A verified requirement never certifies its whole source page. Remaining sections still need detailed behavior, limit, permission, failure and test review.

## Evidence and reproduction

- Run `pnpm audit:resend` to refresh public sources and reports; `pnpm audit:resend:offline` regenerates from the local cache.
- Full source snapshots, hashes and manifest are stored under ignored `.data/resend-docs/`. Source text is never executed.
- The companion CSV retains every source page, including repeated tutorials. Capability names deduplicate the work; requirements with different behavior must remain separate.
- Evidence paths are candidates identified during repository inspection. Test references mean tests exist, not that they passed or prove the entire source page.
- Allowed statuses: verified match, partial, missing, unverified, external dependency. Automatic page classifications are conservative triage. Verified matches are explicitly curated individual behaviors with implementation/test evidence.
- Public mail infrastructure, commercial integrations and provider approvals remain external dependencies, even after implementation.

## Capability coverage

| Capability | Pages | Phase |
| --- | ---: | ---: |
| api-keys | 8 | 1 |
| attachments | 5 | 1 |
| automations | 29 | 4 |
| billing | 3 | 6 |
| contact-management | 10 | 3 |
| domain-claims | 5 | 1 |
| domains | 32 | 1 |
| ecosystem | 76 | 6 |
| email-management | 4 | 1 |
| general | 9 | 0 |
| identity | 10 | 2 |
| inboxes | 57 | 5 |
| marketing | 57 | 3 |
| metrics | 2 | 1 |
| oauth | 7 | 6 |
| provider-dependencies | 6 | 6 |
| receiving | 16 | 5 |
| regional-delivery | 3 | 6 |
| request-logs | 3 | 1 |
| scheduling | 4 | 1 |
| security-and-operations | 3 | 2 |
| sending | 19 | 1 |
| suppression | 12 | 1 |
| templates | 16 | 3 |
| tls | 2 | 1 |
| tracking | 2 | 1 |
| webhooks | 25 | 1 |

## Implementation and validation ledger

- Test execution and its limits are recorded in [RESEND-PARITY-VALIDATION.md](RESEND-PARITY-VALIDATION.md).
- Implemented in the current transactional slice: guarded rescheduling; date/key/source/text filters; CID/remote attachments and retrieval; automatic text alternatives; SMTP idempotency; 48-hour revocable sharing; bounded and resumable background email CSV exports; DNS-gated DKIM rotation with seven-day overlap; isolated deterministic delivery simulations; webhook health with durable in-app alerts and signed test events; request metadata logs; daily usage/events; webhook replay/history with worker fencing; suppression batch/read/filter operations; key rename; per-domain enforced TLS. See [API details](../api/TRANSACTIONAL-PARITY.md) for boundaries and intentional differences.
- Existing delivery states and `/v1` clients are preserved. Different event names and stronger existing security defaults are intentional differences; equivalent capabilities do not require wire compatibility.
- The saved Resend Emails HTML provides evidence of date/status/API-key filters and export controls; embedded scripts and instructions are not requirements.
- Product foundations now include versioned templates, safe variables, template sending, contact management/imports and team settings. See [product foundation APIs](../api/PRODUCT-FOUNDATIONS.md) for limits.
- Overall parity remains open. Full phase details and completion gates are tracked in ROADMAP.md and FEATURE-MATRIX.md.

## Manually reviewed requirements

| Requirement | Expected behavior | Status | Dependency / intentional difference |
| --- | --- | --- | --- |
| [template-publication](https://resend.com/docs/dashboard/templates/version-history.md) | Keep editable drafts separate from published content used by new sends, and retain published history without changing queued messages. | verified match | Explicit revision checks and manual saves; publication revision numbers may have gaps |
| [template-variables](https://resend.com/docs/dashboard/templates/template-variables.md) | Render typed string/number variables with defaults, rejecting missing required values. | partial | Uses double-brace escaped text interpolation; no HTML attributes, raw expressions, visual editor or real-time collaboration |
| [contact-management](https://resend.com/docs/dashboard/contacts/manage-contacts.md) | Create and manage contacts, subscription status and custom property values with project isolation. | partial | Immutable email identity and reversible archive; no property-definition registry, segments, topics, preference pages or contact webhooks |
| [contact-import](https://resend.com/docs/api-reference/contacts/create-contact-import.md) | Import contact records and update existing contact information while respecting subscription status. | partial | Atomic JSON import up to 500 rows, not asynchronous CSV imports; duplicate rows rejected, archived contacts skipped and unsubscribe preserved |
| [deterministic-test-addresses](https://resend.com/docs/knowledge-base/what-email-addresses-to-use-for-testing.md) | Simulate delivery, bounce and suppression without sending to real mailboxes or changing sender reputation. | partial | Explicit test_mode and reserved .invalid addresses; adds deferral; complaint and plus-label scenarios remain missing |
| [schedule-update](https://resend.com/docs/api-reference/emails/update-email.md) | Allow an existing scheduled email to be moved to a future time, without rescheduling cancelled or dispatched recipients. | verified match |  |
| [schedule-horizon](https://resend.com/docs/dashboard/emails/schedule-email.md) | Accept a future ISO timestamp within 30 days; reject dates beyond that horizon. | verified match |  |
| [schedule-natural-language](https://resend.com/docs/dashboard/emails/schedule-email.md) | Accept human-readable relative or named sending times. | missing | Natural-language parsing and timezone policy |
| [schedule-key-revocation](https://resend.com/docs/dashboard/emails/schedule-email.md) | Fail scheduled API messages when the original sending key is no longer active at dispatch. | verified match |  |
| [attachments-cid](https://resend.com/docs/dashboard/emails/embed-inline-images.md) | Compose CID-referenced inline images while preserving regular attachment disposition. | verified match | Content IDs use a narrower safe character set |
| [attachments-remote](https://resend.com/docs/dashboard/emails/attachments.md) | Accept a remote URL as an attachment source and attach the downloaded bytes. | partial | Public HTTPS only; no redirects; size limits intentionally differ |
| [attachments-retrieval](https://resend.com/docs/api-reference/emails/retrieve-email-attachment.md) | Let authorized users retrieve a sent attachment and download it from the dashboard. | verified match | Returns authenticated base64 content instead of a signed download URL |
| [attachments-size](https://resend.com/docs/dashboard/emails/attachments.md) | Support the documented 40 MB total encoded-message attachment ceiling. | partial | Intentional limits: 10 MiB decoded per email, 24 MiB per request, existing HTTP body caps |
| [email-sharing](https://resend.com/docs/api-reference/emails/share-email.md) | Create temporary public views of email content with a 48-hour lifetime. | verified match | Recipient lists and attachment downloads are excluded; revocation is supported |
| [email-export](https://resend.com/docs/dashboard/emails/manage-emails.md) | Let team admins export filtered email metadata to CSV and retrieve larger exports asynchronously. | partial | Email exports up to 100,000 rows with seven-day authenticated downloads; other resources, email completion notification and member metadata access remain missing |
| [request-log-read](https://resend.com/docs/api-reference/logs/list-logs.md) | List and retrieve tenant API request records for troubleshooting. | partial | Authenticated route metadata only; no request/response bodies or unauthenticated attempts |
| [metrics-history](https://resend.com/docs/api-reference/emails/get-metrics.md) | Expose historical email usage and delivery metrics. | partial | Daily UTC event/acceptance counts only; richer breakdowns and engagement metrics remain missing |
| [webhook-replay](https://resend.com/docs/api-reference/webhooks/replay-event.md) | Allow manual replay of completed failed or successful webhook messages. | verified match | Same event ID/payload; historical attempts preserved; fresh retry cycle; existing API route names retained |
| [webhook-attempts](https://resend.com/docs/api-reference/webhooks/list-event-attempts.md) | Expose paginated delivery attempt history with response status and timing. | verified match |  |
| [webhook-backoff](https://resend.com/docs/webhooks/retries-and-replays.md) | Retry failures using the documented delivery backoff and automatically disable persistently failing endpoints with notification. | partial | Existing retry schedule retained; auto-disable after ten failures spanning 24 hours; durable in-app notifications instead of team email |
| [tls-enforcement](https://resend.com/docs/dashboard/domains/tls.md) | Offer opportunistic and enforced outbound TLS per sending domain; enforced delivery must not downgrade to plaintext. | verified match | TLS 1.2 minimum is intentionally retained |
| [api-key-rename](https://resend.com/docs/api-reference/api-keys/update-api-key.md) | Rename an existing API key without changing its secret or permissions. | verified match |  |
| [suppression-read](https://resend.com/docs/api-reference/suppressions/get-suppression.md) | Retrieve a suppression by its identifier or email address. | verified match |  |
| [suppression-batch](https://resend.com/docs/api-reference/suppressions/add-batch-suppressions.md) | Add up to 100 suppressions atomically with tenant isolation. | verified match |  |
| [idempotency-api](https://resend.com/docs/dashboard/emails/idempotency-keys.md) | Replay successful API send requests for 24 hours without duplicate sending; reject reuse with a different payload. | verified match | Existing error names/status conventions retained |
| [idempotency-smtp](https://resend.com/docs/dashboard/emails/idempotency-keys.md) | Support an SMTP header that deduplicates retries and rejects conflicting reuse. | verified match | Uses X-MP-Idempotency-Key and requires unchanged raw content and envelope |
| [automatic-text](https://resend.com/docs/api-reference/emails/send-batch-emails.md) | Generate a text alternative from HTML when text is omitted; an explicit empty string disables generation. | verified match |  |
| [batch-attachments](https://resend.com/docs/api-reference/emails/send-batch-emails.md) | Preserve existing batch attachments rather than copying Resend's documented attachment restriction. | partial | Intentional additional capability; complete batch-limit behavior still needs review |
| [domain-claims](https://resend.com/docs/dashboard/domains/claim.md) | Transfer a previously verified domain after fresh DNS proof and ownership-safety checks, with an inspectable claim lifecycle. | missing | Current code protects verified ownership but does not implement transfer claims |

## Every indexed page

| Page | Capability | Status | Phase |
| --- | --- | --- | ---: |
| [Introduction](https://resend.com/docs/introduction.md) | general | unverified | 0 |
| [Create an API key](https://resend.com/docs/create-an-api-key.md) | api-keys | partial | 1 |
| [Add and verify a domain](https://resend.com/docs/add-a-domain.md) | domains | partial | 1 |
| [Sending emails with Resend](https://resend.com/docs/email-types.md) | sending | partial | 1 |
| [AI onboarding](https://resend.com/docs/ai-onboarding.md) | ecosystem | missing | 6 |
| [Send emails with Node.js](https://resend.com/docs/send-with-nodejs.md) | ecosystem | missing | 6 |
| [Send emails with Next.js](https://resend.com/docs/send-with-nextjs.md) | ecosystem | missing | 6 |
| [Send emails with Remix](https://resend.com/docs/send-with-remix.md) | ecosystem | missing | 6 |
| [Send emails with Nuxt](https://resend.com/docs/send-with-nuxt.md) | ecosystem | missing | 6 |
| [Send emails with TanStack Start](https://resend.com/docs/send-with-tanstack-start.md) | ecosystem | missing | 6 |
| [Send emails with SvelteKit](https://resend.com/docs/send-with-sveltekit.md) | ecosystem | missing | 6 |
| [Send emails with Express](https://resend.com/docs/send-with-express.md) | ecosystem | missing | 6 |
| [Send emails with RedwoodJS](https://resend.com/docs/send-with-redwoodjs.md) | ecosystem | missing | 6 |
| [Send emails with Hono](https://resend.com/docs/send-with-hono.md) | ecosystem | missing | 6 |
| [Send emails with Bun](https://resend.com/docs/send-with-bun.md) | ecosystem | missing | 6 |
| [Send emails with Astro](https://resend.com/docs/send-with-astro.md) | ecosystem | missing | 6 |
| [Send emails with Railway](https://resend.com/docs/send-with-railway.md) | ecosystem | missing | 6 |
| [Send emails with Encore](https://resend.com/docs/send-with-encore-ts.md) | ecosystem | missing | 6 |
| [Send Better Auth emails with Resend](https://resend.com/docs/send-with-better-auth.md) | ecosystem | missing | 6 |
| [Send emails with Vercel Functions](https://resend.com/docs/send-with-vercel-functions.md) | ecosystem | missing | 6 |
| [Send emails with Supabase Edge Functions](https://resend.com/docs/send-with-supabase-edge-functions.md) | ecosystem | missing | 6 |
| [Send emails with Cloudflare Workers](https://resend.com/docs/send-with-cloudflare-workers.md) | ecosystem | missing | 6 |
| [Send emails with Deno Deploy](https://resend.com/docs/send-with-deno-deploy.md) | ecosystem | missing | 6 |
| [Send emails with AWS Lambda](https://resend.com/docs/send-with-aws-lambda.md) | ecosystem | missing | 6 |
| [Send emails with PHP](https://resend.com/docs/send-with-php.md) | ecosystem | missing | 6 |
| [Send emails with Laravel](https://resend.com/docs/send-with-laravel.md) | ecosystem | missing | 6 |
| [Send emails with Symfony](https://resend.com/docs/send-with-symfony.md) | ecosystem | missing | 6 |
| [Send emails with Ruby](https://resend.com/docs/send-with-ruby.md) | ecosystem | missing | 6 |
| [Send emails with Rails](https://resend.com/docs/send-with-rails.md) | ecosystem | missing | 6 |
| [Send emails with Sinatra](https://resend.com/docs/send-with-sinatra.md) | ecosystem | missing | 6 |
| [Send emails with Python](https://resend.com/docs/send-with-python.md) | ecosystem | missing | 6 |
| [Send emails with Flask](https://resend.com/docs/send-with-flask.md) | ecosystem | missing | 6 |
| [Send emails with FastAPI](https://resend.com/docs/send-with-fastapi.md) | ecosystem | missing | 6 |
| [Send emails with Django](https://resend.com/docs/send-with-django.md) | ecosystem | missing | 6 |
| [Send emails with Go](https://resend.com/docs/send-with-go.md) | ecosystem | missing | 6 |
| [Send emails with Encore](https://resend.com/docs/send-with-encore-go.md) | ecosystem | missing | 6 |
| [Send emails with Rust](https://resend.com/docs/send-with-rust.md) | ecosystem | missing | 6 |
| [Send emails with Axum](https://resend.com/docs/send-with-axum.md) | ecosystem | missing | 6 |
| [Send emails with Elixir](https://resend.com/docs/send-with-elixir.md) | ecosystem | missing | 6 |
| [Send emails with Phoenix](https://resend.com/docs/send-with-phoenix.md) | ecosystem | missing | 6 |
| [Send emails with Java](https://resend.com/docs/send-with-java.md) | ecosystem | missing | 6 |
| [Send emails with .NET](https://resend.com/docs/send-with-dotnet.md) | ecosystem | missing | 6 |
| [Send emails with SMTP](https://resend.com/docs/send-with-smtp.md) | ecosystem | missing | 6 |
| [Send Auth0 transactional emails with Resend](https://resend.com/docs/send-with-auth0.md) | ecosystem | missing | 6 |
| [Send emails using Customer.io with SMTP](https://resend.com/docs/send-with-customer-io-smtp.md) | ecosystem | missing | 6 |
| [Send emails using Django with SMTP](https://resend.com/docs/send-with-django-smtp.md) | ecosystem | missing | 6 |
| [Send emails using Laravel with SMTP](https://resend.com/docs/send-with-laravel-smtp.md) | ecosystem | missing | 6 |
| [Send emails using Liferay with SMTP](https://resend.com/docs/send-with-liferay-smtp.md) | ecosystem | missing | 6 |
| [Send emails using Nodemailer with SMTP](https://resend.com/docs/send-with-nodemailer-smtp.md) | ecosystem | missing | 6 |
| [Send emails using PHPMailer with SMTP](https://resend.com/docs/send-with-phpmailer-smtp.md) | ecosystem | missing | 6 |
| [Send emails using Rails with SMTP](https://resend.com/docs/send-with-rails-smtp.md) | ecosystem | missing | 6 |
| [Send emails using Retool with SMTP](https://resend.com/docs/send-with-retool-smtp.md) | ecosystem | missing | 6 |
| [Send emails using Supabase with SMTP](https://resend.com/docs/send-with-supabase-smtp.md) | ecosystem | missing | 6 |
| [Send emails using WordPress with SMTP](https://resend.com/docs/send-with-wordpress-smtp.md) | ecosystem | missing | 6 |
| [Send emails using NextAuth with SMTP](https://resend.com/docs/send-with-nextauth-smtp.md) | ecosystem | missing | 6 |
| [Send emails using Metabase with SMTP](https://resend.com/docs/send-with-metabase-smtp.md) | ecosystem | missing | 6 |
| [Send emails with Resend CLI](https://resend.com/docs/cli-quickstart.md) | ecosystem | missing | 6 |
| [Verified Domains](https://resend.com/docs/dashboard/domains/introduction.md) | domains | partial | 1 |
| [Managing Domains](https://resend.com/docs/dashboard/domains/manage-domains.md) | domains | partial | 1 |
| [Implementing DMARC](https://resend.com/docs/dashboard/domains/dmarc.md) | domains | partial | 1 |
| [Implementing BIMI](https://resend.com/docs/dashboard/domains/bimi.md) | domains | partial | 1 |
| [Open and Click Tracking](https://resend.com/docs/dashboard/domains/tracking.md) | tracking | missing | 1 |
| [Configure Transport Layer Security (TLS)](https://resend.com/docs/dashboard/domains/tls.md) | tls | partial | 1 |
| [Configure a custom Return Path](https://resend.com/docs/dashboard/domains/custom-return-path.md) | domains | partial | 1 |
| [Choosing a Region](https://resend.com/docs/dashboard/domains/regions.md) | regional-delivery | missing | 6 |
| [Claiming a domain](https://resend.com/docs/dashboard/domains/claim.md) | domain-claims | partial | 1 |
| [Sending Emails](https://resend.com/docs/dashboard/emails/introduction.md) | sending | partial | 1 |
| [View and manage emails](https://resend.com/docs/dashboard/emails/manage-emails.md) | email-management | partial | 1 |
| [Batch Sending](https://resend.com/docs/dashboard/emails/batch-sending.md) | sending | partial | 1 |
| [Attachments](https://resend.com/docs/dashboard/emails/attachments.md) | attachments | partial | 1 |
| [Embed Inline Images](https://resend.com/docs/dashboard/emails/embed-inline-images.md) | attachments | partial | 1 |
| [Schedule Email](https://resend.com/docs/dashboard/emails/schedule-email.md) | scheduling | partial | 1 |
| [Send Test Emails](https://resend.com/docs/dashboard/emails/send-test-emails.md) | sending | partial | 1 |
| [Custom Headers](https://resend.com/docs/dashboard/emails/custom-headers.md) | sending | partial | 1 |
| [Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys.md) | sending | partial | 1 |
| [Email Bounces](https://resend.com/docs/dashboard/emails/email-bounces.md) | sending | partial | 1 |
| [Email Suppressions](https://resend.com/docs/dashboard/emails/email-suppressions.md) | suppression | partial | 1 |
| [Deliverability Insights](https://resend.com/docs/dashboard/emails/deliverability-insights.md) | metrics | partial | 1 |
| [Add an unsubscribe link to transactional emails](https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails.md) | marketing | missing | 3 |
| [Managing Tags](https://resend.com/docs/dashboard/emails/tags.md) | sending | partial | 1 |
| [Receiving Emails](https://resend.com/docs/dashboard/receiving/introduction.md) | receiving | missing | 5 |
| [Managing Emails](https://resend.com/docs/dashboard/receiving/manage-emails.md) | receiving | missing | 5 |
| [Custom Receiving Domains](https://resend.com/docs/dashboard/receiving/custom-domains.md) | receiving | missing | 5 |
| [Create a receiving Webhook](https://resend.com/docs/dashboard/receiving/create-receiving-webhook.md) | receiving | missing | 5 |
| [Process Receiving Attachments](https://resend.com/docs/dashboard/receiving/attachments.md) | receiving | missing | 5 |
| [Get Email Content](https://resend.com/docs/dashboard/receiving/get-email-content.md) | receiving | missing | 5 |
| [Forward Received Emails](https://resend.com/docs/dashboard/receiving/forward-emails.md) | receiving | missing | 5 |
| [Reply to Receiving Emails](https://resend.com/docs/dashboard/receiving/reply-to-emails.md) | receiving | missing | 5 |
| [Sending Broadcasts](https://resend.com/docs/dashboard/broadcasts/introduction.md) | marketing | missing | 3 |
| [Manage Broadcasts](https://resend.com/docs/dashboard/broadcasts/manage-broadcasts.md) | marketing | missing | 3 |
| [Compose and send with the Broadcast editor](https://resend.com/docs/dashboard/broadcasts/editor.md) | marketing | missing | 3 |
| [Compose and send Broadcasts with the API](https://resend.com/docs/dashboard/broadcasts/send-broadcast-with-api.md) | marketing | missing | 3 |
| [Performance Tracking](https://resend.com/docs/dashboard/broadcasts/performance-tracking.md) | marketing | missing | 3 |
| [Contacts](https://resend.com/docs/dashboard/contacts/introduction.md) | contact-management | partial | 3 |
| [Add Contacts](https://resend.com/docs/dashboard/contacts/add-contacts.md) | contact-management | partial | 3 |
| [Managing Contacts](https://resend.com/docs/dashboard/contacts/manage-contacts.md) | contact-management | partial | 3 |
| [Contact properties](https://resend.com/docs/dashboard/contacts/properties.md) | contact-management | partial | 3 |
| [Managing Segments](https://resend.com/docs/dashboard/contacts/manage-segments.md) | marketing | missing | 3 |
| [Topics](https://resend.com/docs/dashboard/contacts/manage-topics.md) | marketing | missing | 3 |
| [Managing unsubscribed Contacts](https://resend.com/docs/dashboard/contacts/managing-unsubscribe-list.md) | marketing | missing | 3 |
| [Migrating from Audiences to Segments](https://resend.com/docs/dashboard/contacts/migrating-from-audiences-to-segments.md) | marketing | missing | 3 |
| [Automations](https://resend.com/docs/dashboard/automations/introduction.md) | automations | missing | 4 |
| [Create Automations](https://resend.com/docs/dashboard/automations/create-automation.md) | automations | missing | 4 |
| [Custom Events](https://resend.com/docs/dashboard/automations/custom-events.md) | automations | missing | 4 |
| [Connections](https://resend.com/docs/dashboard/automations/connections.md) | automations | missing | 4 |
| [Runs](https://resend.com/docs/dashboard/automations/runs.md) | automations | missing | 4 |
| [Steps](https://resend.com/docs/dashboard/automations/steps.md) | automations | missing | 4 |
| [Trigger](https://resend.com/docs/dashboard/automations/trigger.md) | automations | missing | 4 |
| [Condition](https://resend.com/docs/dashboard/automations/condition.md) | automations | missing | 4 |
| [Delay](https://resend.com/docs/dashboard/automations/delay.md) | automations | missing | 4 |
| [Wait for Event](https://resend.com/docs/dashboard/automations/wait-for-event.md) | automations | missing | 4 |
| [Send Email](https://resend.com/docs/dashboard/automations/send-email.md) | automations | missing | 4 |
| [Add to Segment](https://resend.com/docs/dashboard/automations/add-to-segment.md) | automations | missing | 4 |
| [Contact Update](https://resend.com/docs/dashboard/automations/contact-update.md) | automations | missing | 4 |
| [Contact Delete](https://resend.com/docs/dashboard/automations/contact-delete.md) | automations | missing | 4 |
| [Using Templates](https://resend.com/docs/dashboard/templates/introduction.md) | templates | partial | 3 |
| [Create a Template](https://resend.com/docs/dashboard/templates/create-template.md) | templates | partial | 3 |
| [Compose with the Template editor](https://resend.com/docs/dashboard/templates/template-editor.md) | templates | partial | 3 |
| [Working with Variables](https://resend.com/docs/dashboard/templates/template-variables.md) | templates | partial | 3 |
| [Version History](https://resend.com/docs/dashboard/templates/version-history.md) | templates | partial | 3 |
| [Introduction](https://resend.com/docs/dashboard/logs/introduction.md) | request-logs | missing | 1 |
| [Webhooks](https://resend.com/docs/webhooks/introduction.md) | webhooks | partial | 1 |
| [Create a Webhook](https://resend.com/docs/webhooks/create-webhook.md) | webhooks | partial | 1 |
| [Verify Webhooks Requests](https://resend.com/docs/webhooks/verify-webhooks-requests.md) | webhooks | partial | 1 |
| [Retries and Replays](https://resend.com/docs/webhooks/retries-and-replays.md) | webhooks | partial | 1 |
| [Webhook Ingester](https://resend.com/docs/webhooks/ingester.md) | webhooks | partial | 1 |
| [How to Store Webhooks Data](https://resend.com/docs/webhooks/how-to-store-webhooks-data.md) | webhooks | partial | 1 |
| [Event Types](https://resend.com/docs/webhooks/event-types.md) | webhooks | partial | 1 |
| [email.bounced](https://resend.com/docs/webhooks/emails/bounced.md) | webhooks | partial | 1 |
| [email.clicked](https://resend.com/docs/webhooks/emails/clicked.md) | ecosystem | missing | 6 |
| [email.complained](https://resend.com/docs/webhooks/emails/complained.md) | suppression | partial | 1 |
| [email.delivered](https://resend.com/docs/webhooks/emails/delivered.md) | webhooks | partial | 1 |
| [email.delivery_delayed](https://resend.com/docs/webhooks/emails/delivery-delayed.md) | webhooks | partial | 1 |
| [email.failed](https://resend.com/docs/webhooks/emails/failed.md) | webhooks | partial | 1 |
| [email.opened](https://resend.com/docs/webhooks/emails/opened.md) | tracking | missing | 1 |
| [email.received](https://resend.com/docs/webhooks/emails/received.md) | receiving | missing | 5 |
| [email.scheduled](https://resend.com/docs/webhooks/emails/scheduled.md) | scheduling | partial | 1 |
| [email.sent](https://resend.com/docs/webhooks/emails/sent.md) | webhooks | partial | 1 |
| [email.suppressed](https://resend.com/docs/webhooks/emails/suppressed.md) | suppression | partial | 1 |
| [domain.created](https://resend.com/docs/webhooks/domains/created.md) | webhooks | partial | 1 |
| [domain.updated](https://resend.com/docs/webhooks/domains/updated.md) | webhooks | partial | 1 |
| [domain.deleted](https://resend.com/docs/webhooks/domains/deleted.md) | webhooks | partial | 1 |
| [contact.created](https://resend.com/docs/webhooks/contacts/created.md) | marketing | missing | 3 |
| [contact.updated](https://resend.com/docs/webhooks/contacts/updated.md) | marketing | missing | 3 |
| [contact.deleted](https://resend.com/docs/webhooks/contacts/deleted.md) | marketing | missing | 3 |
| [contact.topics.updated](https://resend.com/docs/webhooks/contacts/topics-updated.md) | marketing | missing | 3 |
| [suppression.added](https://resend.com/docs/webhooks/suppressions/added.md) | suppression | partial | 1 |
| [suppression.removed](https://resend.com/docs/webhooks/suppressions/removed.md) | suppression | partial | 1 |
| [topic.created](https://resend.com/docs/webhooks/topics/created.md) | marketing | missing | 3 |
| [topic.updated](https://resend.com/docs/webhooks/topics/updated.md) | marketing | missing | 3 |
| [topic.deleted](https://resend.com/docs/webhooks/topics/deleted.md) | marketing | missing | 3 |
| [inbox.created](https://resend.com/docs/webhooks/inboxes/created.md) | inboxes | missing | 5 |
| [inbox.updated](https://resend.com/docs/webhooks/inboxes/updated.md) | inboxes | missing | 5 |
| [inbox.deleted](https://resend.com/docs/webhooks/inboxes/deleted.md) | inboxes | missing | 5 |
| [inbox.thread.created](https://resend.com/docs/webhooks/inboxes/thread-created.md) | inboxes | missing | 5 |
| [inbox.thread.folder.updated](https://resend.com/docs/webhooks/inboxes/thread-folder-updated.md) | inboxes | missing | 5 |
| [inbox.thread.assigned](https://resend.com/docs/webhooks/inboxes/thread-assigned.md) | inboxes | missing | 5 |
| [inbox.thread.unassigned](https://resend.com/docs/webhooks/inboxes/thread-unassigned.md) | inboxes | missing | 5 |
| [inbox.thread.labels.updated](https://resend.com/docs/webhooks/inboxes/thread-labels-updated.md) | inboxes | missing | 5 |
| [inbox.email.received](https://resend.com/docs/webhooks/inboxes/email-received.md) | inboxes | missing | 5 |
| [inbox.email.sent](https://resend.com/docs/webhooks/inboxes/email-sent.md) | inboxes | missing | 5 |
| [inbox.draft.created](https://resend.com/docs/webhooks/inboxes/draft-created.md) | inboxes | missing | 5 |
| [inbox.draft.updated](https://resend.com/docs/webhooks/inboxes/draft-updated.md) | inboxes | missing | 5 |
| [inbox.draft.sent](https://resend.com/docs/webhooks/inboxes/draft-sent.md) | inboxes | missing | 5 |
| [inbox.draft.deleted](https://resend.com/docs/webhooks/inboxes/draft-deleted.md) | inboxes | missing | 5 |
| [Inboxes](https://resend.com/docs/dashboard/inboxes/introduction.md) | inboxes | missing | 5 |
| [Creating Inboxes](https://resend.com/docs/dashboard/inboxes/create-inboxes.md) | inboxes | missing | 5 |
| [Managing Inboxes](https://resend.com/docs/dashboard/inboxes/manage-inboxes.md) | inboxes | missing | 5 |
| [Managing Threads](https://resend.com/docs/dashboard/inboxes/threads.md) | inboxes | missing | 5 |
| [Inbox Drafts](https://resend.com/docs/dashboard/inboxes/drafts.md) | inboxes | missing | 5 |
| [Manage Labels](https://resend.com/docs/dashboard/inboxes/labels.md) | inboxes | missing | 5 |
| [Inbox Agent](https://resend.com/docs/dashboard/inboxes/agent.md) | inboxes | missing | 5 |
| [Resend Forge](https://resend.com/docs/forge.md) | ecosystem | missing | 6 |
| [Official SDKs](https://resend.com/docs/sdks.md) | ecosystem | missing | 6 |
| [Resend CLI](https://resend.com/docs/cli.md) | ecosystem | missing | 6 |
| [MCP Server](https://resend.com/docs/mcp-server.md) | ecosystem | missing | 6 |
| [Integrations](https://resend.com/docs/integrations.md) | ecosystem | missing | 6 |
| [Examples](https://resend.com/docs/examples.md) | ecosystem | missing | 6 |
| [Introduction](https://resend.com/docs/knowledge-base/introduction.md) | general | unverified | 0 |
| [Manage API keys](https://resend.com/docs/dashboard/api-keys/introduction.md) | api-keys | partial | 1 |
| [How to handle API keys](https://resend.com/docs/knowledge-base/how-to-handle-api-keys.md) | api-keys | partial | 1 |
| [How to handle a leaked API key](https://resend.com/docs/knowledge-base/how-to-handle-a-leaked-api-key.md) | api-keys | partial | 1 |
| [How to avoid conflicts with your MX records](https://resend.com/docs/knowledge-base/how-do-i-avoid-conflicting-with-my-mx-records.md) | domains | partial | 1 |
| [What if my domain is not verifying?](https://resend.com/docs/knowledge-base/what-if-my-domain-is-not-verifying.md) | domains | partial | 1 |
| [403 Error with Error Code 1010](https://resend.com/docs/knowledge-base/403-error-1010.md) | general | unverified | 0 |
| [403 Error Using Verified Domain](https://resend.com/docs/knowledge-base/403-error-domain-mismatch.md) | domains | partial | 1 |
| [403 Error Using resend.dev Domain](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain.md) | domains | partial | 1 |
| [Domain Already Registered by Another Account](https://resend.com/docs/knowledge-base/domain-already-registered.md) | domain-claims | partial | 1 |
| [DMARC Analyzer](https://resend.com/docs/dmarc-analyzer.md) | domains | partial | 1 |
| [Cloudflare](https://resend.com/docs/guides/dns/cloudflare.md) | domains | partial | 1 |
| [DreamHost](https://resend.com/docs/guides/dns/dreamhost.md) | domains | partial | 1 |
| [Gandi](https://resend.com/docs/guides/dns/gandi.md) | domains | partial | 1 |
| [GoDaddy](https://resend.com/docs/guides/dns/godaddy.md) | domains | partial | 1 |
| [Hetzner](https://resend.com/docs/guides/dns/hetzner.md) | domains | partial | 1 |
| [Hostinger](https://resend.com/docs/guides/dns/hostinger.md) | domains | partial | 1 |
| [IONOS](https://resend.com/docs/guides/dns/ionos.md) | domains | partial | 1 |
| [Namecheap](https://resend.com/docs/guides/dns/namecheap.md) | domains | partial | 1 |
| [Porkbun](https://resend.com/docs/guides/dns/porkbun.md) | domains | partial | 1 |
| [AWS Route 53](https://resend.com/docs/guides/dns/route53.md) | domains | partial | 1 |
| [Squarespace](https://resend.com/docs/guides/dns/squarespace.md) | domains | partial | 1 |
| [Strato](https://resend.com/docs/guides/dns/strato.md) | domains | partial | 1 |
| [Vercel](https://resend.com/docs/guides/dns/vercel.md) | domains | partial | 1 |
| [Which sending feature do you need?](https://resend.com/docs/knowledge-base/what-sending-feature-to-use.md) | sending | partial | 1 |
| [Why and when to use Topics?](https://resend.com/docs/knowledge-base/why-use-topics.md) | marketing | missing | 3 |
| [Do you need to add an unsubscribe link to all of your emails sent with Resend?](https://resend.com/docs/knowledge-base/should-i-add-an-unsubscribe-link.md) | marketing | missing | 3 |
| [How do Dedicated IPs work?](https://resend.com/docs/knowledge-base/how-do-dedicated-ips-work.md) | regional-delivery | missing | 6 |
| [Sender email addresses in Resend](https://resend.com/docs/knowledge-base/how-do-I-create-an-email-address-or-sender-in-resend.md) | sending | partial | 1 |
| [What attachment types are not supported?](https://resend.com/docs/knowledge-base/what-attachment-types-are-not-supported.md) | attachments | partial | 1 |
| [How to fix CORS issues](https://resend.com/docs/knowledge-base/how-do-i-fix-cors-issues.md) | general | unverified | 0 |
| [How to cancel a Broadcast](https://resend.com/docs/knowledge-base/how-do-i-cancel-a-broadcast.md) | marketing | missing | 3 |
| [Why are my emails landing on the Suppression List?](https://resend.com/docs/knowledge-base/why-are-my-emails-landing-on-the-suppression-list.md) | suppression | partial | 1 |
| [Can You Receive Emails with Resend?](https://resend.com/docs/knowledge-base/how-can-i-receive-emails-with-resend.md) | receiving | missing | 5 |
| [Is it better to send emails from a subdomain or the root domain?](https://resend.com/docs/knowledge-base/is-it-better-to-send-emails-from-a-subdomain-or-the-root-domain.md) | domains | partial | 1 |
| [What if an email says delivered but the recipient has not received it?](https://resend.com/docs/knowledge-base/what-if-an-email-says-delivered-but-the-recipient-has-not-received-it.md) | receiving | missing | 5 |
| [Why Are My Emails Going to Spam?](https://resend.com/docs/knowledge-base/why-are-my-emails-going-to-spam.md) | sending | partial | 1 |
| [How to prevent bounces with @privaterelay.appleid.com recipients?](https://resend.com/docs/knowledge-base/sending-apple-private-relay.md) | sending | partial | 1 |
| [Audience Hygiene: How to keep your Audiences in good shape?](https://resend.com/docs/knowledge-base/audience-hygiene.md) | marketing | missing | 3 |
| [Domain and/or IP Warm-up Guide](https://resend.com/docs/knowledge-base/warming-up.md) | regional-delivery | missing | 6 |
| [What counts as email consent?](https://resend.com/docs/knowledge-base/what-counts-as-email-consent.md) | marketing | missing | 3 |
| [Do You Need 2048-bit DKIM?](https://resend.com/docs/knowledge-base/do-i-need-2048-dkim.md) | domains | partial | 1 |
| [How to set up E2E testing with Playwright](https://resend.com/docs/knowledge-base/end-to-end-testing-with-playwright.md) | general | unverified | 0 |
| [What email addresses to use for testing?](https://resend.com/docs/knowledge-base/what-email-addresses-to-use-for-testing.md) | sending | partial | 1 |
| [Get Started with Resend and Supabase](https://resend.com/docs/knowledge-base/getting-started-with-resend-and-supabase.md) | general | unverified | 0 |
| [How to maximize deliverability for Supabase Auth emails](https://resend.com/docs/knowledge-base/how-do-i-maximize-deliverability-for-supabase-auth-emails.md) | sending | partial | 1 |
| [How to set up Apple Branded Mail](https://resend.com/docs/knowledge-base/how-do-i-set-up-apple-branded-mail.md) | general | unverified | 0 |
| [How to send with an avatar](https://resend.com/docs/knowledge-base/how-do-i-send-with-an-avatar.md) | ecosystem | missing | 6 |
| [Forward emails with Resend Inbound](https://resend.com/docs/knowledge-base/forward-emails-with-resend-inbound.md) | receiving | missing | 5 |
| [Template emails with React Email](https://resend.com/docs/knowledge-base/template-emails-with-react-email.md) | templates | partial | 3 |
| [Embed the React Email editor in your app](https://resend.com/docs/knowledge-base/embed-react-email-editor.md) | templates | partial | 3 |
| [Building an OAuth client for Resend](https://resend.com/docs/guides/building-a-resend-oauth-client.md) | oauth | missing | 6 |
| [Vercel Marketplace Integration](https://resend.com/docs/guides/vercel-marketplace-integration.md) | provider-dependencies | external dependency | 6 |
| [Stripe Projects Integration](https://resend.com/docs/guides/stripe-projects-integration.md) | provider-dependencies | external dependency | 6 |
| [Laravel Cloud Integration](https://resend.com/docs/guides/laravel-cloud-integration.md) | provider-dependencies | external dependency | 6 |
| [Send emails with n8n and Resend](https://resend.com/docs/knowledge-base/n8n-integration.md) | ecosystem | missing | 6 |
| [Send emails with Attio and Resend](https://resend.com/docs/guides/attio-integration.md) | provider-dependencies | external dependency | 6 |
| [Send emails with Devin and Resend](https://resend.com/docs/guides/devin.md) | ecosystem | missing | 6 |
| [Turn Paper designs into Resend emails](https://resend.com/docs/guides/paper.md) | templates | partial | 3 |
| [Resend CLI for AI Agents](https://resend.com/docs/cli-agents.md) | ecosystem | missing | 6 |
| [OpenClaw Guide](https://resend.com/docs/openclaw-guide.md) | inboxes | missing | 5 |
| [React Email Skill](https://resend.com/docs/react-email-skill.md) | templates | partial | 3 |
| [Resend Skill](https://resend.com/docs/resend-skill.md) | ecosystem | missing | 6 |
| [Agent Email Inbox Skill](https://resend.com/docs/agent-email-inbox-skill.md) | inboxes | missing | 5 |
| [Email Best Practices Skill](https://resend.com/docs/email-best-practices-skill.md) | ecosystem | missing | 6 |
| [Chat SDK](https://resend.com/docs/chat-sdk.md) | inboxes | missing | 5 |
| [Chat SDK Card Emails](https://resend.com/docs/chat-sdk-card-emails.md) | inboxes | missing | 5 |
| [Chat SDK Attachments](https://resend.com/docs/chat-sdk-attachments.md) | inboxes | missing | 5 |
| [Chat SDK Proactive Outreach](https://resend.com/docs/chat-sdk-proactive-outreach.md) | inboxes | missing | 5 |
| [Eve](https://resend.com/docs/knowledge-base/eve.md) | inboxes | missing | 5 |
| [How to add the Resend integration to your Anything project](https://resend.com/docs/anything-integration.md) | ecosystem | missing | 6 |
| [Send emails with Lovable and Resend](https://resend.com/docs/lovable-integration.md) | ecosystem | missing | 6 |
| [Send emails with v0 and Resend](https://resend.com/docs/v0-integration.md) | ecosystem | missing | 6 |
| [Send emails with Bolt.new and Resend](https://resend.com/docs/bolt-new-integration.md) | ecosystem | missing | 6 |
| [Send emails with Replit and Resend](https://resend.com/docs/replit-integration.md) | ecosystem | missing | 6 |
| [Send emails with Base44 and Resend](https://resend.com/docs/base44-integration.md) | ecosystem | missing | 6 |
| [Send emails with Leap and Resend](https://resend.com/docs/leap-new-integration.md) | ecosystem | missing | 6 |
| [Send emails with Appwrite and Resend](https://resend.com/docs/appwrite-integration.md) | ecosystem | missing | 6 |
| [How to change your Resend email address](https://resend.com/docs/knowledge-base/how-can-i-change-my-email-address.md) | identity | partial | 2 |
| [How to add multi-factor authentication to your Resend account](https://resend.com/docs/knowledge-base/how-can-i-add-mfa.md) | identity | partial | 2 |
| [Locked out by MFA](https://resend.com/docs/guides/account/locked-out-by-mfa.md) | identity | partial | 2 |
| [Does Resend require production approval?](https://resend.com/docs/knowledge-base/does-resend-require-production-approval.md) | security-and-operations | unverified | 2 |
| [What's the difference between Opportunistic TLS vs Enforced TLS?](https://resend.com/docs/knowledge-base/whats-the-difference-between-opportunistic-tls-vs-enforced-tls.md) | tls | partial | 1 |
| [Managing Billing](https://resend.com/docs/dashboard/settings/billing.md) | billing | missing | 6 |
| [What is Resend Pricing](https://resend.com/docs/knowledge-base/what-is-resend-pricing.md) | billing | missing | 6 |
| [How to add more domains](https://resend.com/docs/knowledge-base/how-to-add-more-domains.md) | billing | missing | 6 |
| [What are Resend account quotas and limits?](https://resend.com/docs/knowledge-base/account-quotas-and-limits.md) | identity | partial | 2 |
| [Custom Unsubscribe Page](https://resend.com/docs/dashboard/settings/unsubscribe-page.md) | marketing | missing | 3 |
| [Managing Teams](https://resend.com/docs/dashboard/settings/team.md) | identity | partial | 2 |
| [Can I merge accounts or teams?](https://resend.com/docs/guides/account/can-i-merge-accounts-or-teams.md) | identity | partial | 2 |
| [How to recover access to a team you can no longer sign in to](https://resend.com/docs/guides/account/how-to-recover-access-to-a-team.md) | identity | partial | 2 |
| [Single Sign-On](https://resend.com/docs/dashboard/settings/sso.md) | identity | partial | 2 |
| [Setting up Resend for Multi-Tenant Applications](https://resend.com/docs/knowledge-base/setting-up-resend-for-multi-tenants.md) | general | unverified | 0 |
| [Where to find Resend documents like DPA or W-9](https://resend.com/docs/knowledge-base/downloading-documents.md) | provider-dependencies | external dependency | 6 |
| [How to ensure sensitive data isn't stored on Resend](https://resend.com/docs/knowledge-base/how-do-i-ensure-sensitive-data-isnt-stored-on-resend.md) | security-and-operations | unverified | 2 |
| [Security](https://resend.com/docs/security.md) | security-and-operations | unverified | 2 |
| [How to delete your Resend account](https://resend.com/docs/knowledge-base/how-can-i-delete-my-resend-account.md) | identity | partial | 2 |
| [Introduction](https://resend.com/docs/api-reference/introduction.md) | general | unverified | 0 |
| [Pagination](https://resend.com/docs/api-reference/pagination.md) | sending | partial | 1 |
| [Usage Limits](https://resend.com/docs/api-reference/rate-limit.md) | sending | partial | 1 |
| [Errors](https://resend.com/docs/api-reference/errors.md) | sending | partial | 1 |
| [Send Email](https://resend.com/docs/api-reference/emails/send-email.md) | sending | partial | 1 |
| [Send Batch Emails](https://resend.com/docs/api-reference/emails/send-batch-emails.md) | sending | partial | 1 |
| [Retrieve Sent Email](https://resend.com/docs/api-reference/emails/retrieve-email.md) | email-management | partial | 1 |
| [List Sent Emails](https://resend.com/docs/api-reference/emails/list-emails.md) | email-management | partial | 1 |
| [Update Email](https://resend.com/docs/api-reference/emails/update-email.md) | scheduling | partial | 1 |
| [Cancel Email](https://resend.com/docs/api-reference/emails/cancel-email.md) | scheduling | partial | 1 |
| [Share Email](https://resend.com/docs/api-reference/emails/share-email.md) | email-management | partial | 1 |
| [Retrieve Attachment](https://resend.com/docs/api-reference/emails/retrieve-email-attachment.md) | attachments | partial | 1 |
| [List Attachments](https://resend.com/docs/api-reference/emails/list-email-attachments.md) | attachments | partial | 1 |
| [Retrieve Metrics](https://resend.com/docs/api-reference/emails/get-metrics.md) | metrics | partial | 1 |
| [Retrieve Received Email](https://resend.com/docs/api-reference/emails/retrieve-received-email.md) | receiving | missing | 5 |
| [List Received Emails](https://resend.com/docs/api-reference/emails/list-received-emails.md) | receiving | missing | 5 |
| [Retrieve Attachment](https://resend.com/docs/api-reference/emails/retrieve-received-email-attachment.md) | receiving | missing | 5 |
| [List Attachments](https://resend.com/docs/api-reference/emails/list-received-email-attachments.md) | receiving | missing | 5 |
| [Create Inbox](https://resend.com/docs/api-reference/inboxes/create-inbox.md) | inboxes | missing | 5 |
| [Retrieve Inbox](https://resend.com/docs/api-reference/inboxes/get-inbox.md) | inboxes | missing | 5 |
| [List Inboxes](https://resend.com/docs/api-reference/inboxes/list-inboxes.md) | inboxes | missing | 5 |
| [Update Inbox](https://resend.com/docs/api-reference/inboxes/update-inbox.md) | inboxes | missing | 5 |
| [Delete Inbox](https://resend.com/docs/api-reference/inboxes/delete-inbox.md) | inboxes | missing | 5 |
| [Create Label](https://resend.com/docs/api-reference/inboxes/create-label.md) | inboxes | missing | 5 |
| [List Labels](https://resend.com/docs/api-reference/inboxes/list-labels.md) | inboxes | missing | 5 |
| [Update Label](https://resend.com/docs/api-reference/inboxes/update-label.md) | inboxes | missing | 5 |
| [Delete Label](https://resend.com/docs/api-reference/inboxes/delete-label.md) | inboxes | missing | 5 |
| [List Threads](https://resend.com/docs/api-reference/inboxes/list-threads.md) | inboxes | missing | 5 |
| [Search Threads](https://resend.com/docs/api-reference/inboxes/search-threads.md) | inboxes | missing | 5 |
| [Retrieve Thread](https://resend.com/docs/api-reference/inboxes/get-thread.md) | inboxes | missing | 5 |
| [Update Thread](https://resend.com/docs/api-reference/inboxes/update-thread.md) | inboxes | missing | 5 |
| [Delete Thread](https://resend.com/docs/api-reference/inboxes/delete-thread.md) | inboxes | missing | 5 |
| [Add Thread Labels](https://resend.com/docs/api-reference/inboxes/add-thread-labels.md) | inboxes | missing | 5 |
| [Set Thread Labels](https://resend.com/docs/api-reference/inboxes/set-thread-labels.md) | inboxes | missing | 5 |
| [Remove Thread Label](https://resend.com/docs/api-reference/inboxes/remove-thread-label.md) | inboxes | missing | 5 |
| [List Thread Emails](https://resend.com/docs/api-reference/inboxes/list-thread-emails.md) | inboxes | missing | 5 |
| [Retrieve Thread Email](https://resend.com/docs/api-reference/inboxes/get-thread-email.md) | inboxes | missing | 5 |
| [Reply to Thread Email](https://resend.com/docs/api-reference/inboxes/reply-thread-email.md) | inboxes | missing | 5 |
| [Forward Thread Email](https://resend.com/docs/api-reference/inboxes/forward-thread-email.md) | inboxes | missing | 5 |
| [Create Draft](https://resend.com/docs/api-reference/inboxes/create-draft.md) | inboxes | missing | 5 |
| [List Drafts](https://resend.com/docs/api-reference/inboxes/list-drafts.md) | inboxes | missing | 5 |
| [Retrieve Draft](https://resend.com/docs/api-reference/inboxes/get-draft.md) | inboxes | missing | 5 |
| [Update Draft](https://resend.com/docs/api-reference/inboxes/update-draft.md) | inboxes | missing | 5 |
| [Delete Draft](https://resend.com/docs/api-reference/inboxes/delete-draft.md) | inboxes | missing | 5 |
| [Send Draft](https://resend.com/docs/api-reference/inboxes/send-draft.md) | inboxes | missing | 5 |
| [Retrieve Agent Settings](https://resend.com/docs/api-reference/inboxes/get-agent.md) | inboxes | missing | 5 |
| [Update Agent Settings](https://resend.com/docs/api-reference/inboxes/update-agent.md) | inboxes | missing | 5 |
| [Create Broadcast](https://resend.com/docs/api-reference/broadcasts/create-broadcast.md) | marketing | missing | 3 |
| [Send Broadcast](https://resend.com/docs/api-reference/broadcasts/send-broadcast.md) | marketing | missing | 3 |
| [Cancel Broadcast](https://resend.com/docs/api-reference/broadcasts/cancel-broadcast.md) | marketing | missing | 3 |
| [Duplicate Broadcast](https://resend.com/docs/api-reference/broadcasts/duplicate-broadcast.md) | marketing | missing | 3 |
| [Retrieve Broadcast](https://resend.com/docs/api-reference/broadcasts/get-broadcast.md) | marketing | missing | 3 |
| [List Broadcasts](https://resend.com/docs/api-reference/broadcasts/list-broadcasts.md) | marketing | missing | 3 |
| [Update Broadcast](https://resend.com/docs/api-reference/broadcasts/update-broadcast.md) | marketing | missing | 3 |
| [Delete Broadcast](https://resend.com/docs/api-reference/broadcasts/delete-broadcast.md) | marketing | missing | 3 |
| [List Recipients](https://resend.com/docs/api-reference/broadcasts/list-broadcast-recipients.md) | marketing | missing | 3 |
| [List Clicked Links](https://resend.com/docs/api-reference/broadcasts/list-broadcast-clicked-links.md) | marketing | missing | 3 |
| [Create Automation](https://resend.com/docs/api-reference/automations/create-automation.md) | automations | missing | 4 |
| [Update Automation](https://resend.com/docs/api-reference/automations/update-automation.md) | automations | missing | 4 |
| [Retrieve Automation](https://resend.com/docs/api-reference/automations/get-automation.md) | automations | missing | 4 |
| [List Automations](https://resend.com/docs/api-reference/automations/list-automations.md) | automations | missing | 4 |
| [Duplicate Automation](https://resend.com/docs/api-reference/automations/duplicate-automation.md) | automations | missing | 4 |
| [Stop Automation](https://resend.com/docs/api-reference/automations/stop-automation.md) | automations | missing | 4 |
| [Delete Automation](https://resend.com/docs/api-reference/automations/delete-automation.md) | automations | missing | 4 |
| [List Automation Runs](https://resend.com/docs/api-reference/automations/list-automation-runs.md) | automations | missing | 4 |
| [Retrieve Automation Run](https://resend.com/docs/api-reference/automations/get-automation-run.md) | automations | missing | 4 |
| [Create Event](https://resend.com/docs/api-reference/events/create-event.md) | automations | missing | 4 |
| [Send Event](https://resend.com/docs/api-reference/events/send-event.md) | automations | missing | 4 |
| [Retrieve Event](https://resend.com/docs/api-reference/events/get-event.md) | automations | missing | 4 |
| [List Events](https://resend.com/docs/api-reference/events/list-events.md) | automations | missing | 4 |
| [Update Event](https://resend.com/docs/api-reference/events/update-event.md) | automations | missing | 4 |
| [Delete Event](https://resend.com/docs/api-reference/events/delete-event.md) | automations | missing | 4 |
| [Create Template](https://resend.com/docs/api-reference/templates/create-template.md) | templates | partial | 3 |
| [Retrieve Template](https://resend.com/docs/api-reference/templates/get-template.md) | templates | partial | 3 |
| [List Templates](https://resend.com/docs/api-reference/templates/list-templates.md) | templates | partial | 3 |
| [Update Template](https://resend.com/docs/api-reference/templates/update-template.md) | templates | partial | 3 |
| [Delete Template](https://resend.com/docs/api-reference/templates/delete-template.md) | templates | partial | 3 |
| [Publish Template](https://resend.com/docs/api-reference/templates/publish-template.md) | templates | partial | 3 |
| [Duplicate Template](https://resend.com/docs/api-reference/templates/duplicate-template.md) | templates | partial | 3 |
| [Create Contact](https://resend.com/docs/api-reference/contacts/create-contact.md) | contact-management | partial | 3 |
| [Retrieve Contact](https://resend.com/docs/api-reference/contacts/get-contact.md) | contact-management | partial | 3 |
| [List Contacts](https://resend.com/docs/api-reference/contacts/list-contacts.md) | marketing | missing | 3 |
| [Update Contact](https://resend.com/docs/api-reference/contacts/update-contact.md) | contact-management | partial | 3 |
| [Delete Contact](https://resend.com/docs/api-reference/contacts/delete-contact.md) | contact-management | partial | 3 |
| [Add Contact to Segment](https://resend.com/docs/api-reference/contacts/add-contact-to-segment.md) | marketing | missing | 3 |
| [List Contact Segments](https://resend.com/docs/api-reference/contacts/list-contact-segments.md) | marketing | missing | 3 |
| [Delete Contact Segment](https://resend.com/docs/api-reference/contacts/delete-contact-segment.md) | marketing | missing | 3 |
| [Retrieve Contact Topics](https://resend.com/docs/api-reference/contacts/get-contact-topics.md) | marketing | missing | 3 |
| [Update Contact Topics](https://resend.com/docs/api-reference/contacts/update-contact-topics.md) | marketing | missing | 3 |
| [Create Contact Property](https://resend.com/docs/api-reference/contact-properties/create-contact-property.md) | marketing | missing | 3 |
| [Retrieve Contact Property](https://resend.com/docs/api-reference/contact-properties/get-contact-property.md) | marketing | missing | 3 |
| [List Contact Properties](https://resend.com/docs/api-reference/contact-properties/list-contact-properties.md) | marketing | missing | 3 |
| [Update Contact Property](https://resend.com/docs/api-reference/contact-properties/update-contact-property.md) | marketing | missing | 3 |
| [Delete Contact Property](https://resend.com/docs/api-reference/contact-properties/delete-contact-property.md) | marketing | missing | 3 |
| [Create Contact Import](https://resend.com/docs/api-reference/contacts/create-contact-import.md) | contact-management | partial | 3 |
| [Retrieve Contact Import](https://resend.com/docs/api-reference/contacts/get-contact-import.md) | contact-management | partial | 3 |
| [List Contact Imports](https://resend.com/docs/api-reference/contacts/list-contact-imports.md) | marketing | missing | 3 |
| [Create Segment](https://resend.com/docs/api-reference/segments/create-segment.md) | marketing | missing | 3 |
| [Retrieve Segment](https://resend.com/docs/api-reference/segments/get-segment.md) | marketing | missing | 3 |
| [List Segments](https://resend.com/docs/api-reference/segments/list-segments.md) | marketing | missing | 3 |
| [Update Segment](https://resend.com/docs/api-reference/segments/update-segment.md) | marketing | missing | 3 |
| [Delete Segment](https://resend.com/docs/api-reference/segments/delete-segment.md) | marketing | missing | 3 |
| [List Segment Contacts](https://resend.com/docs/api-reference/segments/list-segment-contacts.md) | marketing | missing | 3 |
| [Retrieve Metrics](https://resend.com/docs/api-reference/segments/get-segment-metrics.md) | marketing | missing | 3 |
| [Create Topic](https://resend.com/docs/api-reference/topics/create-topic.md) | marketing | missing | 3 |
| [Retrieve Topic](https://resend.com/docs/api-reference/topics/get-topic.md) | marketing | missing | 3 |
| [List Topics](https://resend.com/docs/api-reference/topics/list-topics.md) | marketing | missing | 3 |
| [Update Topic](https://resend.com/docs/api-reference/topics/update-topic.md) | marketing | missing | 3 |
| [Delete Topic](https://resend.com/docs/api-reference/topics/delete-topic.md) | marketing | missing | 3 |
| [Create Domain](https://resend.com/docs/api-reference/domains/create-domain.md) | domains | partial | 1 |
| [Claim Domain](https://resend.com/docs/api-reference/domains/claim-domain.md) | domain-claims | partial | 1 |
| [Retrieve Domain Claim](https://resend.com/docs/api-reference/domains/get-domain-claim.md) | domain-claims | partial | 1 |
| [Verify Domain Claim](https://resend.com/docs/api-reference/domains/verify-domain-claim.md) | domain-claims | partial | 1 |
| [Verify Domain](https://resend.com/docs/api-reference/domains/verify-domain.md) | domains | partial | 1 |
| [Retrieve Domain](https://resend.com/docs/api-reference/domains/get-domain.md) | domains | partial | 1 |
| [List Domains](https://resend.com/docs/api-reference/domains/list-domains.md) | domains | partial | 1 |
| [Update Domain](https://resend.com/docs/api-reference/domains/update-domain.md) | domains | partial | 1 |
| [Delete Domain](https://resend.com/docs/api-reference/domains/delete-domain.md) | domains | partial | 1 |
| [Retrieve Log](https://resend.com/docs/api-reference/logs/retrieve-log.md) | request-logs | missing | 1 |
| [List Logs](https://resend.com/docs/api-reference/logs/list-logs.md) | request-logs | missing | 1 |
| [Create API key](https://resend.com/docs/api-reference/api-keys/create-api-key.md) | api-keys | partial | 1 |
| [List API keys](https://resend.com/docs/api-reference/api-keys/list-api-keys.md) | api-keys | partial | 1 |
| [Update API key](https://resend.com/docs/api-reference/api-keys/update-api-key.md) | api-keys | partial | 1 |
| [Delete API key](https://resend.com/docs/api-reference/api-keys/delete-api-key.md) | api-keys | partial | 1 |
| [Add Suppression](https://resend.com/docs/api-reference/suppressions/add-suppression.md) | suppression | partial | 1 |
| [Retrieve Suppression](https://resend.com/docs/api-reference/suppressions/get-suppression.md) | suppression | partial | 1 |
| [List Suppressions](https://resend.com/docs/api-reference/suppressions/list-suppressions.md) | suppression | partial | 1 |
| [Remove Suppression](https://resend.com/docs/api-reference/suppressions/remove-suppression.md) | suppression | partial | 1 |
| [Add Batch Suppressions](https://resend.com/docs/api-reference/suppressions/add-batch-suppressions.md) | suppression | partial | 1 |
| [Remove Batch Suppressions](https://resend.com/docs/api-reference/suppressions/remove-batch-suppressions.md) | suppression | partial | 1 |
| [List Grants](https://resend.com/docs/api-reference/oauth/list-grants.md) | oauth | missing | 6 |
| [Revoke Grant](https://resend.com/docs/api-reference/oauth/revoke-grant.md) | oauth | missing | 6 |
| [Create Webhook](https://resend.com/docs/api-reference/webhooks/create-webhook.md) | webhooks | partial | 1 |
| [Retrieve Webhook](https://resend.com/docs/api-reference/webhooks/get-webhook.md) | webhooks | partial | 1 |
| [List Webhooks](https://resend.com/docs/api-reference/webhooks/list-webhooks.md) | webhooks | partial | 1 |
| [Update Webhook](https://resend.com/docs/api-reference/webhooks/update-webhook.md) | webhooks | partial | 1 |
| [Delete Webhook](https://resend.com/docs/api-reference/webhooks/delete-webhook.md) | webhooks | partial | 1 |
| [Rotate Signing Secret](https://resend.com/docs/api-reference/webhooks/rotate-signing-secret.md) | webhooks | partial | 1 |
| [List Events](https://resend.com/docs/api-reference/webhooks/list-events.md) | webhooks | partial | 1 |
| [Retrieve Event](https://resend.com/docs/api-reference/webhooks/get-event.md) | webhooks | partial | 1 |
| [Replay Event](https://resend.com/docs/api-reference/webhooks/replay-event.md) | webhooks | partial | 1 |
| [List Attempts](https://resend.com/docs/api-reference/webhooks/list-event-attempts.md) | webhooks | partial | 1 |
| [Register Client](https://resend.com/docs/api-reference/oauth/register.md) | oauth | missing | 6 |
| [Authorize](https://resend.com/docs/api-reference/oauth/authorize.md) | oauth | missing | 6 |
| [Token](https://resend.com/docs/api-reference/oauth/token.md) | oauth | missing | 6 |
| [Revoke Token](https://resend.com/docs/api-reference/oauth/revoke.md) | oauth | missing | 6 |
| [Resend API vs SDK](https://resend.com/docs/api-vs-sdk.md) | ecosystem | missing | 6 |
| [How to delete your Resend team](https://resend.com/docs/knowledge-base/how-can-i-delete-my-team.md) | identity | partial | 2 |
| [The Secret Endpoint](https://resend.com/docs/secret.md) | provider-dependencies | external dependency | 6 |
| [SupaSquad + Resend](https://resend.com/docs/supasquad.md) | ecosystem | missing | 6 |
