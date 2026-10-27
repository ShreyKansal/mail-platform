# DKIM

**Purpose.** Every message is signed with a key unique to the sending domain (`d=<customer domain>`), which gives DMARC alignment through DKIM.

## Keys

* Generated when a domain is added (`generateDkimKey`): **RSA 2048-bit**. Smaller sizes are refused in code.
* Selector format: `mp<YYYYMMDD><6 hex>`, for example `mp20261021abcdef`. The DNS host is `<selector>._domainkey.<domain>`, and the value is `v=DKIM1; k=rsa; p=<base64 SubjectPublicKeyInfo>`.
* The private key is stored **sealed** in `dkim_keys.private_key_sealed`, using AES-256-GCM with AAD `dkim:<domain_id>`. A key copied to another domain's row fails to decrypt. See [KEY-MANAGEMENT](../security/KEY-MANAGEMENT.md).
* Lifecycle: `pending` → `active` (when the domain first verifies) → `retiring`/`retired`. Only `active` keys sign. Keys are never returned by the API or shown in the dashboard.
* Keys belong to a single domain. `loadSendingIdentity` loads the key by the email's `domain_id`, so one tenant's key can't sign another tenant's domain.

## Signing

The worker composes the message with nodemailer (`composeSignedMessage`), which signs it with `rsa-sha256` and relaxed canonicalization. The signed headers are:

```
from:sender:reply-to:subject:date:message-id:to:cc:mime-version:content-type:
content-transfer-encoding:in-reply-to:references:list-id:list-unsubscribe:
list-unsubscribe-post:feedback-id
```

A message is signed once per email and the same bytes go to every recipient. Only the envelope differs. Customers can't set `DKIM-Signature` or other identity headers ([API custom headers](../api/EMAILS.md)).

## Verification of the record

`checkDkim`: the TXT records containing `p=` at the selector host are compared with the generated public key.

| Status | Meaning |
|---|---|
| `valid` | Exactly one record, and its key matches. A `t=y` testing flag is noted in the detail. |
| `invalid` | The key differs (often truncated when pasted), the record is revoked (`p=` empty), the tags are malformed, or `v=` is not the first tag |
| `conflict` | Several key records for the selector |
| `missing` | No key record |

DKIM is **required**: sending is enabled only when ownership and DKIM are both valid. If a verified domain later shows a definite DKIM failure, sending is turned off (drift detection, re-checked every 6 hours).

## Not built yet

* **Key rotation is not automated.** There's no API to create a second selector, publish it alongside the first, switch signing over and retire the old key. The schema supports several keys per domain (`retiring`/`retired` states) but the workflow doesn't exist.
* No Ed25519 signing.
* OpenDKIM isn't used. Signing happens in the application so per-tenant keys never touch the MTA's filesystem.

## Verification of signatures

`packages/mail-protocol/src/protocol.test.ts` signs with nodemailer and verifies with mailauth, an independent implementation. The integration test verifies the copy received by Mailpit after it has passed through Postfix.
