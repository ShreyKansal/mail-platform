# Scheduled Emails

Add `scheduled_at` to send later:

```bash
curl -X POST http://localhost:3000/v1/emails \
  -H "Authorization: Bearer $MP_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "from": "reminders@notify.example.com",
    "to": "ada@example.org",
    "subject": "Your appointment is tomorrow",
    "text": "See you at 10:00.",
    "scheduled_at": "2026-10-22T09:00:00+02:00"
  }'
```

## Behaviour

- `scheduled_at` must be ISO 8601 **with** an offset (`Z` or `±hh:mm`).
- It may be at most **30 days** in the future; later values return `422`.
- A time in the past (or now) sends immediately.
- The email is validated and counted against your quotas **when you submit it**, not when it is sent.
- Recipients have state `SCHEDULED` until the time arrives; then they are dispatched like any other email. Dispatch normally starts within a second or two of `scheduled_at`.
- An `email.scheduled` webhook event is sent at acceptance, followed by the normal delivery events.
- Suppressions are re-checked at dispatch time, so an address that bounces in the meantime is skipped.

## Cancelling

```bash
curl -X POST http://localhost:3000/v1/emails/$EMAIL_ID/cancel -H "Authorization: Bearer $MP_API_KEY"
```

Every recipient still `SCHEDULED` (or `QUEUED`/`RETRYING`) becomes `CANCELLED`, and `email.cancelled` is emitted. Once a recipient has been handed to the MTA, it can't be cancelled (`409 invalid_state`).

Rescheduling is not supported. Cancel and submit a new email instead.
