# Database schema

Source of truth: `packages/database/src/schema.ts` (Drizzle). Generated SQL: `packages/database/migrations/`. All primary keys are random UUIDs (`gen_random_uuid()`). All timestamps are `timestamptz`.

## Entity relationships

```mermaid
erDiagram
  organizations ||--o{ organization_members : has
  users ||--o{ organization_members : joins
  users ||--o{ user_sessions : has
  organizations ||--o{ workspaces : has
  workspaces ||--o{ projects : has
  projects ||--o{ api_keys : has
  projects ||--o{ smtp_credentials : has
  projects ||--o{ domains : has
  domains ||--o{ dns_records : expects
  domains ||--o{ dkim_keys : signs-with
  projects ||--o{ emails : sends
  domains ||--o{ emails : "from (restrict)"
  emails ||--|| email_contents : body
  emails ||--o{ email_attachments : has
  emails ||--o{ email_recipients : to
  email_recipients ||--o{ email_delivery_attempts : attempts
  emails ||--o{ email_events : events
  email_recipients ||--o{ email_events : events
  email_recipients ||--o{ mta_queue_messages : "postfix queue id"
  email_recipients ||--o{ bounce_events : bounces
  organizations ||--o{ suppressions : has
  organizations ||--o{ email_idempotency_keys : has
  projects ||--o{ webhook_endpoints : has
  webhook_endpoints ||--o{ webhook_deliveries : outbox
  webhook_deliveries ||--o{ webhook_attempts : attempts
  organizations ||--o{ audit_logs : records

  organizations {
    uuid id PK
    text slug UK
    org_status status
    sending_tier sending_tier
    int daily_recipient_limit
    int per_minute_recipient_limit
  }
  users {
    uuid id PK
    text email "unique lower()"
    text password_hash
    int failed_login_count
    timestamptz locked_until
  }
  user_sessions {
    uuid id PK
    text token_hash UK
    uuid active_org_id
    timestamptz expires_at
    timestamptz revoked_at
  }
  api_keys {
    uuid id PK
    text key_hash UK
    text prefix
    text[] scopes
    uuid domain_id
    timestamptz revoked_at
  }
  smtp_credentials {
    uuid id PK
    text username UK
    text password_hash
    text[] allowed_cidrs
  }
  domains {
    uuid id PK
    text name
    domain_status status
    text ownership_token
    timestamptz ownership_verified_at
    text return_path_label
    bool sending_enabled
    timestamptz next_check_at
  }
  dns_records {
    uuid id PK
    dns_record_purpose purpose
    text host
    text value
    bool required
    dns_record_status status
    jsonb observed
  }
  dkim_keys {
    uuid id PK
    text selector
    text public_key
    text private_key_sealed
    dkim_key_status status
  }
  emails {
    uuid id PK
    text from_address
    text subject
    text message_id UK
    email_stream stream
    jsonb tags
    jsonb metadata
    int recipient_count
  }
  email_recipients {
    uuid id PK
    text address
    recipient_state state
    timestamptz next_attempt_at
    text lease_owner
    timestamptz lease_expires_at
    text mta_queue_id
    smallint last_smtp_code
    text bounce_class
  }
  email_events {
    uuid id PK
    text type
    jsonb data
    text dedupe_key UK
    timestamptz occurred_at
  }
  mta_queue_messages {
    text queue_id PK
    uuid recipient_id
  }
  suppressions {
    uuid id PK
    text address_lower
    suppression_reason reason
  }
  webhook_endpoints {
    uuid id PK
    text url
    text[] event_types
    text secret_sealed
    bool enabled
  }
  webhook_deliveries {
    uuid id PK
    uuid event_id
    webhook_delivery_status status
    int attempts
    timestamptz next_attempt_at
  }
  worker_checkpoints {
    text name PK
    text file_id
    bigint position
    timestamptz heartbeat_at
    timestamptz watermark_at
  }
```

`email_delivery_attempts`, `email_attachments`, `email_contents`, `email_idempotency_keys`, `bounce_events`, `webhook_attempts` and `audit_logs` are omitted from the attribute blocks for brevity; see `schema.ts`.

## Notable constraints and indexes

