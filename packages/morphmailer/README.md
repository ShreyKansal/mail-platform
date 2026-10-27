# Morphmailer

Server-side JavaScript and TypeScript SDK for this self-hosted email platform. Node.js 20.8+; no runtime dependencies. Supports ESM and CommonJS with TypeScript declarations.

## Install

Download `morphmailer-0.1.0.tgz` from the dashboard API side sheet, then:

```sh
npm install ./morphmailer-0.1.0.tgz
```

The package is built locally; it has not been published to npm. To produce it from this repository, run `pnpm sdk:bundle`. In another monorepo workspace use `"morphmailer": "workspace:*"` after building it.

## Send

```ts
import { Morphmailer } from 'morphmailer';

const key = process.env.MORPHMAILER_API_KEY;
if (!key) throw new Error('Set MORPHMAILER_API_KEY');

const mailer = new Morphmailer(key, {
  baseUrl: 'http://localhost:3000', // Your API/reverse-proxy origin, without /v1
  timeoutMs: 30_000,
});

const { data, error } = await mailer.emails.send({
  from: 'Acme <hello@your-verified-domain.com>',
  to: ['you@example.com'],
  subject: 'Hello world',
  html: '<p>It works!</p>',
}, { idempotencyKey: 'welcome/customer-123' });

if (error) console.error(error.code, error.message, error.requestId);
else console.log(data.id); // Accepted for processing, not confirmed inbox delivery
```

Use HTTPS for remotely hosted APIs. Keep API keys on the server. Configuration errors throw immediately; HTTP/network errors return `{ data: null, error }`. Successful requests return `{ data, error: null }`.

## Available methods

```ts
await mailer.emails.send({ from, to, subject, text: 'Hello' });
await mailer.batch.send([{ from, to, subject, html: '<p>Hello</p>' }]);
await mailer.emails.get(emailId);
await mailer.emails.list({ limit: 25, search: 'receipt', cursor });
await mailer.emails.update(emailId, { scheduled_at: '2027-01-01T12:00:00Z' });
await mailer.emails.cancel(emailId);
```

Send options follow the REST contract (`reply_to`, `scheduled_at`, `test_mode`, `attachments`, `tags`, `metadata`, or a published `template`). Batch requests accept 1–100 emails atomically; recipient quotas still apply. Use `next_cursor` with `list({ cursor })` for the next page. Rescheduling/cancellation depend on the current email state and permissions.

All methods accept final request options `{ signal, idempotencyKey }`; only the send endpoints use idempotency keys. Requests time out after 30 seconds by default and are never retried automatically. Reuse the same idempotency key when retrying an ambiguous send. Error information includes the server code, message, status, request ID and field details when supplied. Non-JSON responses, cancellation and timeouts have distinct error codes.

```ts
const result = await mailer.emails.list({}, { signal: AbortSignal.timeout(5000) });
```

The SDK also exposes `broadcasts.create`, `get`, `list`, `update`, `remove`, `duplicate`, `send`, `cancel`, `retry`, `test` and `audience`. List responses contain lightweight summaries; retrieve an individual broadcast for content and selected contact IDs. An update requires every draft field plus `expected_revision`; sending also requires the current revision. `remove` returns `{ data: null, error: null }` on successful deletion. Campaign sends are not automatically retried; persisted campaign state prevents a second start. Other dashboard resources remain available through the REST API. Python, Go, Rust, Java, .NET and cURL tabs show direct REST examples; this package is the JavaScript/TypeScript SDK.

```ts
const created = await mailer.broadcasts.create({ name: 'Product update' });
// Save content and audience with broadcasts.update before sending.
const drafts = await mailer.broadcasts.list({ status: 'draft', limit: 25 });
```

## Automations

`automations.create`, `get`, `list`, `update`, `duplicate`, `remove`, `publish`, `pause`, `resume` and `test` manage workflows. `automations.runs.list`, `get`, `retry` and `cancel` inspect and control runs. Draft updates require all draft fields plus `expected_revision`. Publishing freezes a version; existing runs continue that version while later events use the latest published version. Email steps support HTML-escaped `{{contact.first_name}}`, `{{contact.last_name}}`, `{{contact.email}}` and `{{event.property}}` substitutions. Conditions support scalar comparisons and AND/OR groups. Delay and wait-for-event steps persist across restarts.

```ts
const workflow = await mailer.automations.create({ name: 'Welcome' });
// Save trigger_event, optional trigger_schema, entry_node_id and nodes with update.
// Publish using the returned revision before admitting events.
const admitted = await mailer.automationEvents.send({
  idempotency_key: 'customer-created-42',
  event: 'customer.created',
  contact_id: contactId,
  properties: { plan: 'pro', seats: 5 },
});
const runs = await mailer.automations.runs.list(automationId, { status: 'failed' });
```

Automation event idempotency is the explicit body field `idempotency_key`, scoped to the project. Reusing it with different data returns a conflict; an identical retry returns the original run IDs. Events enroll existing subscribed contacts in matching active workflows. Declared required/type checks are validated before enrollment. Pausing holds steps and queued mail until resume; email already handed to the transport cannot be recalled. `test` previews the saved draft without sending and stops at the first wait-for-event. Completed means all steps were processed, not inbox delivery. Unsubscribe, suppressions and sending quotas still apply. Use an unrestricted full-access key for events, resume, run retry and republishing existing workflows. These requests are never retried automatically.
