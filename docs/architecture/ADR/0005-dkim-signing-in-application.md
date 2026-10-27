# ADR 0005: DKIM signing in the application, not OpenDKIM

**Status:** Accepted

## Context

Every tenant domain has its own RSA key (2048-bit minimum), with selector versioning for rotation. Keys must be encrypted at rest and never usable for another tenant's domain. The spec allows OpenDKIM *or* a thoroughly validated in-house signer. OpenDKIM as a Postfix milter would need its `KeyTable` and `SigningTable` kept in sync with the database and private keys written to the MTA host's disk in plaintext.

## Decision

The mail worker composes each message with nodemailer and signs it with nodemailer's built-in DKIM signer before handing it to Postfix (`composeSignedMessage` in `packages/mail-protocol/src/compose.ts`).

- The key is loaded per email by `loadSendingIdentity`. It is decrypted from `dkim_keys.private_key_sealed` with AES-256-GCM, using associated data `dkim:<domainId>`, so a key copied to another domain's row cannot be decrypted.
- Only the domain's `active` key is used. Keys become active when the domain verifies.
- Signed headers include From, Subject, Date, Message-ID, To, Cc, Reply-To, MIME headers, List-Unsubscribe(-Post) and Feedback-ID (`DKIM_SIGNED_HEADERS`).
- Composition disables file and URL access, so customer content cannot make the composer read local files or fetch URLs.
- Validation uses an **independent implementation**: tests verify the nodemailer-produced signature with mailauth's `dkimVerify`. This is checked both on a freshly composed message (unit test) and on the copy actually delivered through Postfix to the capture sink (integration test).

## Consequences

- No private key ever reaches the MTA host. Postfix needs no per-tenant configuration.
- Postfix must not modify signed headers or the body. `main.cf` disables header rewriting (`local_header_rewrite_clients =`, `always_add_missing_headers = no`).
- Signing CPU cost sits in the worker tier and scales with it.
- Key rotation with overlapping selectors is supported by the schema (`pending`/`active`/`retiring`/`retired`), but no rotation endpoint exists yet.

## Alternatives considered

- **OpenDKIM milter.** Mature, but has the key-distribution and config-sync problems described above.
- **mailauth's `dkimSign`.** Viable. nodemailer was chosen so the bytes that are signed are exactly the bytes the composer emits, and so mailauth stays an independent verifier.
