# Bounces

This is the customer- and operator-level summary. The mechanics are in [DSN-BOUNCE-HANDLING](../smtp/DSN-BOUNCE-HANDLING.md).

* **Hard bounce**: the address or domain doesn't exist (5.1.x, 5.4.4, 5.2.1, or a 5xx "user unknown"). The recipient moves to `BOUNCED` and the address is **suppressed** for the organization.
* **Permanent rejection that isn't a hard bounce**: policy (5.7.x), authentication (5.7.23/25/26/27), content (5.6.x) or mailbox full (5.2.2). The recipient is `BOUNCED` but **not** suppressed, because these point at the sender or the message.
* **Soft or temporary failure** (4xx): `DEFERRED`. Postfix retries until the queue lifetime ends, then the recipient is `FAILED` (`retry_expired`).
* **Asynchronous bounce**: a receiver accepted the message and bounced it later. `REMOTE_ACCEPTED` → `BOUNCED`, with event data `asynchronous: true`.

Each recipient keeps its last SMTP code, enhanced status, sanitized response (control characters stripped, at most 500 characters) and `bounce_class`. Read them with `GET /v1/emails/{id}`, or subscribe to `email.bounced`.

Bounce-rate metric: `email_bounced_total{class}`. Per-tenant bounce-rate risk scoring and automatic suspension are not built yet; see [ABUSE-PREVENTION](../security/ABUSE-PREVENTION.md).
