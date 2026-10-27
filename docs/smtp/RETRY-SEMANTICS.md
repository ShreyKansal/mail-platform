# Retry semantics

**Purpose.** Defines exactly who retries what, so the application and Postfix never both retry the same message.

## Two separate retry domains

| Stage | Retried by | States | Policy |
|---|---|---|---|
| Hand-off to Postfix (:10025) | **mail-worker** | `QUEUED`/`SCHEDULED` → `DISPATCHING` → `RETRYING` → `DISPATCHING` … | `backoffMs`; at most `MAX_SUBMISSION_ATTEMPTS` (default 8) |
| Postfix to the remote MX | **Postfix** | `MTA_ACCEPTED` → `DEFERRED`* → `REMOTE_ACCEPTED` / `BOUNCED` / `FAILED` | `main.cf` backoff and queue lifetime |

Once a recipient reaches `MTA_ACCEPTED` the application **never** dispatches it again. The state machine (`packages/mail-protocol/src/state-machine.ts`) has no transition from `MTA_ACCEPTED`, `DEFERRED` or `REMOTE_ACCEPTED` back to `DISPATCHING` or `RETRYING`, and a unit test asserts this.

## Classifying a failed hand-off

`classifySubmissionError()` in `services/mail-worker/src/mta.ts`:

| Observation | Meaning | Outcome |
|---|---|---|
| Postfix answered 5xx | Definitely not queued | `FAILED` (`bounce_class=mta_rejected`) |
| Postfix answered 4xx | Definitely not queued | `RETRYING` |
| `ECONNECTION` / `EDNS`, or failure during `CONN`/`EHLO`/`MAIL FROM`/`RCPT TO`/`STARTTLS` | Never reached DATA | `RETRYING` |
| Socket error or timeout **after DATA started**, no reply | Postfix *may* have queued it | `DELIVERY_UNKNOWN` |

After `MAX_SUBMISSION_ATTEMPTS` retryable failures the recipient becomes `FAILED`.

### Backoff

`backoffMs(attempt)` = full jitter over `[base/2, base]`, where `base = min(30 min, 15 s × 2^(attempt−1))`. Attempt 1 waits 7.5–15 s; attempt 3 waits 30–60 s; the cap is 30 minutes.

## Resolving uncertainty without blind retries

`Dispatcher.reconcileUncertain()` runs every 15 seconds. It considers recipients that are `DISPATCHING` with an expired lease (the worker crashed) and recipients in `DELIVERY_UNKNOWN`.

1. If `mta_queue_messages` holds a row for the recipient, Postfix logged `from=<VERP>` for it, so it **was** queued. The recipient moves to `MTA_ACCEPTED`.
2. Otherwise the worker reads the `postfix-log` checkpoint. If the reconciler's heartbeat is less than 60 seconds old **and** its watermark is more than `RECONCILE_GRACE_SECONDS` (default 60) past the moment of uncertainty, Postfix never queued the message, and re-dispatch is safe: the recipient moves to `RETRYING`.
3. Otherwise it waits. If the reconciler isn't running, recipients stay in `DELIVERY_UNKNOWN`. That's truthful, and they are not retried blindly.

The VERP envelope encodes the recipient ID, so the log line identifies the recipient even when the worker never saw Postfix's `250`.

## Postfix retries

The defaults are `minimal_backoff_time=300s`, `maximal_backoff_time=4000s` and `maximal_queue_lifetime=2d`. Each `status=deferred` log line becomes a `DEFERRED` transition with `retry_owner: "mta"` in the event data. When Postfix gives up (`status=expired`, or the queue-level `status=expired, returned to sender`), the recipient moves to `FAILED` with `bounce_class=retry_expired`.

## Delivery guarantee

Delivery is at least once, with the duplicate risk confined to one narrow window: Postfix queued the message, the reply was lost, and the log line did not reach the reconciler within the grace period. The platform never claims exactly-once delivery.

## Verification

Covered by `services/mail-worker/src/mta.test.ts` (classification and backoff), the "greylisting" case in `tests/integration/delivery.test.ts` (exactly one `email.mta_accepted`; the retries were Postfix's), and the state-machine tests in `packages/mail-protocol`.
