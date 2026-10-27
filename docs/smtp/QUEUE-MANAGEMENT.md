# Queue management

There are two queues: the **application dispatch queue**, which is rows in `email_recipients`, and the **Postfix queue**, which is files in `/var/spool/postfix` (the `postfix-queue` volume in compose).

## Application queue

A recipient is dispatchable when `state IN ('QUEUED','SCHEDULED','RETRYING') AND next_attempt_at <= now()`. Workers claim recipients with `FOR UPDATE SKIP LOCKED`, take a lease (`lease_owner`, `lease_expires_at`, default 120 s) and extend it every `LEASE_SECONDS/4` while a batch runs. Each worker serves the streams listed in `WORKER_STREAMS`. Run separate worker pools for `transactional` and `marketing` so marketing traffic can never starve transactional mail.

```sql
-- depth and oldest waiting recipient per stream (same query as the smtp_queue_depth gauge)
select stream, count(*), now() - min(next_attempt_at) as oldest
  from email_recipients
 where state in ('QUEUED','SCHEDULED','RETRYING') and next_attempt_at <= now()
 group by stream;

-- recipients whose hand-off outcome is unknown
select id, state, lease_owner, lease_expires_at, state_changed_at
  from email_recipients where state in ('DISPATCHING','DELIVERY_UNKNOWN');
```

Housekeeping: every mail-worker also deletes expired `email_idempotency_keys` (24 h TTL) every 10 minutes, at most 1,000 rows per pass, and immediately repeats the pass while a backlog remains.

Customers cancel unsent recipients with `POST /v1/emails/{id}/cancel`. That works only from `QUEUED`, `SCHEDULED` or `RETRYING`.

## Postfix queue

Run these inside the container: `docker compose exec postfix <cmd>`.

| Command | Use |
|---|---|
| `postqueue -p` | List the queue: ID, size, arrival time, sender, recipient, last deferral reason. |
| `postqueue -f` | Flush: retry every deferred message now. |
| `postqueue -i <QID>` | Retry one message now. |
| `postcat -q <QID>` | Show the queued message, including headers. Contains customer content, so access must be authorized. |
| `postsuper -h <QID>` / `-H <QID>` | Hold or release a message. |
| `postsuper -d <QID>` | Delete a message. **This is not reflected in application state** (see below). |
| `postsuper -r ALL` | Requeue everything, for example after a transport change. |

### Relation to application state

* The queue ID of a recipient is `email_recipients.mta_queue_id`, also stored in `mta_queue_messages`.
* Postfix-side actions are observed **only through the log**. A delivery after `postqueue -f` updates state normally.
* Deleting with `postsuper -d` produces no `status=` line, so the recipient stays `MTA_ACCEPTED` or `DEFERRED` indefinitely. If you must delete, record the decision and move the recipient to `FAILED` through a controlled SQL update with an audit-log entry. No admin endpoint exists for this yet.
* Messages from Postfix itself (`from=<>`, its own DSNs) are not platform mail and are ignored by the reconciler.

## Persistence

The compose volume `postfix-queue` keeps the queue across container restarts. In production the spool must live on durable storage per MTA node. Losing it loses every message in `MTA_ACCEPTED`/`DEFERRED`, which the platform cannot detect. MTA node failover and high availability are not built.
