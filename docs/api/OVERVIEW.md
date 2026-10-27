# API overview

The MAIL_PLATFORM REST API lets your application send email through the platform's own SMTP infrastructure, manage sending domains and credentials, and observe delivery outcomes.

## Base URL

| Environment | Base URL |
| --- | --- |
| Local development | `http://localhost:3000` |
| Production | Deployment-specific (the operator publishes it, e.g. `https://api.<platform-domain>`) |

All public endpoints are versioned under `/v1`. Dashboard session endpoints live under `/auth` and are not intended for server-to-server use.

## Conventions

- **JSON only.** Send `Content-Type: application/json`; responses are JSON.
- **snake_case** field names on the wire.
- **Timestamps** are ISO 8601 strings in UTC (`2026-10-21T11:13:52.000Z`).
- **IDs** are UUIDs.
- **Unknown fields are rejected.** Request bodies are validated strictly; an unexpected property returns `422 validation_error`.
- **Request IDs.** Every response carries `x-request-id` (e.g. `req_3f1c…`). Error bodies repeat it as `request_id`. Include it when contacting support.
- **Caching.** Responses are sent with `cache-control: no-store`.

## Authentication

```http
Authorization: Bearer mp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

See [AUTHENTICATION.md](AUTHENTICATION.md) for key scopes and dashboard sessions.

## Endpoint map

| Area | Endpoints | Reference |
| --- | --- | --- |
| Emails | `POST /v1/emails`, `POST /v1/emails/batch`, `GET /v1/emails`, `GET /v1/emails/{id}`, `POST /v1/emails/{id}/cancel` | [EMAILS.md](EMAILS.md) |
| Events | `GET /v1/events` | [EMAILS.md](EMAILS.md#event-log) |
| Domains | `POST/GET /v1/domains`, `GET/DELETE /v1/domains/{id}`, `POST /v1/domains/{id}/verify` | [DOMAINS.md](DOMAINS.md) |
| API keys | `POST/GET /v1/api-keys`, `DELETE /v1/api-keys/{id}` | [API-KEYS.md](API-KEYS.md) |
| SMTP credentials | `POST/GET /v1/smtp-credentials`, `DELETE /v1/smtp-credentials/{id}` | [SMTP-CREDENTIALS.md](SMTP-CREDENTIALS.md) |
| Webhooks | `POST/GET /v1/webhooks`, `PATCH/DELETE /v1/webhooks/{id}`, `POST /v1/webhooks/{id}/rotate-secret`, `GET /v1/webhooks/{id}/deliveries` | [WEBHOOKS.md](WEBHOOKS.md) |
| Suppressions | `GET/POST /v1/suppressions`, `DELETE /v1/suppressions/{id}` | [SUPPRESSIONS.md](SUPPRESSIONS.md) |
| Analytics | `GET /v1/overview` | below |

Health endpoints (`/healthz`, `/readyz`) are for infrastructure probes and are not part of the public contract.

## What a successful send means

`POST /v1/emails` returns **`202 Accepted`**. That means the email is durably stored and queued for delivery, not that it has been delivered. Delivery progress is reported per recipient: hand-off to the platform MTA, then acceptance or rejection by the recipient's mail server. **Remote acceptance is not inbox placement**, and the platform never claims it is. See [recipient states](EMAILS.md#recipient-states).

## Pagination

List endpoints that can grow without bound use keyset (cursor) pagination:

```
GET /v1/emails?limit=25
→ { "data": [...], "next_cursor": "eyJ0Ijoi…" }

GET /v1/emails?limit=25&cursor=eyJ0Ijoi…
```

- `limit`: 1–100, default 20.
- `next_cursor` is `null` on the last page.
- Treat cursors as opaque; a malformed cursor returns `422 validation_error`.

Paginated: `GET /v1/emails`, `GET /v1/events`, `GET /v1/suppressions`, `GET /v1/webhooks/{id}/deliveries`. Domains, API keys, SMTP credentials and webhook endpoints are returned in full (`{ "data": [...] }`).

## Overview analytics

`GET /v1/overview` (permission `analytics:read`) returns figures computed from stored delivery records for the last 24 hours:

```json
{
  "window_hours": 24,
  "recipients_by_state": { "REMOTE_ACCEPTED": 41, "BOUNCED": 2 },
  "verified_domains": 1,
  "total_domains": 2,
  "suppressions": 3,
  "daily_limit": 100,
  "used_last_24h": 43
}
```

`recipients_by_state` covers the caller's project; `suppressions`, `daily_limit` and `used_last_24h` are organization-wide.

## Related

- [Errors](ERRORS.md) · [Rate limits](RATE-LIMITS.md) · [Idempotency](IDEMPOTENCY.md) · [OpenAPI](OPENAPI.md)
- [Quickstart](../developer-guides/QUICKSTART.md)
