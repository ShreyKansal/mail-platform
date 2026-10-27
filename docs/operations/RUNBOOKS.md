# Runbooks

## Stuck DELIVERY_UNKNOWN

**Signal:** recipients stay `DELIVERY_UNKNOWN` (or `DISPATCHING` with an expired lease) for more than a few minutes.

1. Check the reconciler: `select name, position, heartbeat_at, watermark_at from worker_checkpoints;`
   * `heartbeat_at` older than 60 s means the reconciler is down or crashing. Restart it and read its log.
   * `watermark_at` not advancing means it's reading the wrong file. Check `POSTFIX_LOG_PATH` against the Postfix bind mount.
2. Once the reconciler is healthy, `reconcileUncertain()` resolves each recipient within `RECONCILE_GRACE_SECONDS`, either to `MTA_ACCEPTED` (Postfix queued it) or to `RETRYING` (it provably didn't).
3. **Don't** force recipients into `RETRYING` by hand while the reconciler is unhealthy. That's exactly the blind retry that causes duplicates.

## Dispatch queue growing

**Signal:** `smtp_queue_depth` or `smtp_queue_oldest_message_age` rising.

1. Are workers running, and is `WORKER_STREAMS` covering the stream? (The worker logs it at start.)
2. Hand-off failures? Look at `smtp_connection_failures_total` and worker `MTA hand-off failed` lines. Check Postfix health (`docker compose ps`, `postfix status`).
3. Postfix rejecting with 4xx (disk, resources)? `docker compose exec postfix tail /var/log/postfix/maillog`.
4. Scale workers. Claims are concurrency-safe.

## Postfix queue growing (DEFERRED climbing)

1. `postqueue -p | tail` and group by deferral reason.
2. Connection timeouts to many domains → outbound port 25 or network.
3. One provider with 4.7.x → throttling or reputation. Reduce volume (no automatic per-provider throttle yet).
4. Don't delete messages with `postsuper -d` without updating application state ([QUEUE-MANAGEMENT](../smtp/QUEUE-MANAGEMENT.md)).

## Reconciler lagging

`watermark_at` far behind the newest log line, with a fresh heartbeat:
* It processes up to 1 MiB per tick. Lower `POLL_INTERVAL_MS`, or check database latency. There is only one reconciler per file.
* Large backlogs catch up on their own. Each chunk is atomic with its checkpoint.

## DKIM decrypt failure

**Signal:** `dkim_signing_failures_total` increases. Worker log: `message composition or signing failed` with `Unsupported state or unable to authenticate data`. The affected recipients are `FAILED` (`platform_policy`, "message could not be composed or signed").

Cause: the `ENCRYPTION_KEYS` in this process don't include the key ID used to seal the DKIM key. Usual reasons are a key removed during rotation, a mismatch between environments, or a database restored without the matching keys.
1. Compare the key ID prefix in `dkim_keys.private_key_sealed` (`v1.<keyId>.…`) with the IDs configured in every worker.
2. Restore the missing key, keeping the current key first in the list. Deploy, then resend. Failed recipients aren't retried automatically.

## Bounce spike

**Signal:** `email_bounced_total{class="mailbox_unavailable"}` jumps.
1. Find the tenant (SQL over `bounce_events` grouped by `org_id` for the last hour).
2. Bought or stale list → suspend: `update organizations set status='suspended', suspended_reason='…' where id=…`. Admission and dispatch both stop. Record it in the audit log. There is no admin UI yet.
3. Policy or authentication spikes across tenants point to an IP or platform problem. Check PTR, the SPF include and blocklists.
