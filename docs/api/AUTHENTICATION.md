# Authentication

The API accepts two kinds of credential:

| Caller | Credential | Used for |
| --- | --- | --- |
| Your servers | API key in `Authorization: Bearer mp_…` | Sending email and automating the account |
| The dashboard (browser) | HttpOnly session cookie `mp_session` | Human users signed in to the dashboard |

SMTP clients use separate [SMTP credentials](SMTP-CREDENTIALS.md).

## API keys

```bash
curl http://localhost:3000/v1/domains \
  -H "Authorization: Bearer $MP_API_KEY"
```

- Keys look like `mp_` followed by 39 lowercase base32 characters.
- Keys are shown **once**, when they are created. The platform stores only a SHA-256 hash and cannot show the key again.
- The key list shows a non-secret `prefix` (the first 10 characters) so you can tell keys apart.
- Unknown, revoked and expired keys all receive the same `401 unauthorized` response ("invalid, revoked or expired API key").
- Each key belongs to one project. Everything it creates or reads is scoped to that project and its organization.
- `last_used_at` is updated at most once per minute per key.

### Scopes

A key has exactly one scope:

| Scope | Permissions |
| --- | --- |
| `sending_access` (default) | `emails:send` only. It can send and cancel emails, and nothing else. |
| `full_access` | `org:read`, `domains:read`, `domains:manage`, `api_keys:read`, `emails:read`, `emails:read_content`, `emails:send`, `webhooks:read`, `webhooks:manage`, `suppressions:read`, `suppressions:manage`, `analytics:read` |

By design, no key can create or revoke API keys, create or revoke SMTP credentials, or manage members or billing. A leaked key therefore cannot mint new credentials. Those operations require a dashboard user with the right role.

A request that lacks the permission a route needs receives `403 forbidden` with the message `missing permission <name>`.

### Domain restriction

When a key is created with `domain_id`, it may only send `From` addresses on that domain (or its subdomains). Sending from any other verified domain in the project returns `403 sender_not_authorized`.

### Expiry

Pass `expires_at` (ISO 8601 with offset) at creation time. After that moment the key returns `401`.

## Dashboard sessions

The dashboard signs in with `POST /auth/login` and receives an `mp_session` cookie (`HttpOnly`, `SameSite=Lax`, `Secure` in production). Sessions last 7 days by default (`SESSION_TTL_HOURS`) and can be ended with `POST /auth/logout`. Role and membership are re-read on every request, so a role change or removal takes effect immediately.

### CSRF protection

For cookie-authenticated requests using `POST`, `PUT`, `PATCH` or `DELETE`:

1. The request must carry the header `x-mp-csrf: 1`. Browsers cannot add a custom header cross-site without a CORS preflight, and the API only allows the configured dashboard origin.
2. If an `Origin` header is present, it must equal the configured `DASHBOARD_ORIGIN`.

Failing either check returns `403 forbidden`. Requests authenticated with an API key are not subject to these checks, because they do not use cookies.

### Login protection

- Wrong credentials always return `401` with the message `invalid email or password`, whether or not the account exists.
- After 10 failed attempts, the account is locked for 15 minutes (`429 rate_limited`). The failure count resets only on a successful login, so each further failure after the lock expires locks the account again.
- Each client IP may make at most 20 login attempts per minute and 5 sign-ups per hour.
- Public sign-up is disabled unless the operator sets `ALLOW_PUBLIC_SIGNUP=true`. When disabled, sign-up returns `403 forbidden` ("public registration is closed").

### Roles

Dashboard users have an organization role: `owner`, `admin`, `developer`, `billing_admin`, `analyst` or `read_only`. The server enforces every permission; hiding a button in the UI is never the only control. `analyst` and `read_only` users cannot read message bodies (`emails:read_content`).

## Related

- [API keys](API-KEYS.md) · [Errors](ERRORS.md) · [Rate limits](RATE-LIMITS.md)
