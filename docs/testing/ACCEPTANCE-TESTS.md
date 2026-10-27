# Acceptance tests

Mapping of the specification's final acceptance criteria (Part 25) to automated tests. The specification supplied for this project was truncated in the middle of Test F; **criteria after Test F (G onwards) were not received** and aren't mapped.

| Spec test | Requirement | Proven by | Notes |
|---|---|---|---|
| **A** Customer onboarding | Account, workspace, own domain added | `tests/support/harness.ts#createAccount` (signup creates org, workspace, project and owner membership); `delivery.test.ts` "Test A/B" | Workspace UI or API for extra workspaces isn't built; one default workspace and project per organization |
| **B** DNS authentication | SPF guidance, DKIM records, Return-Path, DMARC diagnostics | `delivery.test.ts` "generates ownership, DKIM, return-path and DMARC records…", "verifies a fully configured domain…" | Uses fixture DNS. `NodeDnsClient` and authoritative lookups against public DNS have no automated test |
| **C** Independent delivery | REST API → own Postfix → recipient MX; no third-party provider | `delivery.test.ts` "delivers through Postfix to the remote MX with an aligned, valid DKIM signature and VERP return path" | The "remote MX" is the local simulator or Mailpit. **Delivery to real Internet MX hosts is blocked** on public IPs, PTR and port 25 ([PTR-RDNS](../deliverability/PTR-RDNS.md)) |
| **D** SMTP authentication | Scoped SMTP credentials via an SMTP client | `smtp/submission.test.ts` (STARTTLS and implicit TLS, revocation) | |
| **E** Bounce processing | Remote failure or DSN recorded; suppression applied | `delivery.test.ts` "records a 550 5.1.1 rejection as a hard bounce…", "does not suppress on policy rejections", greylisting case | Both log and DSN sources exercised |
| **F** Webhook dispatch | Signed webhooks received (the spec text was cut off here) | `delivery.test.ts` "delivers signed events that verify with the endpoint secret, and retries failures" | |

Run: `pnpm dev:infra && pnpm test:integration`. The last local run passed 34/34 integration tests.
