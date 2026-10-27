# Architecture decision records

Each ADR records one significant decision: context, decision, consequences and the alternatives that were rejected. ADRs are immutable once accepted; a change of direction is a new ADR that supersedes the old one.

| # | Title | Status |
| --- | --- | --- |
| [0001](0001-postgres-outbox-queue.md) | PostgreSQL is the delivery queue (transactional outbox) | Accepted |
| [0002](0002-postfix-owns-transport-retries.md) | Postfix owns transport retries after hand-off | Accepted |
| [0003](0003-verp-hmac-return-path.md) | Per-recipient VERP return path authenticated with an HMAC | Accepted |
| [0004](0004-row-level-security.md) | Row-level security as defence in depth for tenant isolation | Accepted |
| [0005](0005-dkim-signing-in-application.md) | DKIM signing in the application, not OpenDKIM | Accepted |
| [0006](0006-postfix-log-reconciliation.md) | Delivery outcomes come from the Postfix log | Accepted |

Template: Status · Context · Decision · Consequences · Alternatives considered.
