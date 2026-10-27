# SMTP testing

## Infrastructure

* **Postfix** (the real MTA image) with `RELAYHOST=[mailpit]:1025`, a 10-minute queue lifetime and 15 s backoff.
* **MX simulator** (`infrastructure/docker/mx-simulator/server.mjs`), reached for `@mx-sim.test`. Behaviour depends on the local-part prefix:

| Prefix | Behaviour | Exercises |
|---|---|---|
| `accept` | 250 | remote acceptance |
| `unknown` | 550 5.1.1 at RCPT | hard bounce, suppression, Postfix DSN path |
| `policy` | 550 5.7.1 | non-suppressing permanent rejection |
| `full` | 452 4.2.2 | repeated deferral until expiry |
| `defer` | 451 4.7.1 for `GREYLIST_SECONDS`, then accepted | greylisting with MTA-owned retries |
| `datafail` | 554 5.6.0 after DATA | content rejection |

* **Mailpit** captures relayed mail. Its API (`/api/v1/search`, `/api/v1/message/{id}/raw`) is used to verify the delivered bytes, including DKIM.

## Cases

| Behaviour | Test |
|---|---|
| STARTTLS submission + AUTH → delivered; BCC from the envelope only | `smtp/submission.test.ts` "accepts mail over STARTTLS…" |
| Implicit TLS | "accepts mail over implicit TLS" |
| No open relay (`530` without AUTH) | "is not an open relay" |
| No AUTH before TLS | "never offers AUTH before TLS" |
| Bad credentials → `535` | "rejects bad credentials" |
| Unverified `From` → `550` | "rejects From addresses outside the verified domains" |
| Revocation takes effect | "stops accepting a credential as soon as it is revoked" |
| DKIM valid after Postfix, VERP Return-Path, `Feedback-ID` | `integration/delivery.test.ts` Test C |
| 5xx handling, DSN dedupe | Test E |
| 4xx / greylisting, Postfix retries, a single hand-off | Test E greylisting |
| Hand-off error taxonomy (crash and timeout points) | `mail-worker/src/mta.test.ts` |

## Not covered yet

* SMTPUTF8 end to end.
* Queue persistence across Postfix restarts.
* Process kill during DATA (the `DELIVERY_UNKNOWN` path is unit-tested at the classification level; reconciliation is exercised only indirectly).
* Receiver TLS failures.
* Timeouts against a slow remote.
