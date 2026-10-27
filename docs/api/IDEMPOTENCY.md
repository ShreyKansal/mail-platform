# Idempotency

Networks fail. If your request to send an email times out, you cannot tell whether the platform accepted it. An idempotency key lets you retry safely: a retry with the same key returns the original result instead of sending a second email.

Supported on `POST /v1/emails` and `POST /v1/emails/batch`.

## Usage

Send a unique key per logical email, for example your own order or notification ID:

```bash
curl -X POST http://localhost:3000/v1/emails \
  -H "Authorization: Bearer $MP_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-1042-receipt" \
  -d '{"from":"billing@example.com","to":"customer@example.org","subject":"Your receipt","text":"Thanks!"}'
```

For `POST /v1/emails`, you may instead put the key in the body as `"idempotency_key"`. If both are present, the header wins. For `POST /v1/emails/batch`, only the header is supported, and the key covers the whole batch.

## Rules

| Situation | Result |
| --- | --- |
| First request with a key | Processed normally, `202`. |
| Same key, **identical** body, after the first request completed | `202` with the **original** `id`(s), plus the response header `idempotent-replayed: true`. Nothing is sent again. |
| Same key, **different** body | `409 idempotency_conflict`. |
| Same key while the first request is still being processed | The second request waits for the first to finish, then replays its result. If the first request failed and was rolled back, the second request is processed as new. |
| First request failed validation or quota checks | Nothing is stored for the key. You can fix the request and reuse the key. |

- Keys are 1–256 characters and are scoped to your **organization**. Two different API keys in the same organization share the key space.
- Keys expire **24 hours** after first use. After that, the same key is treated as new.
- "Identical body" means the same JSON content after validation. Change any field (including `idempotency_key` itself in the body) and it is a different request.

## Delivery guarantees

Idempotency protects **acceptance**. Downstream, delivery to the internet is *at least once* with controlled duplicate risk: the platform never blindly re-sends after an ambiguous hand-off, and instead reconciles against the MTA log (see the `DELIVERY_UNKNOWN` state in [EMAILS.md](EMAILS.md#recipient-states)). No email system can promise exactly-once delivery across the internet, and this one does not claim to.

## Related

- [Emails](EMAILS.md) · [Errors](ERRORS.md)
