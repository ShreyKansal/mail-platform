# Sending Your First Email (in Depth)

This guide covers a production-quality integration: a verified domain, a correctly scoped key, idempotent retries, error handling and delivery tracking.

## Prerequisites

- A domain in status **Verified** (see [Verify a domain](../help/VERIFY-DOMAIN.md)).
- A `sending_access` API key in your secret store as `MP_API_KEY`.

## Node.js Integration

```js
// send-email.mjs — Node.js 18+
const API = process.env.MP_API_URL ?? 'http://localhost:3000';

export async function sendEmail(message, { idempotencyKey, attempts = 4 } = {}) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(`${API}/v1/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.MP_API_KEY}`,
          'Content-Type': 'application/json',
          // Same key on every retry: the platform returns the original id instead of sending twice.
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      if (attempt >= attempts) throw err; // network error or timeout: safe to retry with the same key
      await new Promise((r) => setTimeout(r, 2 ** attempt * 500));
      continue;
    }

    if (res.status === 202) return (await res.json()).id;

    const body = await res.json().catch(() => null);
    const retryable = res.status >= 500 || res.status === 429 || body?.error?.code === 'conflict';
    if (!retryable || attempt >= attempts) {
      const e = new Error(`${body?.error?.code}: ${body?.error?.message} (request ${body?.request_id})`);
      e.details = body?.error?.details;
      throw e;
    }
    const wait = Number(res.headers.get('retry-after') ?? 0) * 1000 || 2 ** attempt * 500;
    await new Promise((r) => setTimeout(r, wait));
  }
}

const id = await sendEmail(
  {
    from: 'Acme Billing <billing@notify.example.com>',
    to: ['ada@example.org'],
    reply_to: 'support@example.com',
    subject: 'Your receipt #1042',
    text: 'Thanks for your order.',
    html: '<p>Thanks for your order.</p>',
    tags: [{ name: 'type', value: 'receipt' }],
    metadata: { order_id: '1042' },
  },
  { idempotencyKey: 'receipt-1042' },
);
console.log('accepted', id);
```

Choose the idempotency key from your own data (an order ID, a notification ID), not a random value generated per attempt. Otherwise a retry after a timeout could send twice.

## Plain Text and HTML

Provide both `text` and `html` where possible. The platform builds a standard `multipart/alternative` message. HTML is sent as you provide it, so inline your CSS and test across mail clients.

## Tracking the Outcome

Choose one:

- **Webhooks** (recommended): subscribe to `email.remote_accepted`, `email.bounced` and `email.failed`. See [Webhook verification](WEBHOOK-VERIFICATION.md).
- **Polling**: `GET /v1/emails/{id}` with a `full_access` key, reading `recipients[].state`.

Final recipient states: `REMOTE_ACCEPTED`, `BOUNCED`, `FAILED`, `SUPPRESSED`, `CANCELLED`. `DEFERRED` means the recipient's server asked the platform to retry later, and the MTA will. Do **not** re-send on `DEFERRED`; that would create duplicates.

## Common Failure Cases

| Symptom | Cause |
| --- | --- |
| `403 domain_not_verified` | `from` is on a domain not verified in this key's project. Subdomains of a verified domain are allowed. |
| `422` with `details[].path = "headers.From"` | Platform-managed headers can't be overridden. Use the `from` field. |
| `422` on `to[0]` | Invalid address, e.g. a display name without angle brackets or a non-ASCII local part. |
| Recipient `SUPPRESSED` | The address previously hard-bounced or was suppressed manually. |
| Recipient `BOUNCED` with `authentication_rejected` | The receiver rejected the message on SPF, DKIM or DMARC grounds. Check the domain's records are still valid. |

## Security

- Keep the API key server-side only.
- Never put untrusted user input into `from` without validating that it is one of your sending addresses.

## Related

- [Track delivery](../help/VIEW-DELIVERY-LOGS.md)
- [Attachments](ATTACHMENTS.md)
- [Scheduling and cancelling](SCHEDULED-EMAILS.md)
