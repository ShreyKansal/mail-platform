# ADR 0002: Postfix owns transport retries after hand-off

**Status:** Accepted

## Context

Both the application and Postfix can retry. If both retry the same message independently, a temporary failure can turn into several deliveries. The spec requires Postfix to own MTA behaviour and forbids duplicate retry ownership.

## Decision

Ownership switches at a single, observable moment: Postfix's `250 2.0.0 Ok: queued as <id>` reply on the internal port 10025.

- **Before:** the application retries hand-off failures only when the message was provably not queued (Postfix replied 4xx, or the failure happened before DATA). The recipient goes to `RETRYING` with bounded exponential backoff and jitter, and to `FAILED` after `MAX_SUBMISSION_ATTEMPTS`. A 5xx means `FAILED`. Failures after DATA started with no reply mean `DELIVERY_UNKNOWN`, which is resolved by reconciliation, never by a blind retry.
- **After:** the recipient is `MTA_ACCEPTED`. Postfix retries remote failures using its configured backoff and `maximal_queue_lifetime`. The state machine has no edge from `MTA_ACCEPTED`, `DEFERRED` or `REMOTE_ACCEPTED` back to `DISPATCHING` or `RETRYING`, and a unit test asserts this.

Each recipient is submitted in its own SMTP transaction, so each has its own Postfix queue id and its own retry schedule.

## Consequences

- Platform-side duplicates are limited to the narrow uncertain window, and that window is reconciled against evidence ([ADR 0006](0006-postfix-log-reconciliation.md)).
- Remote retry policy is Postfix configuration (`infrastructure/postfix/main.cf`, overridable in tests), not application code.
- Per-provider throttling must be expressed as Postfix transports and concurrency limits. This is not yet configured beyond defaults.

## Alternatives considered

- **Application-driven SMTP to MX (no Postfix).** Rejected by the spec. It also means re-implementing queueing, TLS policy and DNS handling that Postfix already does well.
- **Postfix with application-side remote retries** (Postfix configured never to retry). Loses Postfix's per-destination queue scheduling and multiplies connections.
