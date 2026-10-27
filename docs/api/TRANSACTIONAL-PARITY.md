# Transactional additions

These endpoints extend `/v1` while retaining existing delivery-state meanings; responses gain additive fields. Resend wire compatibility is not promised.

## Scheduling

`PATCH /v1/emails/{id}` accepts `{ "scheduled_at": "2026-11-01T09:00:00Z" }` with `emails:send`. The time must be in the future and within 30 days. Only an existing scheduled email whose recipients are all scheduled or suppressed can change. At least one scheduled recipient is required. Cancellation, dispatch, or a completed recipient makes the operation return `409 invalid_state` without partial updates. Locks serialize rescheduling against worker claims. Each change produces `email.rescheduled` with the previous and new timestamps.

Scheduled API mail rechecks the original API key at dispatch. Revoked, expired or deleted keys produce an explicit failure instead of sending. Organization status, domain verification and suppressions are also checked at dispatch.

## Attachments

Each attachment accepts exactly one of base64 `content` or an HTTPS `path`, and optionally `content_id` (1–127 ASCII letters, digits, `.`, `_`, `@`, `+`, `-`). IDs must be unique within a message. `filename` remains required. A content ID composes an inline MIME part referenced with `cid:<content_id>`; SMTP-submitted inline parts retain their IDs.

Remote downloads use public DNS addresses pinned to the connection, certificate validation, no redirects, a 10-second connection/download deadline and bounded reads. HTTP, credentials, local files and private/reserved targets are rejected. A redirect is rejected even if its destination is public. Downloads occur before the database transaction. Existing successful idempotency results are returned without downloading again. A concurrent first submission may download twice, but admission still deduplicates the email transactionally.

Decoded attachments are limited to 10 MiB per email and 24 MiB per API request. Base64 HTTP body limits still apply. Batch attachments remain supported. These limits intentionally differ from Resend.

HTML-only API messages generate a plain-text alternative at admission. Setting `text` explicitly to an empty string disables generation.

SMTP retries can use the `X-MP-Idempotency-Key` MIME header (1–256 characters, 24-hour lifetime). Retry the same raw message and envelope; changing content or envelope recipients with the same key is rejected with SMTP 550. This internal header is stripped before outbound composition. Without a key, SMTP behavior is unchanged.

`GET /v1/emails/{id}/attachments` lists IDs, filename, MIME type, content ID, size and SHA-256. `GET /v1/emails/{id}/attachments/{attachmentId}` also returns base64 `content`. Both require `emails:read_content` and enforce organization/project ownership. The dashboard Content tab downloads files.

## Email filters and export

`GET /v1/emails` adds `created_after` (inclusive), `created_before` (exclusive), `api_key_id`, `source` (`api` or `smtp`) and `search` (case-insensitive literal subject/sender/recipient substring). All combine with the existing status and cursor filters. Dates use ISO 8601 offsets. Dashboard calendar dates use the viewer's local midnight.

`GET /v1/emails/export` accepts the same filters without cursor/limit and returns quoted UTF-8 CSV. It is restricted to dashboard sessions with `org:manage`. Exports exceeding 1,000 emails return `422` and require narrower filters; larger email exports use the background API described below; exports of other resources remain unfinished. Cells that could execute spreadsheet formulas are prefixed with an apostrophe. BCC addresses and message bodies are excluded.

## Sharing

`POST /v1/emails/{id}/shares` requires `emails:read_content`, creates a 48-hour bearer link and returns `{id,url,expires_at}`. Anyone holding that URL can view subject, sender and message content until expiration. Links expose neither recipient lists nor attachments. `DELETE /v1/emails/{id}/shares/{shareId}` revokes a link with the same permission.

Only a SHA-256 token hash is stored. Public views use a restrictive CSP, sandboxed HTML, no referrer, no caching and no indexing. Request logging redacts public bearer-link paths. Expiration is enforced on every access even when garbage collection is not running.

## Webhooks

`POST /v1/webhooks/{id}/deliveries/{deliveryId}/replay` requires `webhooks:manage`. Only completed (`succeeded` or `dead`) deliveries on an enabled endpoint can replay. Other states return `409`. The original payload and event ID remain stable; a new timestamp/signature is generated on delivery. Receivers must still deduplicate by event ID. Historical attempt numbers and records are retained while a new retry cycle starts at the first backoff delay. The replay is audited.

`GET /v1/webhooks/{id}/deliveries/{deliveryId}/attempts` requires `webhooks:read` and supports the standard cursor pagination. It returns attempt number, HTTP status, sanitized transport error, duration and timestamp. Endpoint/project/tenant ownership is checked before history is read. Both actions are available on the webhook detail page.

## Request logs and metrics

`GET /v1/logs` lists authenticated tenant request metadata with optional `status_code`, `api_key_id`, cursor and limit. `GET /v1/logs/{id}` retrieves a record. Both require `emails:read`. Only route templates, method, status, request ID, key ID and duration are stored. Bodies, query values, credentials and bearer tokens are not stored. Unauthenticated requests and log-reading requests are excluded. Persistence happens after the response and may be briefly delayed; failure does not reject the original operation.

`GET /v1/analytics?days=30` returns daily stored email-event counts, and `GET /v1/usage?days=30` returns daily accepted emails/recipients. Both require `analytics:read`, allow 1–90 days and use UTC calendar days including today. Empty days are omitted. An event count is not a count of unique emails, opens or inbox placement. The Metrics page displays both tables. Aggregates are computed from stored rows; rollup jobs remain future scaling work.

The mail worker removes expired shares and API request logs older than 30 days in bounded batches. These defaults do not implement configurable email-content retention.

## Additional management operations

