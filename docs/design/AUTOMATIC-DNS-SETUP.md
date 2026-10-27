# Automatic DNS setup

The primary GoDaddy Auto configure path now uses signed Domain Connect authorization when provider onboarding is configured. The key/secret implementation below is retained under **API credentials (advanced)**. See [Domain Connect onboarding](../integrations/domain-connect/README.md) for the prepared `www.mailer.mymorphix.com` identity, template and outstanding provider approval. Live Domain Connect is disabled until onboarding and key publication are complete.

Implemented 26 October 2026 for GoDaddy and Cloudflare. Manual DNS records, copying and downloadable text instructions are available for other providers. The feature adds the platform's existing expected DNS records; it does not register domains or change nameservers.

## User flow and permissions

Create a sending domain, choose automatic setup, enter GoDaddy production key/secret credentials (optionally the root domain) or a Cloudflare API token (optionally a Zone ID), and preview the exact changes. The closest accessible active zone is selected automatically when no ID is supplied. A supplied zone must contain the domain and all requested hostnames. The caller needs `domains:manage`; organization, project and restricted-domain API-key boundaries are enforced before contacting the provider. Disabled domains cannot use setup.

Use a Cloudflare token restricted to the relevant zone, with Zone Read and DNS Edit permissions (DNS read access is needed for inspection). Global API keys are not supported. Tokens exist only in the current request. They are never persisted in the database, returned in responses or placed in audit metadata. Logging redacts `api_token` fields; provider errors are replaced with fixed messages so echoed tokens cannot escape.

## Preview and apply

- `POST /v1/domains/:id/dns-setup/preview` accepts `{provider:"cloudflare",api_token,zone_id?,include_dmarc?:false}` and returns zone, expected records, create/existing/conflict classifications, a signed plan and expiration.
- Ownership, DKIM and custom return-path MX/SPF records are included. DMARC is opt-in and never replaces an existing policy. Existing identical records are skipped. Conflicting or duplicate SPF, MX, DKIM, ownership or DMARC records are left for manual resolution. CNAME and delegated NS hostnames are never modified.
- `POST /v1/domains/:id/dns-setup/apply` takes the same inputs plus `plan_token`. The ten-minute HMAC plan binds organization, project, domain, selected zone, DMARC choice and record classifications. Apply re-reads the provider and rejects changed plans before writing. It checks each hostname once more immediately before creating a record.
- Only Cloudflare `POST` creation and GoDaddy `PATCH` append are implemented. There are no overwrite, update or delete calls. MX priority is preserved and TTL is Cloudflare automatic or 600 seconds for GoDaddy. Records are created as DNS records without enabling proxying.
- Concurrent application through this service is serialized by a nonce-protected Redis lock. Coordination failure fails closed. Network operations use fixed HTTPS Cloudflare and GoDaddy origins, reject redirects and have bounded timeouts. There is no user-supplied provider URL or credential-bearing callback.
- Partial failures return per-record outcomes and counts. A fresh preview discovers already-created records so retries do not intentionally duplicate them. Changes made independently in Cloudflare during the final create interval cannot be made transactionally atomic across services; the feature never overwrites conflicting values. Review provider state after an uncertain connection failure.
- Creating records does not mark the domain verified. The existing DNS verifier remains authoritative; propagation can take time. Root MX/inbound routing, external-provider setup and domain registration are outside this flow.

## Verification and references

Provider tests use an in-memory Cloudflare mock and cover discovery, opt-in records, duplicate/conflict preservation, signed-plan tamper and project boundaries, drift, partial failures and last-moment conflict checks. Route tests cover manage permission declarations, tenant/project/domain-key scope, coordination locks and credential-free auditing. No external DNS changes were made during verification.

Final checks: 11 mocked provider tests and 9 API tests passed; core/API/dashboard typechecks, API/dashboard production builds, 32 dashboard tests and design audit passed. Both providers were checked in development and the production build at 1440px light, 390px/320px mobile, 1280px dark and increased contrast. The isolated browser fixtures covered domain creation, manual/automatic navigation, preview-before-apply, credential edits, failure recovery, partial results, token clearing, no browser storage, optional zone and DMARC inputs, downloads, verification actions and read-only permissions. Checked views had no page overflow, browser errors or Axe violations. Screenshots are in `.data/ui-check/domain-godaddy-preview-*` and `domain-setup-*`. This validates mocked provider behavior; live account eligibility and real DNS publication require the user's provider credentials.

Official API references checked on 26 October 2026: [List zones](https://developers.cloudflare.com/api/resources/zones/methods/list/), [Create DNS record](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/create/). The implementation uses API-token bearer authentication and the documented zone discovery/record creation endpoints.

## GoDaddy adapter

Use `{provider:"godaddy",api_key,api_secret,zone_id?:"example.com",include_dmarc?:false}`. Production classic developer credentials are sent using `Authorization: sso-key key:secret` to the fixed `https://api.godaddy.com/v1` origin. Account domain discovery chooses the longest matching owned parent domain, then confirms active status and GoDaddy nameservers. An explicit root domain skips discovery. External nameservers produce a manual-setup explanation. Some accounts lack API eligibility; 401/403 returns a sanitized access message without echoing secrets.

Record reads paginate the zone and convert provider-relative names into full hostnames. Writes use only append-only `PATCH /v1/domains/{domain}/records`, converting hostnames back to relative names. Existing apex address records and all conflicting DNS records are preserved. The signed preview explicitly binds provider as well as zone and tenant. Both `api_key` and `api_secret` receive log redaction.

Official references checked 26 October 2026: [GoDaddy v1 authentication and scope](https://developer.godaddy.com/en/docs/references/rest/domains/v1), [append DNS records](https://developer.godaddy.com/en/docs/references/rest/domains/v1/record-add), [read DNS records](https://developer.godaddy.com/en/docs/references/rest/domains/v1/record-get). Classic `sso-key` remains documented for v1; this adapter uses it rather than a personal access token.
