# Emails

| Method | Path | Permission |
| --- | --- | --- |
| `POST` | `/v1/emails` | `emails:send` |
| `POST` | `/v1/emails/batch` | `emails:send` |
| `GET` | `/v1/emails` | `emails:read` |
| `GET` | `/v1/emails/{id}` | `emails:read` (message bodies also need `emails:read_content`) |
| `POST` | `/v1/emails/{id}/cancel` | `emails:send` |
| `GET` | `/v1/events` | `emails:read` |

## Send an email

```bash
curl -X POST http://localhost:3000/v1/emails \
  -H "Authorization: Bearer $MP_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: welcome-user-8812" \
  -d '{
    "from": "Acme <noreply@notify.example.com>",
    "to": ["ada@example.org"],
    "reply_to": "support@example.com",
    "subject": "Welcome to Acme",
    "html": "<p>Hello Ada</p>",
    "text": "Hello Ada",
    "tags": [{ "name": "category", "value": "welcome" }],
    "metadata": { "user_id": "8812" }
  }'
```

```js
const res = await fetch('http://localhost:3000/v1/emails', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.MP_API_KEY}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': 'welcome-user-8812',
  },
  body: JSON.stringify({
    from: 'Acme <noreply@notify.example.com>',
    to: ['ada@example.org'],
    subject: 'Welcome to Acme',
    html: '<p>Hello Ada</p>',
    text: 'Hello Ada',
  }),
});
if (res.status !== 202) throw new Error(JSON.stringify(await res.json()));
const { id } = await res.json();
```

**Response `202 Accepted`**

```json
{ "id": "6d5b5098-d0ba-4b95-9497-63761b173c30" }
```

`202` means the email and all its recipients are durably stored and queued. Delivery happens asynchronously; follow it with `GET /v1/emails/{id}` or [webhooks](WEBHOOKS.md).

