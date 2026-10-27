# Errors

Every error response, from any endpoint, has the same shape:

```json
{
  "error": {
    "code": "validation_error",
    "message": "the email is invalid",
    "details": [
      { "path": "subject", "message": "subject must not contain line breaks or control characters" }
    ]
  },
  "request_id": "req_0c5e2a7d9f6b4b1c8a3e0f2d4c6b8a1e"
}
```

- `code` is stable and machine-readable. Branch on it, not on `message`.
- `message` is human-readable and may change.
- `details` is present when there is something field-level to report. `path` names the field using one syntax for schema checks and delivery checks alike: `to[0]`, `headers.X-Ok`, `attachments[1].filename`. Batch requests prefix the item index, e.g. `[2].from`.
- `request_id` matches the `x-request-id` response header.

## Error codes

| Code | HTTP | When it happens | What to do |
| --- | --- | --- | --- |
| `bad_request` | 400 | The request could not be parsed: malformed JSON, an unsupported `Content-Type`, or an empty body where one is required. | Fix the request encoding. |
| `validation_error` | 422 | The body, query or path parsed but failed validation: a malformed address, CRLF in a header or subject, a reserved header, a blocked attachment type, a missing `html`/`text`, an unknown field, an invalid cursor, and so on. | Fix the request using `details`. Do not retry unchanged. |
| `unauthorized` | 401 | No credentials, or an invalid, revoked or expired API key, or a wrong password at login. | Check the key. Do not retry with the same key. |
| `forbidden` | 403 | Authenticated but missing the required permission; dashboard-only endpoint called with a key; failed CSRF or Origin check; public sign-up closed. | Use a key or role with the needed permission. |
| `not_found` | 404 | The resource does not exist **or belongs to another organization or project**. The two cases are deliberately indistinguishable. Also returned for unknown routes. | Check the ID and which key you are using. |
| `conflict` | 409 | Duplicate resource (the same domain added twice); a domain already verified by another account; an idempotency key whose first request is still in progress; a webhook endpoint limit reached. | Read the message. For an idempotency key in progress, retry shortly. |
| `idempotency_conflict` | 409 | An `Idempotency-Key` was reused with a different request body. | Use a new key for a different request. |
| `invalid_state` | 409 | The operation is not possible in the resource's current state: cancelling an email whose recipients were already handed to the MTA, or verifying a disabled domain. | Don't retry; the state won't change back. |
| `rate_limited` | 429 | Request rate limit, per-minute recipient limit, domain verification throttle, login or sign-up throttle, or account lockout. A `retry-after` header is set for the request rate limit. | Back off and retry later. |
| `quota_exceeded` | 429 | The organization's 24-hour recipient quota would be exceeded. | Wait for the rolling window or request a higher limit. |
| `domain_not_verified` | 403 | The `From` domain is not a verified, sending-enabled domain in the key's project. | Verify the domain (see [DOMAINS.md](DOMAINS.md)). |
| `sender_not_authorized` | 403 | The credential is restricted to a different domain. | Use a credential for that domain. |
| `account_suspended` | 403 | The organization is suspended or pending review. | Contact support. |
| `payload_too_large` | 413 | The request body exceeds the route's size limit (1 MB in general; 16 MB for `POST /v1/emails`; 32 MB for `/v1/emails/batch`). | Reduce attachment size. |
| `internal_error` | 500 | An unexpected server error. No details are exposed. | Retry with backoff. For sends, reuse the same `Idempotency-Key` so a retry can't create a duplicate. |

## Retry guidance

| Status | Retry? |
| --- | --- |
| 4xx except 409 `conflict` (in-progress idempotency key) and 429 | No. Fix the request. |
| 429 | Yes, after `retry-after` (request rate) or later (quotas). |
| 5xx, network errors, timeouts | Yes, with exponential backoff, **reusing the same `Idempotency-Key`** for sends. |

## Related

- [Idempotency](IDEMPOTENCY.md) · [Rate limits](RATE-LIMITS.md)
