# Queue design

There is no separate message broker. The delivery queue, the webhook queue and the DNS re-check schedule are all PostgreSQL tables, claimed with `FOR UPDATE SKIP LOCKED` and protected by leases. Rationale: [ADR 0001](ADR/0001-postgres-outbox-queue.md).

## Delivery queue (`email_recipients`)

Every recipient row is a queue item. Admission inserts it in the same transaction as the email, so a successful API response always means the work is durably enqueued. There is no window where the email exists but the queue item does not, or the other way round.

### Claim

`services/mail-worker/src/dispatcher.ts`:

```sql
UPDATE email_recipients
   SET state = 'DISPATCHING',
       lease_owner = $worker_id,
       lease_expires_at = now() + make_interval(secs => $lease_seconds),
       submission_attempts = submission_attempts + 1,
       state_changed_at = now()
 WHERE id IN (
   SELECT id FROM email_recipients
    WHERE state IN ('QUEUED', 'SCHEDULED', 'RETRYING')
      AND next_attempt_at <= now()
      AND stream = ANY($streams)
    ORDER BY next_attempt_at
    LIMIT $batch
    FOR UPDATE SKIP LOCKED)
RETURNING id, org_id, email_id, address, submission_attempts;
```

- The partial index `email_recipients_dispatch_idx (stream, next_attempt_at) WHERE state IN ('QUEUED','SCHEDULED','RETRYING')` keeps the scan small no matter how much history accumulates.
- `SKIP LOCKED` lets any number of workers claim concurrently without blocking each other or double-claiming.
- Scheduled mail is simply a row with a future `next_attempt_at`.

### Leases and heartbeat

A claimed row carries `lease_owner` and `lease_expires_at` (default 120 s, `LEASE_SECONDS`). While a batch is in flight, the worker extends the lease every quarter-lease for rows it still owns in `DISPATCHING`. A crashed worker's leases expire and are picked up by reconciliation (below). A blind re-claim would risk duplicates, so expired leases are never simply re-claimed.

### Streams

`email_recipients.stream` is `transactional` or `marketing`. A worker serves the streams in `WORKER_STREAMS` (default `transactional,marketing` for a single local worker). Broadcasts produce one marketing email per eligible contact through the existing admission path. Their durable recipient ledger and queue admission commit together; a restarted worker resumes pending rows without re-admitting queued rows. Campaign expansion runs in 25-contact batches, rechecks subscription state and pauses at quota limits. The dispatcher checks subscription state and cancellation again before SMTP handoff. Run separate production worker pools with explicit `WORKER_STREAMS=transactional` and `WORKER_STREAMS=marketing` so campaign volume does not share transactional capacity.

### Composition per email, hand-off per recipient

Claimed rows are grouped by email. Each email is composed and DKIM-signed once (`composeSignedMessage`). Each recipient is then submitted separately with its own VERP envelope sender and a single `RCPT TO`, which gives every recipient its own Postfix queue id and bounce identity.

## Retry ownership

Retries have exactly one owner at any moment:

| Phase | Owner | Mechanism |
| --- | --- | --- |
| Before Postfix accepts (`QUEUED` … `DISPATCHING`, `RETRYING`) | Application | `RETRYING` with bounded exponential backoff and full jitter: `backoffMs(attempt)`, 15 s doubling to a 30 min cap. After `MAX_SUBMISSION_ATTEMPTS` (default 8): `FAILED`. |
| After `250 queued as …` (`MTA_ACCEPTED`, `DEFERRED`) | Postfix | `minimal_backoff_time` / `maximal_backoff_time`, `maximal_queue_lifetime = 2d` (production config). The application never re-submits. |

The state machine enforces this: `MTA_ACCEPTED`, `DEFERRED` and `REMOTE_ACCEPTED` have no transition to `DISPATCHING` or `RETRYING`, and a unit test asserts it. Details: [ADR 0002](ADR/0002-postfix-owns-transport-retries.md).

Hand-off failures are classified by `classifySubmissionError`:

