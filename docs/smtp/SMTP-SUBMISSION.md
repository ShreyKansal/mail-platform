# SMTP submission gateway (operator view)

**Purpose.** `services/smtp-submission` lets customers send through ordinary SMTP clients. Every message goes through the same admission service as `POST /v1/emails`: verified-domain check, quotas, suppression and header validation. It is separate from Postfix, which is MTA-to-MX only.

Customer-facing guide: [developer-guides/SMTP-INTEGRATION](../developer-guides/SMTP-INTEGRATION.md). API equivalent: [api/EMAILS](../api/EMAILS.md).

## Listeners

| Port (env) | Default | Mode |
|---|---|---|
| `SMTP_STARTTLS_PORT` | 587 (`.env`: 2587) | Plaintext greeting; STARTTLS required before AUTH. |
| `SMTP_IMPLICIT_TLS_PORT` | 465 (`.env`: 2465) | TLS from the first byte. |
| `SMTP_BIND` | `127.0.0.1` | Set to `0.0.0.0` (or the public interface) in production. |

Both listeners come from `createSubmissionServer()` in `src/server.ts`, using the same options.

## TLS material

* Production: `SMTP_TLS_KEY_FILE` and `SMTP_TLS_CERT_FILE` (PEM). The service refuses to start without them when `NODE_ENV=production`.
* Development: a self-signed 2048-bit certificate is generated at start-up and a warning is logged.
* **Blocker:** no ACME/certbot integration exists yet. Certificates must be provisioned and renewed externally, and the service restarted to load new files.

## Authentication

* `authOptional: false`: `MAIL FROM` before a successful AUTH gets `530`. This makes an open relay impossible.
* `allowInsecureAuth: false`: AUTH is not even advertised before TLS.
* Methods: `PLAIN`, `LOGIN`. Credentials are created through `POST /v1/smtp-credentials`. Usernames look like `mp_smtp_<base32>`; passwords are 192-bit random values stored as SHA-256 hashes.
* An optional `allowed_cidrs` list per credential is checked against the client IP. IPv4-mapped IPv6 addresses are normalized first.
* Throttling: each failed AUTH increments `smtp-auth-fail:<ip>` in Redis with a 10-minute TTL. At 10 or more failures, AUTH returns `454 4.7.0`. If Redis is down this throttle fails open; account lockout doesn't apply to SMTP credentials, which are high-entropy.
* Credentials of a non-`active` organization get `535 5.7.1`.
* Revocation takes effect on the next AUTH. Sessions that are already authenticated keep working until they disconnect.

## Message handling

1. `RCPT TO`: the address must parse (`553 5.1.3` otherwise). At most `MAX_RECIPIENTS` (50) per transaction, then `452 4.5.3`.
2. `DATA`: limited to `MAX_MESSAGE_BYTES` (25 MiB), otherwise `552 5.3.4`. Parsed with mailparser.
3. Conversion (`toAdmissionInput`):
   * Exactly one `From` is required.
   * **Envelope recipients are authoritative.** Header To/Cc only decide visibility; envelope recipients absent from headers become BCC.
   * The `To` header must list at least one envelope recipient. BCC-only messages are rejected with `550 5.6.0`, because rewriting `To` would leak a BCC address.
   * Only `X-*`, `List-Unsubscribe`, `List-Unsubscribe-Post`, `In-Reply-To` and `References` headers are carried over, after the same validation as the API. `X-MP-*` headers are dropped.
   * The message is **recomposed** and re-signed. Inline `cid:` images become ordinary attachments (a known limitation).
4. Admission runs as the RLS-restricted `mp_app` role bound to the credential's organization.

## Reply mapping

| Platform error | SMTP reply |
|---|---|
| `validation_error` | `550 5.6.0 …` |
| `domain_not_verified`, `sender_not_authorized`, `account_suspended` | `550 5.7.1 …` |
| `quota_exceeded`, `rate_limited` | `451 4.7.1 …` (the client retries later) |
| anything unexpected | `451 4.3.0 Temporary failure` |
| success | `250 2.0.0 Queued as <email id>` |

The envelope `MAIL FROM` that a client sends is not used. The platform always substitutes its own VERP return path.

## Operations

* Metrics: `email_accepted_total{source="smtp"}` on `METRICS_PORT` (9106).
* Logs: `smtp authenticated` (credential ID, org ID, IP) and `smtp authentication failed` (truncated username, IP). Passwords are never logged.
* Graceful shutdown closes both listeners, then the database pools.

## Verification

`tests/smtp/submission.test.ts` exercises STARTTLS, implicit TLS, open-relay refusal, AUTH-before-TLS refusal, bad credentials, unverified `From` and revocation. See [SMTP-TESTING](../testing/SMTP-TESTING.md).
