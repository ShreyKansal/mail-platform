# ADR 0003: Per-recipient VERP return path authenticated with an HMAC

**Status:** Accepted

## Context

Bounces arrive at the envelope sender, sometimes days later and from systems that mangle the original message. They must be attributed to the exact recipient delivery, routed to the right tenant, and must not be forgeable: anyone can send mail to a bounce address. The visible From address must stay the customer's brand.

## Decision

The envelope sender for every recipient is

```
b+<base32(recipient UUID, 16 bytes)>-<base32(HMAC-SHA256(VERP_SECRET, "verp:v1:" ‖ id)[0..10])>@<return-path domain>
```

(`packages/mail-protocol/src/verp.ts`).

- The token is 45 characters, lowercase only (it survives case-folding MTAs and fits the 64-character local-part limit). It contains no tenant id or address.
- The return-path domain is `<label>.<customer domain>` once its MX and SPF records verify, otherwise the platform's `PLATFORM_BOUNCE_DOMAIN`.
- Postfix routes any `b+…` recipient directly to the bounce processor (`transport_maps`). This covers its own DSNs as well as remote bounces arriving via the bounce domain's MX.
- The bounce processor rejects at `RCPT TO` any address whose MAC does not verify (`550 5.1.1`), before touching the database.
- The delivery reconciler uses the same decoding on Postfix `from=` log lines to map queue ids to recipients.

## Consequences

- Bounce correlation needs no lookup table and survives message mangling.
- Forged bounces cannot name arbitrary recipients without the secret.
- Rotating `VERP_SECRET` invalidates correlation for mail still in flight. Rotation needs a dual-secret window, which is not implemented.
- The visible From, envelope sender and DKIM `d=` are independent identities. DMARC aligns through DKIM always, and through SPF once the custom Return-Path is verified.

## Alternatives considered

- **Plain `bounces@` address and parsing `Original-Recipient` / `Message-ID` from DSNs.** Unreliable; many DSNs omit or rewrite these.
- **Encrypting the recipient id.** Unnecessary: the UUID is already random and opaque, and only integrity needs protecting.
- **Random token stored in a lookup table.** Works, but adds a write per recipient and a lookup per bounce for no gain over the MAC.
