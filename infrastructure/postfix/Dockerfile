# Outbound MTA. Postfix owns SMTP-to-MX transport, queueing and retries.
# The application hands messages to it on the internal port 10025 only.
FROM debian:bookworm-20250520-slim

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends postfix ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY main.cf /etc/postfix/main.cf
COPY master.cf /etc/postfix/master.cf
COPY entrypoint.sh /usr/local/bin/postfix-entrypoint
RUN chmod 0755 /usr/local/bin/postfix-entrypoint && mkdir -p /var/log/postfix

EXPOSE 10025 10026
# Quiet check (`postfix status` would write to the maillog the reconciler parses):
# the master process is alive and the internal listener accepts connections.
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD kill -0 "$(cat /var/spool/postfix/pid/master.pid)" && timeout 2 bash -c '</dev/tcp/127.0.0.1/10025' || exit 1
ENTRYPOINT ["/usr/local/bin/postfix-entrypoint"]
