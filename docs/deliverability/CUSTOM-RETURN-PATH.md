# Custom Return-Path and VERP

## Three identities

| Identity | Example | Controlled by |
|---|---|---|
| Visible `From` | `Acme <noreply@example.com>` | Customer (must be on a verified domain) |
| Envelope sender / Return-Path | `b+<token>@bounce.example.com` | Platform (always) |
| DKIM `d=` | `example.com` | Platform (key of the verified domain) |

The envelope sender is never taken from the customer: not from the API, and not from the SMTP `MAIL FROM`.

## Records

The Return-Path label is chosen when the domain is added (`return_path_label`, default `bounce`):

| Host | Type | Value |
|---|---|---|
| `bounce.example.com` | MX 10 | `<PLATFORM_BOUNCE_MX_HOST>` |
| `bounce.example.com` | TXT | `v=spf1 include:<PLATFORM_SPF_INCLUDE> -all` |

MX check: every MX host must equal the platform host. Extra hosts → `conflict`; a different host → `invalid`. When both records are valid, `return_path_verified_at` is set and the custom Return-Path is used for new dispatches. Until then, and whenever it later fails, the envelope uses `PLATFORM_BOUNCE_DOMAIN`.

## VERP token

`encodeVerp(recipientId, domain, VERP_SECRET)` produces this address:

```
b+<base32(recipient UUID, 26 chars)>-<base32(HMAC-SHA256(secret, "verp:v1:"‖id)[0..10], 16 chars)>@<return-path domain>
```

* One token per **recipient delivery**: collision-free, opaque, and free of tenant or address data.
* Lowercase base32, so receivers that fold case can't corrupt it. The local part is 45 characters (the limit is 64).
* `decodeVerp` verifies the MAC in constant time. Forged or tampered tokens give `null`.
* **Rotating `VERP_SECRET` invalidates every token in flight.** Bounces for mail sent before the rotation will be rejected at RCPT. Rotate only after the queue has drained (up to `maximal_queue_lifetime` plus a margin for asynchronous bounces). Dual-secret verification isn't implemented.

## Bounce routing

* Postfix-generated non-delivery reports are routed to the bounce processor through `transport_regexp`, with no DNS lookup.
* Remote asynchronous bounces arrive at `PLATFORM_BOUNCE_MX_HOST:25`. **Blocker:** that host's public listener, its TLS and its DNS are not deployed; locally the bounce processor listens on 2525 only.

## Not built

Customer-chosen opaque routing identities (`co13455.example.com`-style) aren't offered. When they are, they'll be verified identities like any other domain. Per-message domain rotation will never be offered.
