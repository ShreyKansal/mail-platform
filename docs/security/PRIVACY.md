# Privacy

This describes data handling as implemented. **It is not legal advice and makes no compliance claim.** A legal review (GDPR, India's DPDP Act and any other applicable regimes) is a required checkpoint before processing customer personal data in production.

## Personal data stored

| Data | Table | Notes |
|---|---|---|
| Account holders: name, email, Argon2id hash, sessions (IP, user agent) | `users`, `user_sessions` | Sessions expire (default 7 days) |
| Recipient addresses | `email_recipients`, `suppressions`, `bounce_events`, event payloads | Needed for delivery and suppression |
| Message content: subject, HTML, text, attachments, custom headers | `emails`, `email_contents`, `email_attachments` | Attachments are stored as base64 in Postgres for now |
| SMTP responses (may contain addresses) | `email_recipients`, `email_delivery_attempts` | Sanitized and truncated |
| Postfix spool and logs | MTA node | Logs hold addresses and queue IDs, not bodies |
| Audit and actor IPs | `audit_logs` | |

## Access

* Message bodies require `emails:read_content`.
* Logs never contain bodies or credentials.
* Database-level tenant isolation is in place ([TENANT-SECURITY](TENANT-SECURITY.md)).

## Not yet implemented

* **Configurable retention.** Content, events and logs are kept indefinitely today; there's no purge job.
* Data export and deletion (data-subject request) workflows.
* Per-tenant region or data residency.
* Object storage with lifecycle policies for attachments.
* Privacy notices and consent records for marketing (the marketing module isn't built).
* Encryption at rest is the database/infrastructure provider's responsibility; application-level encryption covers secrets only.
