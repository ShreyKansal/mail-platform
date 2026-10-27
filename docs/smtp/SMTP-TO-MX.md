# SMTP-to-MX transport

**Purpose.** Explains how a message travels from the platform to a recipient's mail server, and what is and isn't implemented.

## Path

1. `mail-worker` composes and DKIM-signs the message once per email ([DKIM](../deliverability/DKIM.md)).
2. For each recipient it opens an SMTP transaction to Postfix `:10025` with `MAIL FROM:<VERP>` and a single `RCPT TO`. One recipient per transaction means one Postfix queue ID per recipient.
3. Postfix looks up the recipient domain's MX records, tries them in preference order (falling back to A when there is no MX), connects on port 25, sends `EHLO $myhostname`, uses STARTTLS when offered, and transfers the message.
4. The result appears in `maillog_file` as `status=sent|deferred|bounced`. The reconciler turns it into `REMOTE_ACCEPTED`, `DEFERRED` or `BOUNCED`.

`REMOTE_ACCEPTED` means the receiving MTA answered `250` to the end of DATA. **It is not inbox placement**, and the API, dashboard and webhooks never describe it as such.

## Implemented

| Capability | Where |
|---|---|
| MX resolution, preference ordering, A fallback | Postfix (`smtp_host_lookup = dns, native`) |
| IPv4 delivery | `inet_protocols = ipv4` |
| Opportunistic STARTTLS, TLS ≥ 1.2, CA bundle | `main.cf` |
| Enhanced status codes in results | Parsed by `parsePostfixLine` and `parseSmtpReply` |
| Retries after 4xx and connection failures | Postfix queue ([RETRY-SEMANTICS](RETRY-SEMANTICS.md)) |
| SMTPUTF8 transport | `smtputf8_enable = yes`. Note that the API currently rejects non-ASCII local parts. |
| Internationalized domains | The API converts them to A-labels (`domainToASCII`) before queueing. |

## Not yet built

These are blockers for production-grade sending:

* **Dedicated and shared IP pools.** No `smtp_bind_address`, no per-pool transports, no routing policy engine. Every message leaves from the node's default IP.
* **Per-provider concurrency and throttling** (Gmail, Microsoft and so on). Only `default_destination_concurrency_limit = 10` applies.
* **IP warm-up schedules** and reputation-based routing.
* **IPv6 sending**. It's disabled deliberately until PTR and authentication have been validated for v6.
* **MTA-STS / DANE enforcement and TLS-RPT.**
* **Port 25 egress.** Many cloud and residential networks block it. Production nodes need verified outbound port-25 access, static public IPs and PTR records ([PTR-RDNS](../deliverability/PTR-RDNS.md)).

## Development routing

`docker-compose.yml` sets `RELAYHOST=[mailpit]:1025`, so **no development mail reaches the Internet**. Every external recipient lands in Mailpit at <http://localhost:8025>. Recipients `@mx-sim.test` go to the scriptable MX simulator instead.

## Verification

```sh
grep 'status=' .data/postfix-log/maillog | tail
docker compose exec postfix postqueue -p
```
