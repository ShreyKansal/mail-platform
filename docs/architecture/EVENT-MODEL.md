# Event model

`email_events` is the customer-visible history of every email: the email detail timeline, `GET /v1/events` and webhooks are all built from it. Events are written only by `recordEmailEvent` (`packages/core/src/events.ts`). Most go through `transitionRecipient`, and admission writes the rest.

## Idempotency

Every producer supplies a deterministic `dedupe_key`; replays of the same cause are no-ops:

| Producer | Dedupe key |
| --- | --- |
| Admission | `<emailId>:accepted`, `<emailId>:scheduled`, `<recipientId>:SUPPRESSED:admission` |
| `transitionRecipient` | `<recipientId>:<TARGET_STATE>:<cause>` |
| Dispatcher hand-off | cause `submit:<attempt>` |
| Delivery reconciler | cause `<fileId>:<byte offset of the log line>` |
| Bounce processor | cause `dsn:<sha256 of the raw DSN, truncated>` |
| Uncertainty sweep | cause `reconcile:<queueId>`, `lease-expired:<time>`, `unknown-resolved:<time>` |
| Cancel | cause `api-cancel` |

The event id itself is `deterministicUuid('email-event:' + dedupe_key)`. This is a version-8-style UUID derived from SHA-256, so the same logical event always has the same id. The insert uses `ON CONFLICT (dedupe_key) DO NOTHING`. If nothing was inserted, nothing downstream happens.

Repeated `DEFERRED` events (Postfix retrying) each have a distinct log-line cause, so each deferral is recorded once.

## Webhook fan-out (transactional outbox)

When `recordEmailEvent` inserts a new event, `enqueueWebhooks` runs **in the same transaction**. It inserts one `webhook_deliveries` row for every enabled endpoint of the email's project that subscribes to the event type (`ON CONFLICT (endpoint_id, event_id) DO NOTHING`). If the transaction rolls back, neither the event nor its deliveries exist. If it commits, delivery is guaranteed to be attempted. The [webhook queue](QUEUE-DESIGN.md#webhook-queue-webhook_deliveries) handles sending.

## Payload

Stored in `webhook_deliveries.payload` and sent as the request body:

```json
{
  "id": "5f0c…",
  "type": "email.bounced",
  "created_at": "2026-10-21T11:00:46.000Z",
  "data": {
    "email_id": "…",
    "recipient_id": "…",
    "to": "user@example.org",
    "previous_state": "MTA_ACCEPTED",
    "state": "BOUNCED",
    "classification": "mailbox_unavailable",
    "hard": true,
    "smtp": { "code": 550, "enhanced_status": "5.1.1", "response": "550 5.1.1 …", "remote_host": "mx…[203.0.113.5]:25", "in_reply_to": "RCPT TO" }
  }
}
```

`data` always contains `email_id`, contains `recipient_id` for recipient-level events, and otherwise holds the transition's `eventData`. Message bodies are never included.

Headers (Standard Webhooks scheme, `core/src/webhook-signature.ts`):

| Header | Value |
| --- | --- |
| `webhook-id` | event id; identical on every retry |
| `webhook-timestamp` | Unix seconds at send time |
| `webhook-signature` | `v1,<base64 HMAC-SHA256(key, "<id>.<timestamp>.<body>")>`, where the key is the base64-decoded part of `whsec_…` |
| `webhook-attempt` | attempt number |

`verifyWebhook` rejects timestamps more than 5 minutes off and accepts any of several space-separated signatures, which supports secret rotation.

## Event types

Email events: `email.accepted`, `email.scheduled`, `email.suppressed`, `email.mta_accepted`, `email.deferred`, `email.remote_accepted`, `email.bounced`, `email.failed`, `email.cancelled`, `email.delivery_unknown` (mapping to states: [MESSAGE-LIFECYCLE.md](MESSAGE-LIFECYCLE.md#events-emitted)).

Domain events: `domain.verified`, `domain.verification_lost`. These are emitted by `applyDomainChecks` when a domain enters or leaves `verified`. They are **webhook-only**: `email_events` requires an `email_id`, so domain events are enqueued directly with `deterministicUuid('<type>:<domainId>:<check time>')` and do not appear in `GET /v1/events`. A matching row is written to `audit_logs`.

## Not yet implemented

Engagement events (opens, clicks), complaint events and inbound events. Endpoints are not auto-disabled after repeated dead-lettered deliveries. There is no replay or "resend event" API.
