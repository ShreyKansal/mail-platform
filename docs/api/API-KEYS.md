# API keys

| Method | Path | Permission |
| --- | --- | --- |
| `POST` | `/v1/api-keys` | `api_keys:manage` (dashboard users only) |
| `GET` | `/v1/api-keys` | `api_keys:read` |
| `DELETE` | `/v1/api-keys/{id}` | `api_keys:manage` (dashboard users only) |

API keys cannot create or revoke API keys; no key scope includes `api_keys:manage`. Keys are created from the dashboard, or by a script holding a dashboard session (see [AUTHENTICATION.md](AUTHENTICATION.md#csrf-protection) for the required headers).

## Create

Request body:

| Field | Rules |
| --- | --- |
| `name` | 1–100 characters (trimmed). |
| `scope` | `sending_access` (default) or `full_access`. See [scopes](AUTHENTICATION.md#scopes). |
| `domain_id` | Optional. Restricts sending to this domain, which must belong to the same project. Otherwise `422`. |
| `expires_at` | Optional ISO 8601 timestamp with offset. |

**Response `201`**:

```json
{
  "id": "9a1c…",
  "name": "production-backend",
  "prefix": "mp_4esxwei",
  "scopes": ["sending_access"],
  "domain_id": null,
  "last_used_at": null,
  "expires_at": null,
  "revoked_at": null,
  "created_at": "2026-10-21T11:14:10.000Z",
  "token": "mp_4esxwei…"
}
```

`token` is returned **only in this response**. Store it in your secret manager.

## List

`GET /v1/api-keys` returns `{ "data": [ … ] }` for the caller's project, newest first, including revoked keys (`revoked_at` set). Tokens are never returned.

## Revoke

`DELETE /v1/api-keys/{id}` revokes the key immediately and returns the key object. Revoking an unknown or already revoked key returns `404 not_found`. Revocation cannot be undone; create a new key instead.

Creation and revocation are recorded in the organization's audit log.

## Good practice

- One key per service and environment, named after it.
- Give services that only send email the `sending_access` scope.
- Restrict keys to a domain when a service sends from only one domain.
- Rotate by creating the new key, deploying it, then revoking the old one.
- Never embed keys in browser or mobile code.

## Related

- [Authentication](AUTHENTICATION.md) · [Help: API keys](../help/API-KEYS.md)
