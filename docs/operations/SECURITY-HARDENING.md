# Security hardening checklist

Applies to production deployments. Items marked **(code)** are enforced by the implementation; the rest are deployment duties.

## Network
- [ ] Only HTTPS (API/dashboard), 587/465 (submission) and 25 (bounce MX) are reachable from the Internet.
- [ ] Postgres, Redis, Postfix :10025 and every metrics port are private.
- [ ] Postfix `MTA_TRUSTED_NETWORKS` is the worker subnet only (the compose value is far too broad for production).
- [ ] Outbound mail-worker traffic goes only to Postfix. Webhook-dispatcher egress is allowed to the Internet but **not** to internal ranges at the firewall either, as defence in depth beside the code's SSRF guard.

## Application (verify settings)
- [ ] `NODE_ENV=production` **(code)**: rejects the fixture DNS file, insecure cookies and webhook relaxations.
- [ ] `ALLOW_PUBLIC_SIGNUP=false` until signup email verification and abuse review exist.
- [ ] `DASHBOARD_ORIGIN` is set exactly. CORS and the CSRF origin check rely on it **(code)**.
- [ ] TLS terminates in front of the API with HSTS. The API sets `nosniff` and `no-store` **(code)**.
- [ ] `trustProxy` is enabled only in production **(code)**. Make sure the proxy overwrites `X-Forwarded-For`.

## Data
- [ ] Runtime roles `mp_app` (NOBYPASSRLS) and `mp_service` are separate from the migration owner.
- [ ] `ENCRYPTION_KEYS` and `VERP_SECRET` come from a secret manager, never from images or git.
- [ ] Database storage and backups are encrypted at rest.
- [ ] Postfix spool volumes are encrypted (they hold message content).

## Images
- [ ] Images run as the non-root `node` user **(code)**.
- [ ] Rebuild regularly. Base images are pinned and must be bumped deliberately.
- [ ] `pnpm install --frozen-lockfile` **(code, in the Dockerfile and CI)**.

## Not yet implemented
MFA, WebAuthn, SSO, SCIM, session-management UI, Content-Security-Policy headers for the dashboard host, malware scanning of attachments, WAF rules, and secret-manager integration.
