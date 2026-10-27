# SMTP troubleshooting

| Symptom | Likely cause | Check / fix |
|---|---|---|
| Recipients stuck in `QUEUED` | mail-worker not running, or it serves other streams | Worker log `mail-worker started` and its `streams`; `smtp_queue_depth` |
| Many `RETRYING`, worker logs `MTA hand-off failed` with `ECONNECTION` | Postfix down, or `MTA_HOST`/`MTA_PORT` wrong | `docker compose ps postfix`; `nc -z $MTA_HOST $MTA_PORT` |
| Hand-off rejected `554 5.7.1 … Client host rejected` | Worker IP not in `mynetworks` | `postconf mynetworks`; set `MTA_TRUSTED_NETWORKS` |
| Recipients stay `MTA_ACCEPTED`, never `REMOTE_ACCEPTED` | Reconciler not running, or reading the wrong file | Reconciler log; `select * from worker_checkpoints`; compare `POSTFIX_LOG_PATH` with the bind mount |
| `DELIVERY_UNKNOWN` does not resolve | Reconciler heartbeat stale (more than 60 s) | [RUNBOOKS](../operations/RUNBOOKS.md#stuck-delivery_unknown) |
| `DEFERRED` with `connect to …: Connection timed out` | Port 25 egress blocked | Test from the node: `nc -vz <mx> 25`. Fix with the network or provider; this is not a platform bug. |
| `DEFERRED` 4.7.x "TLS is required" | Receiver requires TLS and negotiation failed | `smtp_tls_loglevel` lines in maillog; `smtp_tls_failures_total` |
| `BOUNCED` 5.7.26 / 5.7.25 | DMARC/SPF failure or missing PTR at the receiver | Domain DNS status; [PTR-RDNS](../deliverability/PTR-RDNS.md) |
| Bounce processor logs nothing for bounced mail | Port 2525 not reachable from Postfix | maillog shows `relay=host.docker.internal… Connection refused`. Start the bounce processor. On Linux Docker, bind `0.0.0.0` (`BOUNCE_HOST`). |
| SMTP client: `530 Authentication required` | Client didn't AUTH | Configure SMTP AUTH |
| SMTP client: AUTH not offered on 587 | STARTTLS not negotiated | Enable STARTTLS / `requireTLS` in the client |
| SMTP client: `454 4.7.0 Too many failed authentication attempts` | 10 failures in 10 minutes from the IP | Wait or clear `smtp-auth-fail:<ip>` in Redis after verifying it's legitimate |
| SMTP client: `550 5.6.0 the To header must list …` | BCC-only message | Put at least one envelope recipient in `To` |
| SMTP client: `451 4.7.1 … limit` | Tenant quota | `GET /v1/overview` (`used_last_24h`, `daily_limit`) |

Useful commands:

```sh
tail -f .data/postfix-log/maillog | grep -E 'status=|reject'
docker compose exec postfix postqueue -p
docker compose logs mx-simulator --tail 50
```

Never put message bodies or credentials into tickets. Use email IDs, recipient IDs, queue IDs and request IDs instead.
