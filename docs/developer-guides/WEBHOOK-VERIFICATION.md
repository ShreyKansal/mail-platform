# Verifying Webhooks

Anyone can POST to a public URL. Verify every webhook before trusting it.

## The Algorithm

Each request carries:

| Header | Example |
| --- | --- |
| `webhook-id` | `3b9e6f5e-8c1d-8f2a-9c43-1d2e3f4a5b6c` |
| `webhook-timestamp` | `1792581232` (Unix seconds) |
| `webhook-signature` | `v1,K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN/H/pI4=` |

To verify:

1. Reject the request if any header is missing.
2. Reject the request if `webhook-timestamp` is more than 5 minutes from your current time (replay protection).
3. Take your endpoint secret `whsec_<base64>`, strip `whsec_`, and base64-decode the rest. The resulting bytes are the HMAC key.
4. Compute `HMAC-SHA256(key, webhook-id + "." + webhook-timestamp + "." + raw_body)` and base64-encode it.
5. The header is a space-separated list of `version,signature` pairs. Accept the request if any `v1` signature equals yours, using a constant-time comparison.

**Use the raw body bytes exactly as received.** Re-serializing parsed JSON changes whitespace and key order, which breaks the signature.

## Node.js (Express)

```js
import crypto from 'node:crypto';
import express from 'express';

const SECRET = process.env.MP_WEBHOOK_SECRET; // "whsec_…"
const TOLERANCE_SECONDS = 5 * 60;

export function verifyWebhook(secret, headers, rawBody, now = Math.floor(Date.now() / 1000)) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
  if (!id || !timestamp || !signatureHeader) return false;

  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || Math.abs(now - ts) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.`)
    .update(rawBody) // Buffer: exact bytes received
    .digest('base64');
  const expectedBuf = Buffer.from(expected);

  return signatureHeader.split(' ').some((part) => {
    const [version, signature] = part.split(',');
    if (version !== 'v1' || !signature) return false;
    const candidate = Buffer.from(signature);
    return candidate.length === expectedBuf.length && crypto.timingSafeEqual(candidate, expectedBuf);
  });
}

const app = express();

// express.raw keeps the body as a Buffer: do not use express.json() on this route.
app.post('/webhooks/mail', express.raw({ type: 'application/json' }), (req, res) => {
  if (!verifyWebhook(SECRET, req.headers, req.body)) return res.status(401).end();

  const event = JSON.parse(req.body.toString('utf8'));
  // De-duplicate on the webhook-id header: retries reuse it.
  queueForProcessing(req.headers['webhook-id'], event);
  res.status(204).end(); // respond within 10 seconds; do heavy work asynchronously
});

app.listen(8080);
```

Node lowercases incoming header names, so `req.headers['webhook-id']` works whatever case was sent.

## Python (Flask)

```python
import base64
import hashlib
import hmac
import time

from flask import Flask, abort, request

SECRET = "whsec_..."  # load from your secret store
TOLERANCE_SECONDS = 5 * 60


def verify_webhook(secret: str, headers, raw_body: bytes, now: int | None = None) -> bool:
    msg_id = headers.get("webhook-id")
    timestamp = headers.get("webhook-timestamp")
    signature_header = headers.get("webhook-signature")
    if not msg_id or not timestamp or not signature_header:
        return False

    try:
        ts = int(timestamp)
    except ValueError:
        return False
    now = int(time.time()) if now is None else now
    if abs(now - ts) > TOLERANCE_SECONDS:
        return False

    key = base64.b64decode(secret[len("whsec_"):])
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()

    for part in signature_header.split(" "):
        version, _, signature = part.partition(",")
        if version == "v1" and hmac.compare_digest(signature, expected):
            return True
    return False


app = Flask(__name__)


@app.post("/webhooks/mail")
def mail_webhook():
    raw = request.get_data()  # raw bytes, before any JSON parsing
    if not verify_webhook(SECRET, request.headers, raw):
        abort(401)
    event = request.get_json()
    # de-duplicate on request.headers["webhook-id"], then process asynchronously
    return "", 204
```

Flask's `request.headers` is case-insensitive.

## Test Your Verifier

To check your implementation, sign a body yourself with the algorithm above, using a timestamp of "now", and confirm `verify_webhook` returns true. Then change one byte of the body, the ID or the timestamp, and confirm it returns false.

## Operational Advice

- Return 2xx only after the event is safely stored. Anything else, including a timeout over 10 seconds, causes retries for about 23 hours.
- Process idempotently using `webhook-id`.
- **Secret rotation:** after `POST /v1/webhooks/{id}/rotate-secret`, the `webhook-signature` header carries two space-separated signatures for 24 hours, one from the new secret and one from the previous one. A receiver still configured with the old secret keeps verifying, because the examples above accept any matching signature. Deploy the new secret within that window.
- Don't rely on arrival order; use `created_at` and `data.state`.

## Related

- [Set up webhooks](../help/WEBHOOKS.md)
