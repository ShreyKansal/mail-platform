# Quickstart

Send your first email through the API in about ten minutes. Most of that time is DNS.

## Prerequisites

- A MAIL_PLATFORM account (dashboard sign-in).
- Access to the DNS settings of a domain you own.
- `curl` or Node.js 18+ (for `fetch`).

Examples use the local development base URL `http://localhost:3000`. Replace it with your deployment's API URL.

## 1. Add and Verify Your Domain

1. In the dashboard, open **Domains → Add domain** and enter the domain you will send from, ideally a subdomain such as `notify.example.com`.
2. Publish the records shown: the **Ownership** TXT and the **DKIM** TXT are required. Add the **Return-Path** MX and SPF records and a **DMARC** record too. See [DNS setup](../help/DNS-SETUP.md).
3. Click **Check DNS now**. When the domain shows **Verified**, sending is enabled.

## 2. Create an API Key

**API keys → Create API key**. Choose **Sending access** unless the service also needs to read logs or manage resources. Copy the key: it starts with `mp_` and is shown only once.

```bash
export MP_API_KEY="mp_…"
```

## 3. Send

```bash
curl -X POST http://localhost:3000/v1/emails \
  -H "Authorization: Bearer $MP_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: quickstart-1" \
  -d '{
    "from": "Acme <hello@notify.example.com>",
    "to": "you@example.org",
    "subject": "Hello from MAIL_PLATFORM",
    "text": "It works.",
    "html": "<p>It <strong>works</strong>.</p>"
  }'
```

Expected output:

```json
{"id":"6d5b5098-d0ba-4b95-9497-63761b173c30"}
```

The HTTP status is `202 Accepted`: the email is stored and queued.

## 4. Check Delivery

A `sending_access` key cannot read emails. Use the dashboard (**Emails**) or a `full_access` key:

```bash
curl http://localhost:3000/v1/emails/6d5b5098-d0ba-4b95-9497-63761b173c30 \
  -H "Authorization: Bearer $MP_FULL_ACCESS_KEY"
```

Within seconds the recipient's `state` normally moves `QUEUED → MTA_ACCEPTED → REMOTE_ACCEPTED`. `REMOTE_ACCEPTED` means the receiving server accepted the message. It does not confirm inbox placement.

## Troubleshooting

| Response | Fix |
| --- | --- |
| `401 unauthorized` | Wrong, revoked or expired key, or missing `Bearer `. |
| `403 domain_not_verified` | The `from` domain isn't verified for the key's project. |
| `422 validation_error` | Read `error.details[].path`. |
| `429 quota_exceeded` | Review the configured allowance in Settings > Sending limits. |

## Next Steps

- [Sending your first email in depth](SENDING-FIRST-EMAIL.md)
- [Receive delivery events with webhooks](WEBHOOK-VERIFICATION.md)
- [Send via SMTP instead](SMTP-INTEGRATION.md)
