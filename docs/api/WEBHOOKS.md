# Webhooks

Webhooks push delivery events to your HTTPS endpoint as they happen, signed so you can verify they came from the platform.

| Method | Path | Permission |
| --- | --- | --- |
| `POST` | `/v1/webhooks` | `webhooks:manage` |
| `GET` | `/v1/webhooks` | `webhooks:read` |
| `PATCH` | `/v1/webhooks/{id}` | `webhooks:manage` |
| `POST` | `/v1/webhooks/{id}/rotate-secret` | `webhooks:manage` |
| `DELETE` | `/v1/webhooks/{id}` | `webhooks:manage` |
| `GET` | `/v1/webhooks/{id}/deliveries` | `webhooks:read` |

## Create an endpoint

```bash
curl -X POST http://localhost:3000/v1/webhooks \
  -H "Authorization: Bearer $MP_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhooks/mail",
    "event_types": ["email.remote_accepted", "email.bounced", "email.failed"],
    "description": "production"
  }'
```

**Response `201`**: the endpoint, plus `"secret": "whsec_…"`. **The secret is shown only once** and is stored encrypted.

| Field | Rules |
| --- | --- |
| `url` | Absolute URL, ≤ 2048 characters. See [URL rules](#url-rules-ssrf-protection). |
| `event_types` | One or more values from [Events](#events). Duplicates are removed. |
| `description` | Optional, ≤ 500 characters. |

Each project may have up to 20 endpoints (`409 conflict` beyond that).

## Manage

- `GET /v1/webhooks` lists the project's endpoints (secrets are never included).
- `PATCH /v1/webhooks/{id}` with any of `url`, `event_types`, `description` (or `null`), `enabled`. Disabling records the reason "disabled by user". Deliveries already queued for a disabled endpoint are dead-lettered rather than sent.
- `POST /v1/webhooks/{id}/rotate-secret` returns a new `secret` (shown once). For the next **24 hours**, every attempt, including retries, is signed with both the new and the previous secret: `webhook-signature: v1,<new> v1,<previous>`. Receivers still using the old secret keep verifying while you deploy the new one. After 24 hours only the new signature is sent. Rotating again during the window replaces the previous secret with the one being rotated out.
- `DELETE /v1/webhooks/{id}` → `{ "id": "…", "deleted": true }`. Pending deliveries are removed with it.

## Events

| Type | Sent when |
| --- | --- |
| `email.accepted` | An email was durably accepted (once per email, not per recipient). |
| `email.scheduled` | An accepted email has a future `scheduled_at`. |
| `email.suppressed` | A recipient was skipped because it is on the suppression list. |
| `email.mta_accepted` | The platform MTA queued the message for a recipient. |
| `email.deferred` | The recipient's server returned a temporary failure; the MTA will retry. |
| `email.remote_accepted` | The recipient's server accepted the message (SMTP 2xx). **Not proof of inbox placement.** |
| `email.bounced` | Permanent rejection or a later bounce report. |
| `email.failed` | The platform gave up on the recipient (see [FAILED](EMAILS.md#recipient-states)). |
| `email.cancelled` | A recipient was cancelled before hand-off. |
| `email.delivery_unknown` | The hand-off outcome is temporarily unknown and is being reconciled. |
| `domain.verified` | A domain became verified (sending enabled). |
| `domain.verification_lost` | A verified domain lost a required record (sending disabled). |

## Request format

```http
POST /webhooks/mail HTTP/1.1
Content-Type: application/json
User-Agent: MAIL_PLATFORM-Webhooks/1.0
webhook-id: 3b9e6f5e-8c1d-8f2a-9c43-1d2e3f4a5b6c
webhook-timestamp: 1792581232
webhook-signature: v1,K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN/H/pI4=
webhook-attempt: 1
```

```json
{
  "id": "3b9e6f5e-8c1d-8f2a-9c43-1d2e3f4a5b6c",
  "type": "email.bounced",
  "created_at": "2026-10-21T11:13:52.000Z",
  "data": {
    "email_id": "6d5b5098-d0ba-4b95-9497-63761b173c30",
    "recipient_id": "a1f0…",
    "to": "unknown@example.org",
    "previous_state": "MTA_ACCEPTED",
    "state": "BOUNCED",
    "classification": "mailbox_unavailable",
    "hard": true,
    "smtp": {
      "code": 550,
      "enhanced_status": "5.1.1",
      "response": "550 5.1.1 The email account that you tried to reach does not exist",
      "remote_host": "mx.example.org[203.0.113.25]:25",
      "in_reply_to": "RCPT TO"
    }
  }
}
```

`data` by event family:

- **Recipient events** (`mta_accepted`, `deferred`, `remote_accepted`, `bounced`, `failed`, `cancelled`, `delivery_unknown`, `suppressed`): `email_id`, `recipient_id`, `to`, `state`, `previous_state` (where a transition happened), plus context such as `smtp`, `classification`, `mta_queue_id`, `reason` or `retry_owner`.
- **`email.accepted`**: `email_id`, `from`, `subject`, `recipients` (count), `source` (`api` or `smtp`).
- **`email.scheduled`**: `email_id`, `scheduled_at`.
- **Domain events**: `domain_id`, `name`, `status`, `sending_enabled`.

Treat unknown fields as additive; new fields may appear.

## Signatures

Signatures follow the Standard Webhooks scheme:

```
signed_content = "{webhook-id}.{webhook-timestamp}.{raw request body}"
key            = base64-decode(secret without the "whsec_" prefix)
signature      = base64(HMAC-SHA256(key, signed_content))
header         = "v1," + signature
```

Verify against the **raw body bytes**, before any JSON parsing. Reject timestamps more than 5 minutes from your clock to defeat replays. Compare signatures in constant time. The header may in future contain several space-separated signatures; accept the request if any matches. Complete Node.js and Python code is in [Webhook verification](../developer-guides/WEBHOOK-VERIFICATION.md).

## Delivery semantics

- **Success** means any 2xx response within **10 seconds**. Respond quickly and process asynchronously.
- **Redirects are not followed**; a 3xx response counts as a failure.
- **At-least-once.** An event can arrive more than once, for example when your server succeeded but the response was lost. `webhook-id` is the same on every attempt for a given event and endpoint; use it to de-duplicate.
- **No ordering guarantee.** Use `created_at` and the recipient `state` rather than arrival order.
- **Retries.** After a failed attempt, retries happen at 30 s, 2 min, 10 min, 30 min, 1 h, 3 h, 6 h and 12 h. That is 9 attempts over about 23 hours, plus a few seconds of dispatcher polling delay each time. After the last failure the delivery is **dead-lettered** (`status: dead`) and not retried again.
- `webhook-attempt` carries the attempt number (1-based).

### Delivery log

`GET /v1/webhooks/{id}/deliveries` (paginated) shows each delivery: `event_id`, `event_type`, `status` (`pending`, `delivering`, `retrying`, `succeeded`, `dead`), `attempts`, `last_status_code`, `last_error`, `next_attempt_at`, `created_at`.

## URL rules (SSRF protection)

In production the platform only calls endpoints that:

- use `https://`;
- contain no `user:password@` credentials;
- use port 443, 80 or 8443 (or no explicit port);
- resolve **only** to public unicast addresses. Loopback, private (RFC 1918), link-local (including cloud metadata `169.254.169.254`), carrier-grade NAT, multicast and reserved ranges are refused, for IPv4, IPv6 and IPv4-mapped IPv6.

URLs are checked when you save them (`422 validation_error`) and again on every delivery. At delivery time the platform connects to exactly the address it validated, so DNS rebinding cannot redirect the request inside the network. In local development, the operator may relax the https and private-network rules; production refuses those settings.

## Related

- [Webhook verification guide](../developer-guides/WEBHOOK-VERIFICATION.md) · [Emails: recipient states](EMAILS.md#recipient-states)
