# MAIL_PLATFORM documentation

These pages describe the code as it is implemented. Features that are not built yet are listed in the [feature matrix](product/FEATURE-MATRIX.md) rather than documented as if they worked.

## Start here

| If you are… | Read |
| --- | --- |
| Sending email from an application | [Quickstart](developer-guides/QUICKSTART.md) → [API overview](api/OVERVIEW.md) |
| Setting up a domain in the dashboard | [Verify a domain](help/VERIFY-DOMAIN.md) → [DNS setup](help/DNS-SETUP.md) |
| Joining the engineering team | [System overview](architecture/SYSTEM-OVERVIEW.md) → [Local development](operations/LOCAL-DEVELOPMENT.md) |
| Operating the platform | [Production deployment](operations/PRODUCTION-DEPLOYMENT.md) → [Runbooks](operations/RUNBOOKS.md) |

## Product

The [Resend parity audit](product/RESEND-PARITY-AUDIT.md), [CSV](product/RESEND-PARITY-AUDIT.csv) and [validation ledger](product/RESEND-PARITY-VALIDATION.md) distinguish indexed coverage from verified behavior. See [transactional additions](api/TRANSACTIONAL-PARITY.md) for the new API and dashboard capabilities.

[Template/contact APIs](api/PRODUCT-FOUNDATIONS.md) ? [Feature matrix](product/FEATURE-MATRIX.md) · [Roadmap](product/ROADMAP.md)

## Architecture

Dashboard design: [ADS element catalog](design/ATLASSIAN-CATALOG.md), [implementation rules](design/IMPLEMENTATION.md), [machine-readable elements](design/ads-elements.json), [CSV](design/ads-elements.csv), [installed token inventory](design/ads-tokens.json), and [source coverage ledger](design/ads-source-inventory.json).

[System overview](architecture/SYSTEM-OVERVIEW.md) · [Message lifecycle](architecture/MESSAGE-LIFECYCLE.md) · [Queue design](architecture/QUEUE-DESIGN.md) · [Event model](architecture/EVENT-MODEL.md) · [Database schema](architecture/DATABASE-SCHEMA.md) · [Tenant isolation](architecture/TENANT-ISOLATION.md) · [Failure modes](architecture/FAILURE-MODES.md) · [Architecture decision records](architecture/ADR/README.md)

## API reference

[Overview](api/OVERVIEW.md) · [Authentication](api/AUTHENTICATION.md) · [Errors](api/ERRORS.md) · [Rate limits](api/RATE-LIMITS.md) · [Idempotency](api/IDEMPOTENCY.md) · [Emails](api/EMAILS.md) · [Domains](api/DOMAINS.md) · [API keys](api/API-KEYS.md) · [SMTP credentials](api/SMTP-CREDENTIALS.md) · [Webhooks](api/WEBHOOKS.md) · [Suppressions](api/SUPPRESSIONS.md) · [OpenAPI](api/OPENAPI.md) ([openapi.json](api/openapi.json); interactive at `/docs` on a running API)

## Developer guides

[Quickstart](developer-guides/QUICKSTART.md) · [Sending your first email](developer-guides/SENDING-FIRST-EMAIL.md) · [SMTP integration](developer-guides/SMTP-INTEGRATION.md) · [Webhook verification](developer-guides/WEBHOOK-VERIFICATION.md) · [Attachments](developer-guides/ATTACHMENTS.md) · [Scheduled emails](developer-guides/SCHEDULED-EMAILS.md)

## Help centre

[Verify a domain](help/VERIFY-DOMAIN.md) · [DNS setup](help/DNS-SETUP.md) · [API keys](help/API-KEYS.md) · [SMTP credentials](help/SMTP-CREDENTIALS.md) · [Send your first email](help/SEND-FIRST-EMAIL.md) · [View delivery logs](help/VIEW-DELIVERY-LOGS.md) · [Email not delivered](help/EMAIL-NOT-DELIVERED.md) · [Email in spam](help/EMAIL-IN-SPAM.md) · [FAQ](help/FAQ.md)

## SMTP and Postfix

[Postfix architecture](smtp/POSTFIX-ARCHITECTURE.md) · [SMTP submission](smtp/SMTP-SUBMISSION.md) · [SMTP to MX](smtp/SMTP-TO-MX.md) · [Retry semantics](smtp/RETRY-SEMANTICS.md) · [DSN and bounce handling](smtp/DSN-BOUNCE-HANDLING.md) · [Queue management](smtp/QUEUE-MANAGEMENT.md) · [Troubleshooting](smtp/SMTP-TROUBLESHOOTING.md)

## Deliverability

[SPF](deliverability/SPF.md) · [DKIM](deliverability/DKIM.md) · [DMARC](deliverability/DMARC.md) · [Custom Return-Path](deliverability/CUSTOM-RETURN-PATH.md) · [Sending subdomains](deliverability/SENDING-SUBDOMAINS.md) · [PTR / rDNS](deliverability/PTR-RDNS.md) · [Bounces](deliverability/BOUNCES.md) · [Suppression](deliverability/SUPPRESSION.md) · [Troubleshooting](deliverability/DELIVERABILITY-TROUBLESHOOTING.md)

## Operations

[Local development](operations/LOCAL-DEVELOPMENT.md) · [Docker](operations/DOCKER.md) · [Production deployment](operations/PRODUCTION-DEPLOYMENT.md) · [Monitoring](operations/MONITORING.md) · [Logging](operations/LOGGING.md) · [Security hardening](operations/SECURITY-HARDENING.md) · [Backup and restore](operations/BACKUP-RESTORE.md) · [Runbooks](operations/RUNBOOKS.md)

## Security

[Threat model](security/THREAT-MODEL.md) · [RBAC](security/RBAC.md) · [API security](security/API-SECURITY.md) · [Key management](security/KEY-MANAGEMENT.md) · [Tenant security](security/TENANT-SECURITY.md) · [Abuse prevention](security/ABUSE-PREVENTION.md) · [Privacy](security/PRIVACY.md) · [Compliance](security/COMPLIANCE.md)

## Testing

[Test strategy](testing/TEST-STRATEGY.md) · [SMTP testing](testing/SMTP-TESTING.md) · [Security tests](testing/SECURITY-TESTS.md) · [Acceptance tests](testing/ACCEPTANCE-TESTS.md)
