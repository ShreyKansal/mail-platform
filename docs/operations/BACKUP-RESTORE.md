# Backup and restore

**Status:** requirements are defined below. **No backup automation or restore drill exists yet.**

## What must be backed up

| Asset | Where | Consequence of loss |
|---|---|---|
| PostgreSQL | All tenant data, delivery records, sealed DKIM keys, sealed webhook secrets, audit log | Total loss of platform state. Use managed PITR (target RPO ≤ 5 min). |
| `ENCRYPTION_KEYS` (every key ID still referenced) | Secret manager | **Every DKIM private key and webhook secret becomes unreadable.** Mail for affected domains fails with "could not be composed or signed", and customers would have to re-verify domains with new keys. Back it up separately from the database, with restricted access. |
| `VERP_SECRET` | Secret manager | Bounces for mail already sent are rejected (the HMAC no longer matches), so bounce correlation and suppression for in-flight mail is lost. Sending itself isn't affected. |
| Postfix spool (`/var/spool/postfix`) per MTA node | Durable volume | Messages in `MTA_ACCEPTED`/`DEFERRED` are lost and their recipients never reach a terminal state. Snapshot the volume; persistent volumes are the minimum. |
| `maillog_file` | MTA node | Unprocessed lines lose state transitions. Keep at least as long as the reconciler could lag, and longer for audit. |
| Redis | — | Only rate-limit and throttle counters. Not needed. |
| Dashboard and images | Registry / CI | Rebuildable. |

## Restore procedure (manual)

1. Restore PostgreSQL to a point in time.
2. Restore the matching `ENCRYPTION_KEYS` and `VERP_SECRET`.
3. Start Postfix nodes with their spool volumes.
4. Reset the reconciler's checkpoint only if the log file changed: `delete from worker_checkpoints where name='postfix-log'` re-reads the current file from the start. Event dedupe keys tolerate duplicate lines from the same file identity.
5. Start the workers. Recipients left `DISPATCHING` or `DELIVERY_UNKNOWN` are resolved by `reconcileUncertain()` ([RETRY-SEMANTICS](../smtp/RETRY-SEMANTICS.md)).

Targets to adopt and then prove with a drill: RPO 5 minutes, RTO 1 hour for the control plane. These are not yet verified.
