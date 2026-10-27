# Failure modes

What the implemented system does when a component fails. "Duplicate risk" means the chance that the same recipient receives the message twice. The platform delivers at-least-once and works to make that rare and visible; it does not claim exactly-once Internet delivery.

| Failure | Detection | Implemented behaviour | Duplicate risk |
| --- | --- | --- | --- |
| **Worker crashes mid-batch** | Lease on `DISPATCHING` rows expires (`LEASE_SECONDS`, default 120 s) | `reconcileUncertain` checks `mta_queue_messages`. If Postfix queued the message → `MTA_ACCEPTED`. If the Postfix log watermark has passed the lease expiry plus the grace period with no record → `RETRYING`. Otherwise it waits. | Only if Postfix queued the message but its log line was lost; the watermark rule covers normal log lag. |
| **Connection to Postfix drops after DATA** | No final SMTP reply (`classifySubmissionError` → `unknown`) | `DELIVERY_UNKNOWN` plus `email.delivery_unknown` event, then the same reconciliation as above. No blind retry. | Same as above. |
| **Postfix down / port 10025 refused** | `ECONNECTION` before DATA | `RETRYING` with backoff (15 s doubling, 30 min cap, jitter). `FAILED` after `MAX_SUBMISSION_ATTEMPTS` (8). `smtp_connection_failures_total` increments. | None: nothing was queued. |
| **Postfix rejects hand-off (5xx)** | Reply code | `FAILED`, `bounce_class = mta_rejected`. | None. |
| **Remote MX temporary failure / greylisting** | Postfix `status=deferred` | `DEFERRED` (event `email.deferred`, `retry_owner: "mta"`). Postfix retries; the application never re-submits. `FAILED` (`retry_expired`) if Postfix's queue lifetime expires. | None from the platform. |
| **Remote MX permanent rejection** | `status=bounced` in the log, and Postfix's DSN to the bounce processor | `BOUNCED` with a classification. Hard classes (`mailbox_unavailable`, `domain_invalid`, `recipient_rejected` for 5.1.3) add a tenant-scoped suppression. Policy, content, authentication and mailbox-full rejections are not suppressed. | n/a |
| **DSN arrives twice / after the log already recorded the bounce** | — | The transition is guarded (already `BOUNCED` → no-op). `bounce_events` dedupes on `bounce:<recipient>:<status>`. Suppression insert is `ON CONFLICT DO NOTHING`. | n/a |
| **Late asynchronous bounce after acceptance** | DSN to the VERP address via the bounce-domain MX | `REMOTE_ACCEPTED` → `BOUNCED` with `asynchronous: true` in the event data. | n/a |
| **Forged bounce** | VERP HMAC check at `RCPT TO` | Rejected with `550 5.1.1`; no database lookup happens. | n/a |
| **Delivery reconciler down** | `worker_checkpoints.heartbeat_at` stops advancing | Recipients stay in `MTA_ACCEPTED`/`DEFERRED` until it restarts, then it resumes from the stored byte offset. Uncertain hand-offs are **not** retried while its heartbeat is stale. Each chunk and its offset commit in one transaction, so restarts neither skip nor double-apply lines. | None. |
| **Postfix log rotated or truncated** | File identity (`dev:ino:birthtime`) changes or size < stored offset | Reconciler restarts from offset 0. Re-applied lines are idempotent (guarded transitions, deduped events). | None. |
| **PostgreSQL unavailable** | Query errors | API returns `500 internal_error` and nothing is accepted, so no false 202. Worker loops log and back off exponentially (capped at 30 s) via `runLoop`. Admission is atomic, so there are no half-written emails. | None. |
| **Redis unavailable** | ioredis errors | **Fails open**: per-second API rate limits, login/signup throttles and SMTP auth-failure throttles are skipped. Per-tenant quotas still apply because they are enforced in PostgreSQL inside the admission transaction (advisory lock per org). | n/a |
| **Webhook receiver down or slow** | Non-2xx, timeout (10 s) or connection error | Retries at 30 s, 2 m, 10 m, 30 m, 1 h, 3 h, 6 h, 12 h, then `dead`. Every attempt is stored in `webhook_attempts` and visible in the dashboard. | Receivers may get the same event more than once; `webhook-id` is stable for deduplication. |
| **Webhook URL resolves to a private address** | `resolveSafeTarget` at creation and at every send | Creation fails with `422`; at send time the attempt fails and is retried, then dead-lettered. The connection is pinned to the validated IP, which defeats DNS rebinding. Redirects are not followed. | n/a |
| **DNS timeout during verification** | `temp_error` record status | Recorded on the record. A verified domain is **not** downgraded on temporary errors, only on definitive `missing`/`invalid`/`conflict` of ownership or DKIM. | n/a |
| **Record published but not yet propagated** | Authoritative nameservers have it, recursive resolvers do not | Status `pending` ("propagating"), not `missing`. | n/a |
| **DKIM key cannot be decrypted** (wrong `ENCRYPTION_KEYS`) | Exception in `loadSendingIdentity` | Recipients go to `FAILED` ("message could not be composed or signed"); `dkim_signing_failures_total` increments. Mail is never sent unsigned. | None. |
| **Domain loses verification after admission** | `sending_enabled = false` at dispatch | Recipients go to `FAILED`. | None. |
| **Address suppressed after admission** | Re-checked at dispatch | `SUPPRESSED`. | None. |
| **Organization suspended after admission** | Checked at dispatch | `FAILED` (`bounce_class = platform_policy`). | None. |
| **Graceful shutdown (SIGTERM)** | Signal handlers | The API drains in-flight requests (`app.close()`). Workers abort their poll loops, let the current batch finish, then close pools. | None. |

## Not yet covered

- Postfix queue loss (lost volume or host). Messages in `MTA_ACCEPTED`/`DEFERRED` would stay there indefinitely. No sweep yet marks them `DELIVERY_UNKNOWN` after a maximum queue lifetime.
- Multi-node Postfix: each node needs its own reconciler and checkpoint name. The checkpoint name is currently the fixed string `postfix-log`.
- Alerting rules for these conditions (metrics exist; Prometheus alert definitions do not).