`PATCH /v1/domains/{id}` accepts `{tls_policy: "opportunistic" | "enforced"}` with `domains:manage`. The dashboard exposes this setting. It is evaluated at dispatch, including scheduled emails. Enforced delivery uses the internal Postfix listener on `MTA_ENFORCED_TLS_PORT` (default 10026), whose queued messages use `smtp_enforced` with `smtp_tls_security_level=encrypt`. Missing transport configuration fails closed. The MTA owns retries and eventual expiration; it never falls back to plaintext. Deploy the updated Postfix configuration before enabling this setting; both internal ports must stay private. TLS 1.2 remains the minimum.

`PATCH /v1/api-keys/{id}` renames a key using `{name}` and `api_keys:manage`. This does not change its secret, scope or revocation state.

`GET /v1/suppressions/{id-or-email}` retrieves a suppression with `suppressions:read`. Listing also accepts `reason`. `POST /v1/suppressions/batch` and `POST /v1/suppressions/batch/remove` accept `{emails: [...]}` with 1–100 addresses and require `suppressions:manage`. Addresses are validated before the transaction and duplicates are collapsed; add is idempotent. The `added` count means unique addresses requested, including addresses already suppressed; removal counts actual rows deleted. Both operations are audited. Complaint/FBL ingestion remains unfinished.


## Background email exports

POST /v1/exports accepts {"filters":{...}} using the email-list filters without cursor or limit, and returns 202 with a job ID. GET /v1/exports lists jobs; GET /v1/exports/{id} returns progress; GET /v1/exports/{id}/download streams a ready CSV. All require an org:manage dashboard session and current project ownership; API keys cannot create or download exports. The Emails page queues the current filters and opens the Exports page, which polls progress and downloads authenticated results.

The mail worker writes 500-row PostgreSQL chunks and a checkpoint atomically. Expired two-minute leases are reclaimed after a restart. Limits are 100,000 emails per export and five active jobs per project. A ready download expires seven days after job creation, regardless of garbage collection. Expired chunks are purged in bounded batches; job metadata is removed after 30 days. CSV cells are formula-protected; BCC addresses and content are excluded. Exports exclude emails admitted after the job's database creation time. Delivery states and mutable filter membership are observed during processing, rather than held as a long-running database snapshot. Failed jobs show an error; create a new export to retry. Other resource exports, member metadata visibility and completion emails are pending.

## DKIM selector rotation

GET /v1/domains/{id}/dkim-keys exposes public selectors, DNS records and lifecycle state with domains:read. POST on that path requires domains:manage and a verified, sending-enabled domain. It generates one pending selector while retaining the current signing key. Publish its TXT record, then POST /v1/domains/{id}/dkim-keys/{keyId}/verify. Only a valid DNS result for that exact key switches signing. Missing DNS leaves the old key active. Pending rotations can be cancelled with DELETE on the key path; active keys and the initial onboarding key cannot be cancelled.

Rotation holds the domain lock and permits one pending rotation or overlap at a time. Existing active keys become retiring for seven days. The domain verifier retires them after the deadline; encrypted keys are retained. Keep the old public DNS record published through the overlap so already-signed queued messages can verify. DNS publication/removal remains the domain owner's responsibility. Stale domain-verification snapshots are rejected if rotation changed the DKIM host. Dashboard domain details show DNS values, verification, cancellation and overlap dates.

## Webhook health and test events

POST /v1/webhooks/{id}/test requires webhooks:manage and an enabled endpoint. It queues a synthetic webhook.test event even when that type is not subscribed. Tests use the same signed outbox, attempt history, retry schedule and SSRF protection as real events. A per-endpoint ten-second throttle applies. The dashboard detail page offers this action.

Health fields include consecutive_failures, first_failure_at, last_failure_at and last_success_at. Ten consecutive failed attempts spanning at least 24 hours disable an endpoint with reason sustained_delivery_failures. Both count and elapsed duration must be satisfied. A successful attempt resets the streak. A manual enabled update resets the streak and increments a generation that fences results from previously in-flight requests. Auto-disable writes an audit event, increments the webhook auto-disable metric and creates one durable project notification, visible under Notifications and GET /v1/notifications (org:read dashboard session). Notifications are in-app; team email delivery remains pending. Fix the receiver, re-enable it, then test or replay. Pending deliveries encountering a disabled endpoint become dead; they do not restart automatically.

## Deterministic simulation mode

API send and batch bodies accept optional test_mode: true. Normal verified-sender, authentication, quotas, scheduling and idempotency rules still apply. Every recipient, including CC/BCC, must be one of success@simulate.mail-platform.invalid, defer@simulate.mail-platform.invalid, bounce@simulate.mail-platform.invalid or suppress@simulate.mail-platform.invalid. Live mode rejects that reserved namespace. Remote attachments are rejected in test mode; base64 attachments remain supported. SMTP has no simulation switch.

The worker never composes or submits simulated messages to Postfix. Success reaches REMOTE_ACCEPTED; defer first reaches DEFERRED, then REMOTE_ACCEPTED on a subsequent worker tick; bounce reaches hard BOUNCED; suppress reaches SUPPRESSED. These are labelled simulated outcomes, not evidence of remote delivery. Simulation ignores stored suppressions and does not add bounce suppressions, so scenarios repeat predictably. Expired simulation leases recover independently of Postfix logs. Stored email summaries and all email-event/webhook data carry test_mode. The dashboard send dialog explicitly separates real sending from simulation, and email lists/details show the mode.

Email list and export filters accept test_mode=true or false; omission includes both. Daily usage and analytics default to live-only; test_mode=true requests simulations separately, also selectable on the Metrics page. Admission quotas and operational queue counts still include simulations. Complaint events and plus-address labels remain unimplemented; these test addresses intentionally differ from Resend's.
