# Monitoring

Every process exposes Prometheus metrics (prom-client, including Node.js default metrics) on an **internal** port: API 9100, mail-worker 9101, reconciler 9102, bounce-processor 9103, webhook-dispatcher 9104, domain-verifier 9105, smtp-submission 9106. The bind address is `METRICS_HOST`: it defaults to `127.0.0.1`, and the application images set `0.0.0.0` so Prometheus can scrape the containers. Keep these ports off public networks; they're unauthenticated. Workers also serve `/healthz`. The API serves `/healthz` (liveness) and `/readyz` (Postgres and Redis) on its main port.

**Not yet provided:** Grafana dashboards, Alertmanager rules, OpenTelemetry tracing, Loki configuration. The alert suggestions below are recommendations; they aren't deployed.

## Metrics

Labels are deliberately low-cardinality. There is never an org, domain, address or message-ID label.

| Metric | Type | Labels | Emitted by |
|---|---|---|---|
| `email_api_requests_total` | counter | `route` (template), `method`, `status_class` | api |
| `email_api_errors_total` | counter | `code` | api |
| `email_accepted_total` | counter | `source` (`api`/`smtp`) | api, smtp-submission |
| `email_rejected_total` | counter | `reason` (error code; `smtp_permanent`/`smtp_temporary` for SMTP protocol-level refusals) | api, smtp-submission |
| `tenant_sending_limit_exceeded_total` | counter | `kind` (`quota_exceeded`/`rate_limited`) | api, smtp-submission |
| `email_queued_total` | counter | `stream` | mail-worker (on MTA_ACCEPTED) |
| `email_dispatch_latency_seconds` | histogram | — | mail-worker (admission → MTA hand-off; platform-side) |
| `smtp_connection_failures_total` | counter | — | mail-worker (hand-off connection failures) |
| `dkim_signing_failures_total` | counter | — | mail-worker |
| `smtp_queue_depth` | gauge | `stream` | mail-worker (every 15 s) |
| `smtp_queue_oldest_message_age` | gauge (s) | `stream` | mail-worker |
| `email_remote_accepted_total` | counter | — | reconciler |
| `email_deferred_total` | counter | — | reconciler |
| `smtp_tls_failures_total` | counter | — | reconciler (deferrals classified `tls_failure`) |
| `email_delivery_latency_seconds` | histogram | — | reconciler (admission → remote acceptance; includes time controlled by the destination) |
| `email_bounced_total` | counter | `class` | reconciler, bounce-processor |
| `webhook_delivery_failures_total` | counter | `reason` (`http_status`/`transport`) | webhook-dispatcher |
| `domain_dns_verification_failures_total` | counter | `purpose`, `status` | api, domain-verifier |
| `postfix_log_reconciler_lag_bytes` | gauge | — | reconciler (unread bytes of the Postfix log) |
| `postfix_log_reconciler_watermark_age_seconds` | gauge (s) | — | reconciler (0 when fully caught up) |

## Suggested alerts

| Alert | Expression (sketch) | Why |
|---|---|---|
| Dispatch backlog | `smtp_queue_oldest_message_age{stream="transactional"} > 120` for 5 m | Workers down or MTA unreachable |
| MTA hand-off failing | `rate(smtp_connection_failures_total[5m]) > 0` for 5 m | Postfix down or network |
| Signing failures | `increase(dkim_signing_failures_total[10m]) > 0` | Key or encryption-key problem ([RUNBOOKS](RUNBOOKS.md#dkim-decrypt-failure)) |
| Bounce spike | `sum(rate(email_bounced_total{class=~"mailbox_unavailable|domain_invalid"}[15m])) / rate(email_remote_accepted_total[15m]) > 0.05` | List quality or abuse |
| Policy rejections | `rate(email_bounced_total{class=~"policy_rejected|authentication_rejected"}[15m]) > …` | Reputation or authentication problem |
| Webhook failures | `rate(webhook_delivery_failures_total[15m])` high | Customer endpoint or egress problem |
| API errors | `rate(email_api_errors_total{code="internal_error"}[5m]) > 0` | Bugs or dependencies |
| Reconciler lagging | `postfix_log_reconciler_lag_bytes > 1e6` for 5 m, or `postfix_log_reconciler_watermark_age_seconds > 120` | Delivery states freeze; uncertain hand-offs can't be resolved |
| Reconciler down | `up{job="delivery-reconciler"} == 0` (or `worker_checkpoints.heartbeat_at` older than 60 s) | Same as above |
