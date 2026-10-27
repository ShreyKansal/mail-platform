# Roadmap

Work is ordered by dependency and by the risk it removes. Every item ships only when it meets the definition of done: UI, backend, persistence, authorization, validation, tests, docs and metrics. Current status is in [FEATURE-MATRIX.md](FEATURE-MATRIX.md).

## Current product foundations

Implemented templates, published versions and sending, project contacts with unsubscribe-preserving JSON import, and a Settings entry for team information and renaming. These are partial product areas, not complete marketing/account parity. See [foundation APIs](../api/PRODUCT-FOUNDATIONS.md).

Next dependencies: property definitions, segments, topics and signed preference links; then broadcast lifecycle/reporting; durable automation execution; inbound routing/storage and inbox workflows. Account verification, recovery, invitations and security remain open.

## Next: finish Milestone 1

1. **Signup email verification.** Use the platform's own sending path with a platform-owned domain. This is a prerequisite for opening public registration.
2. **Member invitations and multiple workspaces/projects,** including a project switcher in the dashboard.
3. **Batch 1 implemented:** resumable background email exports, DNS-gated DKIM rotation with seven-day overlap, webhook endpoint health and signed test events, plus deterministic delivery simulations. Validation and limits are recorded in the ledger.
4. **Usage and analytics scaling.** `/v1/usage` and `/v1/analytics` now compute daily UTC series from stored records; add materialized daily rollups as volume grows.
5. **Remaining notification and export parity.** Team email alerts, export completion emails, member metadata visibility and exports for other resource types.

## Milestone 2: deliverability and BIMI

- IP pools: several Postfix transports bound to different source IPs, selected per stream or tenant via `sender_dependent_default_transport_maps`; warmup schedules; per-provider concurrency.
- ARF complaint ingestion through the bounce MX, plus complaint-rate risk scoring and automatic suppression.
- BIMI: record generation, SVG Tiny P/S validation, VMC/CMC import with chain and domain checks, and an eligibility engine using existing DMARC parsing.
- Platform admin console: organization review, tier changes, suspension, queue inspection.

## Milestone 3: enterprise operations

- TOTP and WebAuthn MFA, then SAML and OIDC SSO, then SCIM.
- Billing: plans, idempotent metering from accepted recipients, invoices, and a payment gateway integration.
- Kubernetes manifests and Terraform modules; Grafana dashboards and alert rules for the metrics already exported.
- Partitioning of event tables and configurable content retention.

## Milestones 4–6

Marketing (contacts, segments, campaigns, RFC 8058 one-click unsubscribe, templates and editor), inbound routing, SDKs generated from the OpenAPI contract, a CLI, the Docusaurus docs site, then load, penetration and disaster-recovery exercises.

## External prerequisites (not code)

These block production delivery regardless of code progress:

- Static public IPv4 addresses for outbound MTA nodes, with PTR records matching the HELO name (forward-confirmed reverse DNS).
- Outbound TCP 25 permitted by the hosting provider.
- DNS control for the platform's domains: bounce domain, `_spf` include, bounce MX host, API and SMTP hostnames.
- TLS certificates for the API, dashboard, SMTP submission and bounce MX.
- Legal review of terms, acceptable-use policy, privacy notices (GDPR, DPDP) and anti-spam obligations before public launch.

## Resend parity delivery order

The [audit](RESEND-PARITY-AUDIT.md) covers all 425 indexed source pages and preserves duplicate tutorial references in the CSV. Section-level review items still require detailed normative review. No automatic static classification counts as a verified match.

1. **Transactional completion — in progress.** Implemented: guarded rescheduling; date/key/source/text filters; CID and remote attachments with retrieval; expiring/revocable shares; bounded CSV; authenticated API metadata logs; daily metrics; webhook replay/history; suppression batch/read/filter operations; key rename; per-domain TLS. Remaining: multi-resource exports and completion emails, complaint/FBL ingestion, configurable tracking hosts and click/open events, richer deliverability insights, self-service domain claims, natural-language scheduling, complaint and plus-label test scenarios, and exhaustive limit/error/permission parity review. See [transactional additions](../api/TRANSACTIONAL-PARITY.md).
2. **Account foundations — not implemented in this change.** Email verification/recovery, invitation acceptance, multiple teams/projects and switching, MFA/recovery codes, SSO, deletion and configurable content retention. Existing sessions, RBAC and tenant RLS remain the foundation.
3. **Templates and marketing — not implemented.** Versioned/published templates and variables, editor, contacts/properties/import jobs, segments/topics/preferences, unsubscribe pages, broadcast scheduling/cancel/reporting. All must use the existing admission/outbox path and suppression checks.
4. **Automations — not implemented.** Typed custom events, durable workflow versions, triggers, conditions, delay/event waits, templated email/contact actions and run histories. Depends on phase 3; workers must resume safely after restarts and deduplicate triggers/actions.
5. **Receiving and inboxes — not implemented.** Inbound MX, message/attachment access, forwarding/replies, threading/search, labels, assignment, drafts and draft-first inbox assistance. Depends on public MX/certificates plus safe content storage and tenant ownership checks.
6. **Infrastructure and ecosystem — not implemented.** Regional MTA/checkpoint design, dedicated IPs and warmup, reputation controls, billing/metering, SDKs, CLI, MCP and provider integrations. Provider contracts, production IPs/DNS/TLS and commercial onboarding are external dependencies, not features that can be declared implemented by adding configuration fields.

Each feature ships only with backend/persistence, permissions and tenant isolation, applicable UI, failure behavior, tests, docs and operational visibility. Existing `/v1` clients and explicit remote-acceptance meanings remain stable. Do not remove stronger existing defaults merely to reproduce a provider limitation.
