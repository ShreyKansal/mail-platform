# SMTP Integration

Use SMTP when your application or framework already sends mail over SMTP. Messages submitted over SMTP go through the same validation, quotas, suppression, DKIM signing and delivery tracking as the API.

## Connection Settings

| Setting | Value |
| --- | --- |
| Host | Your deployment's SMTP submission host (e.g. `smtp.<platform-domain>`). Local development: `127.0.0.1`. |
| Port 587 | STARTTLS. The client must upgrade to TLS before authenticating. |
| Port 465 | Implicit TLS (TLS from the first byte). |
| Authentication | `AUTH PLAIN` or `AUTH LOGIN`, with the username (`mp_smtp_…`) and password from [SMTP credentials](../help/SMTP-CREDENTIALS.md). |
| Max message size | 25 MB by default (advertised via `SIZE`). |
| Max recipients | 50 per message. |

The local development stack listens on ports **2587** (STARTTLS) and **2465** (implicit TLS) with a self-signed certificate, so development clients must skip certificate verification. Production uses a real certificate.

**There is no unauthenticated relay.** AUTH is mandatory and is only offered after TLS. A `MAIL FROM` without authentication is refused with `530`.

## Node.js (nodemailer)

```js
import nodemailer from 'nodemailer';

const transport = nodemailer.createTransport({
  host: process.env.MP_SMTP_HOST,
  port: 587,
  secure: false,      // STARTTLS on 587
  requireTLS: true,   // refuse to continue without TLS
  auth: { user: process.env.MP_SMTP_USER, pass: process.env.MP_SMTP_PASS },
});

const info = await transport.sendMail({
  from: '"Acme" <noreply@notify.example.com>',
  to: 'ada@example.org',
  bcc: 'audit@example.com',
  subject: 'Hello over SMTP',
  text: 'Hi Ada',
  headers: { 'X-Order-Id': '1042' },
});
console.log(info.response); // "250 2.0.0 Queued as 6d5b5098-…"
```

The ID after `Queued as` is the email ID, which you can use with `GET /v1/emails/{id}` and in the dashboard.

## Python (smtplib)

```python
import smtplib, ssl
from email.message import EmailMessage

msg = EmailMessage()
msg["From"] = "Acme <noreply@notify.example.com>"
msg["To"] = "ada@example.org"
msg["Subject"] = "Hello over SMTP"
msg.set_content("Hi Ada")

with smtplib.SMTP("smtp.example-platform.com", 587) as s:
    s.starttls(context=ssl.create_default_context())
    s.login(SMTP_USER, SMTP_PASS)
    s.send_message(msg)
```

## How the Message Is Interpreted

- **Envelope recipients are authoritative.** The platform delivers to the `RCPT TO` addresses. Header `To`/`Cc` addresses that are not envelope recipients are dropped from the headers.
- **BCC.** Envelope recipients that are not in `To` or `Cc` are treated as BCC. They receive the message, and their addresses never appear in headers.
- The `To` header **must list at least one envelope recipient**. A message whose recipients are all BCC is refused with `550 5.6.0`.
- Exactly one `From` address is required. Its domain must be verified in the credential's project, or be a subdomain of a verified domain.
- An empty subject becomes `(no subject)`.
- **The message is rebuilt, not relayed byte-for-byte.** The platform extracts From, To, Cc, Reply-To, Subject, the text and HTML bodies and attachments, then composes and DKIM-signs a fresh message. Headers that pass through: `X-*` headers (except platform-reserved `X-MP-Email-Id`), `List-Unsubscribe`, `List-Unsubscribe-Post`, `In-Reply-To` and `References`. Everything else, including `Date`, `Message-ID` and `Received`, is replaced or dropped.
- Inline images referenced by `cid:` are currently delivered as regular attachments, so the HTML reference to them will not resolve. Host images over HTTPS instead.
- Attachment rules match the API: see [Attachments](ATTACHMENTS.md).

## SMTP Replies

| Reply | Meaning |
| --- | --- |
| `250 2.0.0 Queued as <id>` | Accepted and durably stored (the same guarantee as an API `202`). |
| `530` | Authentication required. |
| `535 5.7.8` | Wrong username or password, revoked credential, or a client IP outside the credential's allowed networks. |
| `535 5.7.1` | The organization is not allowed to send (suspended or pending review). |
| `454 4.7.0` | Too many failed AUTH attempts from your IP (10 per 10 minutes). Wait and retry. |
| `452 4.5.3` | More than 50 recipients. Split the message. |
| `553 5.1.3` | Invalid recipient address. |
| `552 5.3.4` | Message too large. |
| `550 5.6.0 …` | The message failed validation (bad header, blocked attachment type, missing To, and so on). The text explains why. |
| `550 5.7.1 …` | The From domain is not verified, the credential is restricted to another domain, or the account is suspended. |
| `451 4.7.1 …` | Recipient quota or per-minute limit reached. Retry later. |
| `451 4.3.0` | Temporary platform error. Retry. |

4xx replies are temporary, and well-behaved SMTP clients retry them automatically. 5xx replies are permanent; fix the message before resending.

## Related

- [SMTP credentials](../help/SMTP-CREDENTIALS.md)
- [Track delivery](../help/VIEW-DELIVERY-LOGS.md)
