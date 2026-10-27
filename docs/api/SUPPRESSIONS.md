# Suppressions

The suppression list holds addresses your organization will not send to. It applies across **all projects** in the organization.

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/v1/suppressions` | `suppressions:read` |
| `POST` | `/v1/suppressions` | `suppressions:manage` |
| `DELETE` | `/v1/suppressions/{id}` | `suppressions:manage` |

## How addresses get suppressed

| `reason` | Source |
| --- | --- |
| `hard_bounce` | Automatic, when a recipient's server permanently rejects the address itself (for example `550 5.1.1 user unknown` or a non-existent domain). Policy, content and authentication rejections do **not** suppress, because the address is fine. |
| `manual` | Added by you through the API or dashboard. |

The schema also reserves `complaint` and `unsubscribe` for future feedback-loop and unsubscribe processing; the current release does not create them.

## Effect

- At acceptance, a suppressed recipient is recorded with the state `SUPPRESSED` and an `email.suppressed` event. Other recipients of the same email are unaffected.
- The list is checked again just before dispatch, so an address that bounces while another email is queued is still protected.
- Suppressed recipients count towards your recipient quota.

## List

```bash
curl "http://localhost:3000/v1/suppressions?email=ada@example.org" \
  -H "Authorization: Bearer $MP_API_KEY"
```

Parameters: `limit`, `cursor`, `email` (exact match, case-insensitive). Items:

```json
{ "id": "…", "email": "ada@example.org", "reason": "hard_bounce", "detail": "5.1.1 mailbox_unavailable", "created_at": "…" }
```

Addresses are stored in lowercase.

## Add

```bash
curl -X POST http://localhost:3000/v1/suppressions \
  -H "Authorization: Bearer $MP_API_KEY" -H "Content-Type: application/json" \
  -d '{"email":"someone@example.org"}'
```

Returns `201` with the suppression. If the address is already suppressed, the existing entry, with its original reason and date, is returned unchanged.

## Remove

`DELETE /v1/suppressions/{id}` → `{ "id": "…", "deleted": true }`. Use `GET ?email=` to find the id. Only remove a `hard_bounce` entry if you know the mailbox now exists; repeatedly sending to invalid addresses damages your sender reputation.
