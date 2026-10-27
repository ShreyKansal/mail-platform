# Key and secret management

## Encryption at rest: `SecretBox`

`packages/shared/src/crypto.ts`:

* Algorithm: AES-256-GCM, a random 96-bit IV per seal, a 128-bit tag.
* Format: `v1.<keyId>.<base64url(iv ‖ tag ‖ ciphertext)>`.
* **AAD binds each secret to its row:**

| Secret | Column | AAD |
|---|---|---|
| DKIM private key (PEM) | `dkim_keys.private_key_sealed` | `dkim:<domain_id>` |
| Webhook signing secret | `webhook_endpoints.secret_sealed` | `webhook:<endpoint_id>` |

  A sealed value copied to another row fails authentication.
* Keys come from a `KeyProvider`. The only implementation today is `StaticKeyProvider`, fed from `ENCRYPTION_KEYS="newId:base64,oldId:base64"`. Every key must be 32 bytes, and IDs must match `[a-z0-9-]{1,32}`. **The first key encrypts; all listed keys decrypt.**

### Rotation

1. Generate a key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
2. Prepend it (`new:…,old:…`) in **every** process that reads secrets (api, mail-worker, webhook-dispatcher), then deploy.
3. New seals use `new`; old values still decrypt.
4. **Gap:** no re-encryption job exists, so old key IDs must stay configured for as long as any row references them. Find them with `select split_part(private_key_sealed,'.',2), count(*) from dkim_keys group by 1;`.

**Gap:** no KMS/Vault-backed `KeyProvider` yet. `ENCRYPTION_KEYS` must come from a secret manager through environment injection.

## Hashed credentials

| Credential | Format | Storage |
|---|---|---|
| API key | `mp_` + 24 random bytes (base32); display prefix is the first 10 chars | SHA-256 hex (`api_keys.key_hash`, unique) |
| SMTP password | 24 random bytes (base32) | SHA-256 hex |
| Session token | 32 random bytes (base32), HttpOnly cookie `mp_session` | SHA-256 hex |
| User password | user-chosen, ≥ 12 chars | Argon2id (m=19456 KiB, t=2, p=1; OWASP baseline) via `@node-rs/argon2` |

A fast hash is appropriate for the random tokens, which have at least 160 bits of entropy. Low-entropy passwords use Argon2id. Secrets are shown exactly once at creation.

## Other secrets

* `VERP_SECRET`: HMAC key for bounce addresses ([CUSTOM-RETURN-PATH](../deliverability/CUSTOM-RETURN-PATH.md#verp-token)). Rotating it invalidates in-flight bounce correlation.
* Webhook secrets: `whsec_` + 32 random bytes (base64). They can be rotated through `POST /v1/webhooks/{id}/rotate-secret`. The previous secret is kept (sealed, in `previous_secret_sealed`) for a 24-hour overlap, and during that window the dispatcher signs with both secrets.
* Database and Redis passwords: deployment secrets. The compose defaults are development-only.

## Never

Commit `.env` (it's git-ignored), log decrypted values, or put production keys in images or lower environments.
