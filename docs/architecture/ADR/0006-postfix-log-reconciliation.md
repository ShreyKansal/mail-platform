# ADR 0006: Delivery outcomes come from the Postfix log

**Status:** Accepted

## Context

After hand-off, only Postfix knows whether the remote MX accepted, deferred or rejected the message. The application needs those outcomes per recipient, durably and without duplicates. It also needs evidence for resolving hand-offs whose result was lost ([ADR 0002](0002-postfix-owns-transport-retries.md)).

## Decision

Postfix writes `maillog_file` (with `enable_long_queue_ids = yes`). A single `delivery-reconciler` process per log file tails it:

- `parsePostfixLine` extracts `qmgr … from=<…> (queue active)`, `… to=<…>, relay=…, dsn=…, status=sent|deferred|bounced|expired (…)`, queue-level `status=expired` and `removed` lines, including the remote reply ("host … said: 550 5.1.1 …").
- `from=<b+…>` lines are decoded with the VERP HMAC and stored in `mta_queue_messages (queue_id → recipient_id)`. Status lines are mapped through that table. Mail not sent by the platform (for example Postfix's own DSNs with `from=<>`) is ignored.
- Each chunk of up to 1 MB of complete lines is applied in **one transaction together with the new byte offset** in `worker_checkpoints`. The event cause is `<fileId>:<line offset>`.
- The checkpoint also records `heartbeat_at` and `watermark_at` (the newest processed log time, or "now" at end-of-file). The dispatcher uses these to prove a message was never queued.
- DSNs remain a second, independent source (bounce processor) and catch asynchronous bounces after acceptance. Both sources dedupe.

## Consequences

- Outcomes are exact per recipient, include the remote SMTP reply, and need no success DSNs from remote servers.
- Crash safety: offset and effects commit atomically. A rotated or truncated log restarts from 0, and re-applied lines are idempotent.
- One reconciler per Postfix node. Several nodes need distinct checkpoint names; the name is currently fixed (`postfix-log`), which limits this to one node.
- The parser depends on Postfix's log format (fixtures from Postfix 3.7.11 are in the unit tests). Upgrades must re-run them.
- Syslog timestamps have one-second resolution and no year. The year is inferred, and event times are clamped to be monotonic per recipient.

## Alternatives considered

- **Success DSNs (`NOTIFY=SUCCESS`).** Depend on remote DSN support and generate extra mail traffic.
- **Syslog or journald shipping to a collector.** Adds a pipeline whose delivery guarantees would also need reconciliation. Container log drivers make byte-offset checkpoints impractical.
- **Polling `postqueue -j`.** Shows only messages still queued, not final outcomes.
