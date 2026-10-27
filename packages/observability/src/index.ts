import { createServer, type Server } from 'node:http';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Platform metrics. Labels are deliberately low-cardinality: never label by
 * org id, address, domain or message id (see docs/operations/MONITORING.md).
 */
export const registry = new Registry();
collectDefaultMetrics({ register: registry });

const counter = (name: string, help: string, labelNames: string[] = []) =>
  new Counter({ name, help, labelNames, registers: [registry] });

export const metrics = {
  apiRequests: counter('email_api_requests_total', 'API requests', ['route', 'method', 'status_class']),
  apiErrors: counter('email_api_errors_total', 'API error responses', ['code']),
  emailAccepted: counter('email_accepted_total', 'Recipients durably admitted', ['source']),
  emailQueued: counter('email_queued_total', 'Recipients handed to the MTA (MTA_ACCEPTED)', ['stream']),
  remoteAccepted: counter('email_remote_accepted_total', 'Recipients accepted by the remote MX'),
  deferred: counter('email_deferred_total', 'Temporary remote failures (Postfix will retry)'),
  bounced: counter('email_bounced_total', 'Permanent failures', ['class']),
  rejected: counter('email_rejected_total', 'Recipients rejected at admission', ['reason']),
  smtpConnectionFailures: counter('smtp_connection_failures_total', 'Failures connecting to the MTA hand-off port'),
  smtpTlsFailures: counter('smtp_tls_failures_total', 'Outbound TLS negotiation failures'),
  webhookFailures: counter('webhook_delivery_failures_total', 'Failed webhook delivery attempts', ['reason']),
  webhookAutoDisabled: counter('webhook_auto_disabled_total', 'Webhook endpoints disabled after sustained failures'),
  dnsVerificationFailures: counter('domain_dns_verification_failures_total', 'DNS checks that did not pass', ['purpose', 'status']),
  dkimSigningFailures: counter('dkim_signing_failures_total', 'Messages that could not be composed or signed'),
  tenantLimitExceeded: counter('tenant_sending_limit_exceeded_total', 'Admissions refused by tenant quota', ['kind']),
  queueDepth: new Gauge({
    name: 'smtp_queue_depth',
    help: 'Recipients waiting for application dispatch',
    labelNames: ['stream'],
    registers: [registry],
  }),
  queueOldestAge: new Gauge({
    name: 'smtp_queue_oldest_message_age',
    help: 'Age in seconds of the oldest dispatchable recipient',
    labelNames: ['stream'],
    registers: [registry],
  }),
  reconcilerLagBytes: new Gauge({
    name: 'postfix_log_reconciler_lag_bytes',
    help: 'Unprocessed bytes in the Postfix log (should stay near 0)',
    registers: [registry],
  }),
  reconcilerWatermarkAge: new Gauge({
    name: 'postfix_log_reconciler_watermark_age_seconds',
    help: 'Age of the newest Postfix log position the reconciler has fully processed',
    registers: [registry],
  }),
  deliveryLatency: new Histogram({
    name: 'email_delivery_latency_seconds',
    help: 'Admission to remote acceptance (includes destination-controlled time)',
    buckets: [1, 5, 15, 60, 300, 900, 3600, 4 * 3600, 24 * 3600],
    registers: [registry],
  }),
  dispatchLatency: new Histogram({
    name: 'email_dispatch_latency_seconds',
    help: 'Admission to MTA hand-off (platform-side latency only)',
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 300],
    registers: [registry],
  }),
};

export const statusClass = (status: number): string => `${Math.floor(status / 100)}xx`;

/**
 * Serves /metrics and /healthz on an internal port. Binds to METRICS_HOST
 * (default loopback); containers set 0.0.0.0 so Prometheus can scrape them,
 * and the port must stay off the public network.
 */
export function startMetricsServer(
  port: number,
  host = process.env.METRICS_HOST ?? '127.0.0.1',
  health: () => Promise<boolean> = async () => true,
): Server {
  const server = createServer(async (req, res) => {
    if (req.url === '/metrics') {
      res.setHeader('content-type', registry.contentType);
      res.end(await registry.metrics());
      return;
    }
    if (req.url === '/healthz') {
      const ok = await health().catch(() => false);
      res.statusCode = ok ? 200 : 503;
      res.end(ok ? 'ok' : 'unhealthy');
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  server.listen(port, host);
  return server;
}
