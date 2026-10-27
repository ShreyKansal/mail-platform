# Suppression

* **Scope:** per organization (`suppressions(org_id, address_lower)`, unique).
* **Reasons:** `hard_bounce` (automatic), `manual` (API or dashboard). `complaint` and `unsubscribe` exist in the schema but nothing writes them yet; FBL ingestion and RFC 8058 unsubscribe are not built.
* **Enforced twice:**
  1. At admission. Suppressed recipients are stored as `SUPPRESSED` and an `email.suppressed` event is emitted. They still count toward the request's quota.
  2. At dispatch. The worker checks again after claiming, so an address suppressed between admission and dispatch is never handed to the MTA (`DISPATCHING → SUPPRESSED`).
* **Idempotent:** adding an address that's already suppressed keeps the original reason and time.

## API

| Method | Path | Permission |
|---|---|---|
| GET | `/v1/suppressions?email=&limit=&cursor=` | `suppressions:read` |
| POST | `/v1/suppressions` `{ "email": "…" }` | `suppressions:manage` |
| DELETE | `/v1/suppressions/{id}` | `suppressions:manage` |

Creating and deleting suppressions is audit-logged (the reason is recorded; the address is not put in audit metadata). The dashboard warns before removing a hard-bounce suppression, because resending to a dead address harms reputation.
