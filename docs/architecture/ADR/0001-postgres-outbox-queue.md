# ADR 0001: PostgreSQL is the delivery queue (transactional outbox)

**Status:** Accepted

## Context

A `202` from `POST /v1/emails` must mean the email will be processed even if any process crashes the next instant. The spec suggests BullMQ (Redis) for orchestration. A Redis queue alongside PostgreSQL creates a dual write: the email row and the queue job are committed separately, so one can exist without the other. Customer-visible status, retry scheduling and suppression checks would also live in two stores that can disagree.

## Decision

Recipient rows in `email_recipients` are the queue. Admission inserts them in the same transaction as the email, its events and its webhook deliveries. Workers claim with `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)`, recording `lease_owner` and `lease_expires_at`, and extend leases while working. Webhook deliveries and domain re-checks use the same pattern. Redis is used only for rate limiting and throttles. See [QUEUE-DESIGN.md](../QUEUE-DESIGN.md).

## Consequences

- Admission is atomic: no dual write, no orphan jobs, no lost jobs.
- Queue state is the status the customer sees.
- Throughput is bounded by PostgreSQL write capacity. Partial indexes keep claims cheap, but very high volumes will need partitioning of `email_recipients` and tuning of autovacuum (not yet done).
- Polling adds up to `POLL_INTERVAL_MS` (500 ms default) of dispatch latency when idle. `LISTEN/NOTIFY` could remove it later.
- Redis outages degrade only rate limiting (fail open), not delivery.

## Alternatives considered

- **BullMQ on Redis.** Rejected for the delivery path because of the dual write described above. It remains an option for future campaign orchestration that does not need atomic coupling to admission.
- **Outbox table plus relay into a broker (Kafka/RabbitMQ).** Correct, but it adds a component and a relay process without a current throughput need.
- **Hand straight to Postfix during the API request.** Couples API latency and availability to the MTA and loses scheduling, quotas and cancellation.