| Situation | Was it queued? | Result |
| --- | --- | --- |
| Postfix replied 5xx | No | `FAILED` |
| Postfix replied 4xx | No | `RETRYING` |
| No reply, failure during CONN/EHLO/MAIL FROM/RCPT TO, or `ECONNECTION` | No | `RETRYING` |
| No reply after DATA started (socket dropped awaiting final `250`) | Unknown | `DELIVERY_UNKNOWN` |

## Resolving uncertain hand-offs

`Dispatcher.reconcileUncertain()` runs every 15 s. It examines two kinds of recipient: those in `DISPATCHING` with an expired lease, and those in `DELIVERY_UNKNOWN`. Its evidence comes from two sources:

- `mta_queue_messages`: the reconciler inserts `(queue_id, recipient_id)` whenever Postfix logs `qmgr … from=<b+…>` (the message entered the active queue). The recipient id comes from the HMAC-verified VERP address, so this mapping does not depend on the dispatcher having saved the queue id.
- `worker_checkpoints['postfix-log']`: the reconciler's `watermark_at` (the newest log time it has fully processed; set to "now" whenever it reaches end-of-file) and `heartbeat_at`.

Decision:

1. A queue record exists → transition to `MTA_ACCEPTED` (Postfix has it; it will report the outcome).
2. No queue record, the reconciler heartbeat is under 60 s old, **and** the watermark is more than `RECONCILE_GRACE_SECONDS` (default 60) past the moment of uncertainty → Postfix never queued it → `RETRYING` (safe re-dispatch).
3. Otherwise → leave it. If the reconciler is down, recipients stay `DISPATCHING` / `DELIVERY_UNKNOWN` rather than risking a duplicate.

## Webhook queue (`webhook_deliveries`)

Rows are inserted in the same transaction as the event that causes them (outbox). `services/webhook-dispatcher` claims due rows (`pending`, or `retrying` with `next_attempt_at <= now()`, or `delivering` with an expired 60 s lease) using the same `UPDATE … WHERE id IN (… FOR UPDATE SKIP LOCKED)` pattern, incrementing `attempts`. Results:

- 2xx → `succeeded`.
- Otherwise → `retrying` after 30 s, 2 min, 10 min, 30 min, 1 h, 3 h, 6 h, 12 h (`RETRY_SCHEDULE_SECONDS`); after the 8th failure → `dead`.
- Every attempt is recorded in `webhook_attempts`.

Delivery is at-least-once. The `webhook-id` header is the event id and stays the same across retries, so receivers can deduplicate. Ordering between events is not guaranteed; payloads carry `created_at`.

## Domain re-verification schedule (`domains`)

`services/domain-verifier` claims up to 10 domains with `next_check_at <= now()` and no live `check_lease_until`, setting a 5-minute lease (`SKIP LOCKED`). Several replicas can run safely. The next check is scheduled by `nextCheckDelayMs`:

| Domain status | Next check |
| --- | --- |
| pending, under 1 h old | 2 min |
| pending, older | 15 min |
| verified | 6 h (drift detection) |
| failed / disabled | 24 h |

DNS lookups run outside any transaction; only the result is applied transactionally.

## Why not BullMQ for delivery

The spec lists BullMQ for orchestration. It is not used on the delivery path, for these reasons:

- **No dual write.** Admission must persist the email and enqueue it atomically. A Redis queue would need a second write that can fail independently of the database commit, which reintroduces the gap a transactional outbox exists to close.
- **One source of truth.** Customer-visible status, retry scheduling and the queue are the same row, so they cannot disagree.
- **Durability.** PostgreSQL is already the system's backed-up, point-in-time-recoverable store. Redis here is used only for rate limits and throttles, which fail open by design.

BullMQ may still suit future campaign or automation orchestration that does not need this coupling.

## Observed queue metrics

The dispatcher publishes `smtp_queue_depth{stream}` and `smtp_queue_oldest_message_age{stream}` every 15 s. Both cover recipients due for dispatch, not Postfix's internal queue. Postfix queue depth (`mailq`) is not exported yet.
