#!/bin/sh
# Applies environment-specific Postfix settings, then runs Postfix in the foreground.
#
#   MTA_HOSTNAME            HELO name; must equal the outbound IP's PTR in production.
#   MTA_TRUSTED_NETWORKS    CIDRs allowed to submit on :10025 (application network only).
#   RELAYHOST               Optional smarthost. Set ONLY in local/staging to capture mail.
#   BOUNCE_PROCESSOR_HOST   Where VERP-addressed DSNs are routed.
#   BOUNCE_PROCESSOR_PORT   Default 2525.
#   MX_SIMULATOR            Optional host:port; routes *@mx-sim.test there (non-production).
#   MAXIMAL_QUEUE_LIFETIME  Optional override (e.g. 10m in tests).
set -eu

: "${BOUNCE_PROCESSOR_HOST:?BOUNCE_PROCESSOR_HOST is required}"

postconf -e "myhostname=${MTA_HOSTNAME:-mta.mail-platform.test}"
postconf -e "mynetworks=127.0.0.0/8 ${MTA_TRUSTED_NETWORKS:-}"

if [ -n "${RELAYHOST:-}" ]; then
  postconf -e "relayhost=${RELAYHOST}"
  # content_filter transport selection bypasses relayhost. Keep the enforced
  # listener captured locally too; production (no RELAYHOST) resolves remote MX.
  postconf -P "10026/inet/content_filter=smtp_enforced:${RELAYHOST}"
fi
if [ -n "${MAXIMAL_QUEUE_LIFETIME:-}" ]; then
  postconf -e "maximal_queue_lifetime=${MAXIMAL_QUEUE_LIFETIME}"
  postconf -e "bounce_queue_lifetime=${MAXIMAL_QUEUE_LIFETIME}"
fi
if [ -n "${MINIMAL_BACKOFF_TIME:-}" ]; then
  postconf -e "minimal_backoff_time=${MINIMAL_BACKOFF_TIME}"
  postconf -e "maximal_backoff_time=${MINIMAL_BACKOFF_TIME}"
  postconf -e "queue_run_delay=${MINIMAL_BACKOFF_TIME}"
fi

{
  echo "/^b\\+[a-z2-7]+-[a-z2-7]+@/ smtp:[${BOUNCE_PROCESSOR_HOST}]:${BOUNCE_PROCESSOR_PORT:-2525}"
  if [ -n "${MX_SIMULATOR:-}" ]; then
    echo "/@mx-sim\\.test\$/ smtp:[${MX_SIMULATOR%%:*}]:${MX_SIMULATOR##*:}"
  fi
} > /etc/postfix/transport_regexp

mkdir -p /var/log/postfix
cp /etc/resolv.conf /etc/hosts /var/spool/postfix/etc/ 2>/dev/null || true

postfix check
exec postfix start-fg