### Fields

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `from` | string | yes | `addr@domain` or `Name <addr@domain>` (`"Quoted, Name" <addr>` also accepted). The domain must be a **verified, sending-enabled domain in the key's project**, or a subdomain of one. |
| `to` | string or string[] | yes | 1–50 addresses. |
| `cc` | string or string[] | no | |
| `bcc` | string or string[] | no | Never appears in message headers. |
| `reply_to` | string or string[] | no | Any valid address. |
| `subject` | string | yes | 1–998 characters; Unicode allowed; no line breaks or control characters. |
| `html` | string | one of html/text | Up to 2,097,152 characters. |
| `text` | string | one of html/text | Up to 2,097,152 characters. |
| `attachments` | object[] | no | Up to 20; see [Attachments](../developer-guides/ATTACHMENTS.md). |
| `headers` | object | no | Custom headers; see [Custom headers](#custom-headers). |
| `tags` | `{name, value}[]` | no | Up to 20. Names and values: 1–256 of `A–Z a–z 0–9 _ -`. |
| `metadata` | object | no | Up to 20 string keys (≤ 64 chars) with string values (≤ 512 chars). Returned on reads; never added to the message. |
| `scheduled_at` | string | no | ISO 8601 with offset. At most 30 days ahead. A time in the past sends immediately. See [Scheduled emails](../developer-guides/SCHEDULED-EMAILS.md). |
| `idempotency_key` | string | no | 1–256 characters. Alternative to the `Idempotency-Key` header. |

Address rules:

- Recipients are de-duplicated case-insensitively across `to`, `cc` and `bcc`; the first occurrence wins. The total after de-duplication must be **≤ 50**.
- Domains may be internationalized; they are converted to ASCII (A-label) form.
- Quoted local parts and non-ASCII local parts (`josé@…`) are not accepted.
- Any address containing CR, LF or another control character is rejected, which blocks header injection.

Recipients on your organization's [suppression list](SUPPRESSIONS.md) are accepted but recorded as `SUPPRESSED` and never sent.

### Custom headers

Allowed: any `X-…` header, plus `List-Unsubscribe`, `List-Unsubscribe-Post`, `List-Id`, `In-Reply-To`, `References`, `Auto-Submitted`, `Precedence`, `Keywords`, `Comments`.

Rejected (`422`): headers the platform owns, which are `From`, `Sender`, `To`, `Cc`, `Bcc`, `Reply-To`, `Subject`, `Date`, `Message-ID`, `Return-Path`, `Received`, `DKIM-Signature`, ARC and `Authentication-Results` headers, `Received-SPF`, `MIME-Version`, `Content-*`, `Feedback-ID`, `X-MP-Email-Id` and `Resent-*`. Also rejected: duplicate names (case-insensitive), names that are not 1–64 letters, digits and hyphens, values containing line breaks or control characters, and values over 998 characters.

### What the platform adds

Every message is:

- DKIM-signed with `d=<your domain>` using the domain's active selector (2048-bit RSA).
- Given `Message-ID: <{email id}@{from domain}>`.
- Given a unique per-recipient envelope sender (VERP), e.g. `b+…@bounce.example.com`, so bounces are matched precisely. The visible `From` is never changed.
- Given `Feedback-ID` and `X-MP-Email-Id` headers.

### Errors specific to sending

| Code | Cause |
| --- | --- |
| `422 validation_error` | Any field rule above. |
| `403 domain_not_verified` | `from` domain is not verified for this project. |
| `403 sender_not_authorized` | The key is restricted to another domain. |
| `403 account_suspended` | Organization suspended or pending review. |
| `429 quota_exceeded` / `429 rate_limited` | Organization recipient quotas ([RATE-LIMITS.md](RATE-LIMITS.md)). |
| `409 idempotency_conflict` | Key reused with a different body. |
| `413 payload_too_large` | Request body over 16 MB. |

## Send a batch

`POST /v1/emails/batch` accepts an array of 1–100 email objects (the same fields as above). The batch is **all-or-nothing**: if any email is invalid or the batch exceeds a quota, none is accepted, and error `details` paths are prefixed with the item index (`[3].from`). The body limit is 32 MB. Idempotency is supported via the `Idempotency-Key` header only.

```bash
curl -X POST http://localhost:3000/v1/emails/batch \
  -H "Authorization: Bearer $MP_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: digest-2026-10-21" \
  -d '[
    {"from":"news@example.com","to":"a@example.org","subject":"Digest","text":"…"},
    {"from":"news@example.com","to":"b@example.org","subject":"Digest","text":"…"}
  ]'
```

**Response `202`**: `{ "data": [ { "id": "…" }, { "id": "…" } ] }`, in request order.

## List emails

```bash
curl "http://localhost:3000/v1/emails?limit=25&status=BOUNCED" \
  -H "Authorization: Bearer $MP_API_KEY"
```

Query parameters: `limit` (1–100, default 20), `cursor`, `status` (any [recipient state](#recipient-states); matches emails with **at least one** recipient in that state). Results are newest first.

```json
{
  "data": [
    {
      "id": "6d5b5098-d0ba-4b95-9497-63761b173c30",
      "from": "Acme <noreply@notify.example.com>",
      "subject": "Welcome to Acme",
      "to": ["ada@example.org"],
      "status": "REMOTE_ACCEPTED",
      "source": "api",
      "tags": [{ "name": "category", "value": "welcome" }],
      "scheduled_at": null,
      "created_at": "2026-10-21T11:13:50.120Z"
    }
  ],
  "next_cursor": null
}
```

`status` is the shared state of all recipients, or `PARTIAL` when they differ. `to` lists only `to` recipients (cc and bcc are omitted from summaries). `source` is `api` or `smtp`.

## Get an email

```bash
curl http://localhost:3000/v1/emails/6d5b5098-d0ba-4b95-9497-63761b173c30 \
  -H "Authorization: Bearer $MP_API_KEY"
```

Returns the summary fields plus:

| Field | Description |
| --- | --- |
| `message_id` | RFC 5322 Message-ID (without angle brackets). |
| `reply_to` | Reply-To addresses. |
| `metadata` | Your metadata. |
| `recipients[]` | `id`, `kind` (`to`/`cc`/`bcc`), `address`, `state`, `state_changed_at`, `last_smtp_code`, `last_enhanced_status`, `last_response` (sanitized, ≤ 500 chars), `bounce_class`. |
| `events[]` | Chronological events: `id`, `type`, `recipient_id`, `data`, `occurred_at`. |
| `content` | `{ html, text }` when the caller has `emails:read_content`; otherwise `null`. |

Event times are monotonic per recipient. The MTA log has one-second resolution, so an event may carry the previous event's timestamp rather than an earlier one.

## Cancel

`POST /v1/emails/{id}/cancel` cancels every recipient that has **not yet been handed to the MTA** (states `QUEUED`, `SCHEDULED`, `RETRYING`).

```json
{ "id": "…", "cancelled": 1, "not_cancellable": 2 }
```

If no recipient can be cancelled, the response is `409 invalid_state`. Once the platform MTA has accepted a message, it cannot be recalled.

## Recipient states

Delivery is tracked **per recipient**.

| State | Terminal? | Meaning |
| --- | --- | --- |
| `SCHEDULED` | no | Waiting for `scheduled_at`. |
| `QUEUED` | no | Accepted and waiting for dispatch. |
| `DISPATCHING` | no | Being handed to the platform MTA. |
| `RETRYING` | no | Hand-off to the platform MTA failed temporarily; the platform will retry with backoff. |
| `MTA_ACCEPTED` | no | The platform's own MTA (Postfix) has queued the message. From here, the MTA alone owns retries. |
| `DEFERRED` | no | The recipient's server returned a temporary failure (greylisting, a full mailbox, a timeout). The MTA keeps retrying, by default for up to 2 days. |
| `DELIVERY_UNKNOWN` | no | The hand-off was interrupted after the message data was sent, so it is unknown whether the MTA queued it. The platform checks the MTA log rather than blindly re-sending, then moves the recipient to a definite state. |
| `REMOTE_ACCEPTED` | yes\* | **The recipient's mail server accepted the message over SMTP (2xx).** This is not confirmation of inbox placement; the receiving system may still filter it to spam or quarantine it. |
| `BOUNCED` | yes | The recipient's server permanently rejected the message (5xx), or sent a bounce report later. See `bounce_class`. |
| `FAILED` | yes | The platform gave up: retries expired in the MTA, the MTA refused the message, the message could not be signed, the domain lost verification, or the organization cannot send. |
| `SUPPRESSED` | yes | Not sent, because the address is on your suppression list. |
| `CANCELLED` | yes | Cancelled before hand-off. |

\* `REMOTE_ACCEPTED` can still change to `BOUNCED` if the receiving system sends an asynchronous bounce later.

States `CREATED`, `VALIDATING`, `ACCEPTED` and `REJECTED` exist in the schema, but the API admits emails atomically and does not currently expose them. A request that fails validation is refused with an error; it is not stored as `REJECTED`.

### Bounce classes

| `bounce_class` | Typical SMTP status | Address suppressed? |
| --- | --- | --- |
| `mailbox_unavailable` | 5.1.1, 5.1.0, 5.1.6, 5.1.10, 5.2.1, or "user unknown" text | yes |
| `domain_invalid` | 5.1.2, 5.4.4, 5.4.1 | yes |
| `recipient_rejected` | 5.1.3 (suppressed); other unclassified 5xx (not suppressed) | for 5.1.3 only |
| `mailbox_full` | 4.2.2 / 5.2.2 | no |
| `content_rejected` | 5.6.x, 5.2.3 | no |
| `policy_rejected` | 5.7.x | no |
| `authentication_rejected` | 5.7.23, 5.7.25, 5.7.26, 5.7.27 (SPF/DKIM/DMARC/reverse-DNS failures) | no |
| `greylisted` | 4.7.1 "try again later" | no (temporary) |
| `temporary_network` | 4.4.x | no (temporary) |
| `tls_failure` | 4.7.4 / 4.7.5 | no (temporary) |
| `soft_bounce` | other 4xx | no (temporary) |
| `retry_expired` | The MTA stopped retrying after its queue lifetime | no |
| `mta_rejected` | The platform MTA refused the message | no |
| `platform_policy` | The platform refused to dispatch (suspension, lost domain verification, signing failure) | no |

## Event log

`GET /v1/events` lists recent email events across the project, newest first. Parameters: `limit`, `cursor`, and `type` (e.g. `email.bounced`). Each item has `id`, `email_id`, `type`, `recipient_id`, `data` and `occurred_at`. The same events are delivered to [webhooks](WEBHOOKS.md#events).

## Related

- [Idempotency](IDEMPOTENCY.md) · [Webhooks](WEBHOOKS.md) · [Suppressions](SUPPRESSIONS.md) · [Sending your first email](../developer-guides/SENDING-FIRST-EMAIL.md)
