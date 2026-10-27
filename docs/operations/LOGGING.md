# Logging

* **Library:** pino, emitting structured JSON to stdout. Workers use `createLogger(service)` (`packages/shared/src/logger.ts`), which adds `service` and an ISO timestamp. The API uses Fastify's pino with the same redaction list.
* **Request IDs:** every API request gets `req_<32 hex>`. It's logged, returned in the `x-request-id` header, and included in every error body (`request_id`). Client-supplied IDs are not trusted. Audit log rows store the request ID.
* **Correlation:** email ID, recipient ID and Postfix queue ID appear in worker logs. The `X-MP-Email-Id` header and `Feedback-ID` in each message link a received copy back to the platform.

## Redaction

These paths are replaced with `[redacted]`:

```
req.headers.authorization, req.headers.cookie, headers.authorization, headers.cookie,
password, *.password, secret, *.secret, token, *.token, apiKey, *.apiKey,
privateKey, *.privateKey, html, *.html, text, *.text, attachments, *.attachments
```

Rules for code:
* Never log message bodies, credentials, webhook secrets or decrypted keys.
* Log identifiers, not addresses, where possible. SMTP auth failures log a username truncated to 40 characters and the client IP.
* SMTP responses stored on recipients are sanitized (control characters removed, at most 500 characters).

## Aggregation

Not configured. Ship stdout with your platform's collector (Loki, Elasticsearch, Cloud Logging). The Postfix `maillog_file` must be retained by the MTA node, because the reconciler reads it. Set log retention per your privacy policy ([PRIVACY](../security/PRIVACY.md)).