| Object | Purpose |
| --- | --- |
| `users_email_lower_uq` on `lower(email)` | Case-insensitive unique login. |
| `domains_org_name_uq (org_id, name)` | A domain is added at most once per organization. |
| `domains_verified_name_uq (name) WHERE verified and not disabled` | Only one tenant can own a verified domain ([TENANT-ISOLATION.md](TENANT-ISOLATION.md)). |
| `dns_records_domain_purpose_host_uq` | One expected record per purpose and host. |
| `dkim_keys_domain_selector_uq` | Selector versioning per domain. |
| `emails_message_id_uq` | Message-ID uniqueness (`<email uuid>@<from domain>`). |
| `email_recipients_dispatch_idx (stream, next_attempt_at) WHERE state IN dispatchable` | Keeps the dispatcher claim fast regardless of history size. |
| `email_recipients_lease_idx (lease_expires_at) WHERE state IN ('DISPATCHING','DELIVERY_UNKNOWN')` | Uncertain hand-off sweep. |
| `email_recipients_queue_id_idx` | Look up by Postfix queue id. |
| `email_events_dedupe_uq (dedupe_key)` | Idempotent event recording ([EVENT-MODEL.md](EVENT-MODEL.md)). |
| `email_idempotency_keys PK (org_id, key)` | API idempotency. |
| `suppressions_org_address_uq` | Tenant-scoped suppression list. |
| `bounce_events_dedupe_uq` | One bounce record per recipient and status, whichever source reports it first. |
| `webhook_deliveries_endpoint_event_uq` | An event is enqueued at most once per endpoint. |
| `webhook_deliveries_due_idx WHERE status IN ('pending','retrying')` | Webhook claim. |
| `api_keys_hash_uq`, `smtp_credentials_username_uq`, `user_sessions_token_uq` | Credential lookup. |

### Referential actions

Tenant data cascades from `organizations`, so deleting an organization removes everything it owns. `emails.domain_id` is `ON DELETE RESTRICT`: a domain with sent mail can only be *disabled* (`removeDomain`), which keeps delivery records auditable. Sessions cascade from users.

## Secrets at rest

`dkim_keys.private_key_sealed` and `webhook_endpoints.secret_sealed` are encrypted with AES-256-GCM (`SecretBox`, format `v1.<keyId>.<base64url>`). The associated data binds each ciphertext to its row (`dkim:<domainId>`, `webhook:<endpointId>`), so a ciphertext copied to another row fails to decrypt. Keys come from `ENCRYPTION_KEYS`. The first key encrypts; all listed keys decrypt, which allows rotation. API keys and SMTP passwords are stored as SHA-256 hashes (high-entropy secrets). User passwords use Argon2id.

## Immutability

`mp_app` may only `SELECT`/`INSERT` into `email_events`, `email_delivery_attempts`, `bounce_events`, `webhook_attempts` and `audit_logs` (see [TENANT-ISOLATION.md](TENANT-ISOLATION.md)). Workers run as `mp_service` and never update those tables in code.

## Migration workflow

1. Edit `schema.ts`.
2. `pnpm db:generate` (runs `drizzle-kit generate`) writes `migrations/NNNN_*.sql` and the snapshot.
3. For SQL Drizzle cannot express (RLS, grants, functions): `pnpm --filter @mp/database exec drizzle-kit generate --custom --name <name>`, then fill in the file. `0001_rls_and_grants.sql` was written this way.
4. Apply with `pnpm db:migrate`. This requires `DATABASE_MIGRATION_URL` pointing at the owner role and applies pending migrations through Drizzle's migrator (`packages/database/src/migrate.ts`).
5. New tenant tables must be added to the RLS loop and the `mp_app` grants in a custom migration. They do not inherit RLS automatically.

The integration test global setup applies migrations to `mail_platform_test` and truncates all tables before each run.

## Not yet implemented

- **Partitioning and retention.** `email_events`, `email_recipients`, `email_delivery_attempts` and `webhook_attempts` are ordinary tables. Time-based partitioning (monthly) and retention jobs are planned but not built. Expired `email_idempotency_keys` are deleted only when the same key is reused. No cleanup job exists.
- Tables from the master spec for templates, contacts, campaigns, inbound, billing, BIMI, IP pools and reputation.
