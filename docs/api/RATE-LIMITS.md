# Rate limits and sending quotas

Three independent controls apply.

## 1. Request rate (per credential)

Every authenticated request counts against a per-second budget for its credential: each API key separately, and each dashboard user separately.

- Default: **10 requests per second** (operator setting `RATE_LIMIT_PER_SECOND`).
- Every authenticated response includes:

| Header | Meaning |
| --- | --- |
| `x-ratelimit-limit` | Requests allowed per second |
| `x-ratelimit-remaining` | Requests left in the current second |

- When exceeded: `429 rate_limited` with `retry-after: 1`.

The counter is kept in Redis. If Redis is unavailable, the API fails open for this limit only; the recipient quotas below are still enforced in the database.

To send many emails, prefer [`POST /v1/emails/batch`](EMAILS.md#send-a-batch) (up to 100 emails per request) over many single requests.

## 2. Recipient quotas (per organization)

Quotas count **recipients** (unique to/cc/bcc addresses per email), not requests, across every API key, SMTP credential and dashboard user in the organization.

| Window | Limit field | Error when exceeded |
| --- | --- | --- |
| Rolling 24 hours | `daily_recipient_limit` | `429 quota_exceeded` |
| Rolling 1 minute | `per_minute_recipient_limit` | `429 rate_limited` |

Quotas are checked atomically when an email is accepted: concurrent requests from one organization are serialized, so the limits cannot be overrun by parallel calls. A batch is accepted or refused as a whole.

Suppressed recipients still count, because they are accepted and recorded with the state `SUPPRESSED`.

### Sandbox tier

New organizations start on the **sandbox** tier:

| Limit | Sandbox default |
| --- | --- |
| Recipients per 24 hours | 100 |
| Recipients per minute | 10 |

The platform operator raises limits after reviewing the account. Your current daily limit and usage are shown by `GET /v1/overview` (`daily_limit`, `used_last_24h`) and in the dashboard.

## 3. Endpoint-specific throttles

| Action | Limit | Error |
| --- | --- | --- |
| `POST /v1/domains/{id}/verify` | One check per domain per 10 seconds | `429 rate_limited` |
| `POST /auth/login` | 20 attempts per minute per client IP; account locked for 15 minutes after 10 failures, and re-locked on each further failure until a successful login | `429 rate_limited` |
| `POST /auth/signup` | 5 per hour per client IP | `429 rate_limited` |
| SMTP AUTH | 10 failed attempts per client IP per 10 minutes | SMTP `454 4.7.0` |

## Related

- [Errors](ERRORS.md) · [SMTP integration](../developer-guides/SMTP-INTEGRATION.md)
