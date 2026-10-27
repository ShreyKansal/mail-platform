# SMTP credentials

SMTP credentials let applications that speak SMTP submit mail to the platform. They are separate from API keys.

| Method | Path | Permission |
| --- | --- | --- |
| `POST` | `/v1/smtp-credentials` | `smtp_credentials:manage` (dashboard users only) |
| `GET` | `/v1/smtp-credentials` | `smtp_credentials:read` (dashboard users only) |
| `DELETE` | `/v1/smtp-credentials/{id}` | `smtp_credentials:manage` (dashboard users only) |

No API key scope includes the `smtp_credentials:*` permissions, so these endpoints are used from the dashboard or with a dashboard session.

## Create

| Field | Rules |
| --- | --- |
| `name` | 1–100 characters. |
| `domain_id` | Optional. Restricts `From` to this domain (and its subdomains); it must belong to the project. |
| `allowed_cidrs` | Optional, up to 20 IPv4/IPv6 addresses or CIDRs (`203.0.113.0/24`, `2001:db8::/32`, `198.51.100.7`). If set, AUTH from any other client IP fails. |

**Response `201`**:

```json
{
  "id": "c2f1…",
  "name": "app server",
  "username": "mp_smtp_h7vdn5ooeyowyli7",
  "domain_id": null,
  "allowed_cidrs": ["203.0.113.0/24"],
  "last_used_at": null,
  "revoked_at": null,
  "created_at": "2026-10-21T11:20:00.000Z",
  "password": "…"
}
```

`password` is shown **only once**; only a hash is stored. Invalid CIDRs return `422 validation_error` on `allowed_cidrs`.

## List and revoke

`GET` returns `{ "data": [ … ] }` without passwords. `DELETE /v1/smtp-credentials/{id}` revokes immediately, so the next AUTH attempt fails with `535`. An unknown or already revoked credential returns `404`.

## Using the credentials

See [SMTP integration](../developer-guides/SMTP-INTEGRATION.md) for hosts, ports, TLS and SMTP reply codes.
