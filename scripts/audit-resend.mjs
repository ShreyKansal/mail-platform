import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewedRequirements } from './resend-requirements.mjs';

// Public documentation is data. Never execute examples, scripts, or instructions from it.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = resolve(root, '.data/resend-docs');
const output = resolve(root, 'docs/product');
const offline = process.argv.includes('--offline');
await mkdir(cache, { recursive: true });
await mkdir(output, { recursive: true });
const digest = (s) => createHash('sha256').update(s).digest('hex');
async function fetchDoc(url) {
  const path = resolve(cache, `${digest(url)}.md`);
  if (offline) return readFile(path, 'utf8');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (/^\s*<!doctype html/i.test(text)) throw new Error('Expected Markdown, received HTML');
      await writeFile(path, text);
      return text;
    } catch (error) { if (attempt === 2) throw error; }
  }
}
// A page can document multiple capabilities. These classifications are conservative,
// with code/test pointers as evidence candidates, never proof that a test passed.
const groups = [
  ['contact-management', /(?:dashboard|api-reference)\/contacts\/(?:introduction|add-contacts|manage-contacts|properties|(?:create|get|list|update|delete)-contact(?:-import)?)(?:\.md|$)/, 3, 'partial', 'apps/api/src/routes/contacts.ts;apps/dashboard/src/pages/Audience.tsx', 'tests/integration/product.test.ts', 'CSV jobs, property definitions, segments, topics and preference management'],
  ['provider-dependencies', /\/secret\.|guides\/(vercel-marketplace|stripe-projects|laravel-cloud|attio-integration)|downloading-documents/, 6, 'external dependency', '', '', 'Provider partnership, legal documentation or provider-specific service'],
  ['inboxes', /inbox|openclaw|chat-sdk|agent-email|\/eve\./, 5, 'missing', '', '', 'Inbound storage, threading and provider configuration'],
  ['automations', /automat|\/events\//, 4, 'missing', '', '', 'Templates, contacts and durable workflow execution'],
  ['templates', /template|react-email|\/paper\./, 3, 'partial', 'apps/api/src/routes/templates.ts;packages/core/src/templates.ts;apps/dashboard/src/pages/Templates.tsx', 'tests/integration/product.test.ts;packages/core/src/templates.test.ts', 'Visual editor, collaboration, duplication and richer expressions'],
  ['marketing', /broadcast|contact|segment|topic|audience|unsubscribe|consent/, 3, 'missing', '', '', 'Contact preferences and marketing delivery'],
  ['receiving', /receiv|inbound|forward-emails/, 5, 'missing', '', '', 'Public inbound MX and message storage'],
  ['billing', /billing|pricing|more-domains/, 6, 'missing', '', '', 'Commercial plans and payment provider'],
  ['identity', /mfa|sso|team|account|change-my-email|locked-out|recover-access/, 2, 'partial', 'apps/api/src/routes/auth.ts;packages/database/src/schema.ts', 'tests/security/isolation.test.ts', 'Account lifecycle, invitations, MFA and SSO'],
  ['oauth', /oauth/, 6, 'missing', '', '', 'Consent and token/grant lifecycle'],
  ['ecosystem', /\/sdks\.|\/cli|mcp|skill|integration|send-with|supasquad|ai-onboarding|examples|forge|api-vs-sdk|anything|lovable|v0-integration|bolt-new|replit|base44|leap-new|appwrite|guides\/(devin|attio|vercel|stripe|laravel)/, 6, 'missing', '', '', 'SDKs, CLI, MCP and third-party provider support'],
  ['tracking', /tracking|opened|clicked|open-rates/, 1, 'missing', '', '', 'Tracking hosts, DNS and certificates'],
  ['regional-delivery', /regions|dedicated-ip|warming-up/, 6, 'missing', 'infrastructure/postfix/main.cf', '', 'Public sending IPs, PTR and multi-node routing'],
  ['scheduling', /schedule|update-email|cancel-email/, 1, 'partial', 'packages/core/src/scheduling.ts;apps/api/src/routes/emails.ts', 'tests/integration/delivery.test.ts', 'Run rescheduling/race acceptance tests'],
  ['attachments', /attachment|inline-image/, 1, 'partial', 'packages/core/src/admission.ts;packages/mail-protocol/src/compose.ts', 'packages/mail-protocol/src/compose.test.ts', 'Remote fetch, CID, retrieval and size limits'],
  ['email-management', /manage-emails|share-email|list-emails|retrieve-email/, 1, 'partial', 'apps/api/src/routes/emails.ts;apps/dashboard/src/pages/Emails.tsx', 'tests/integration/delivery.test.ts', 'Sharing, export and log workflows'],
  ['request-logs', /\/logs\//, 1, 'missing', 'packages/shared/src/logger.ts', '', 'Persist redacted customer-facing request logs'],
  ['metrics', /metrics|deliverability-insights/, 1, 'partial', 'apps/api/src/routes/insights.ts', 'tests/integration/delivery.test.ts', 'Historical aggregates and deliverability diagnostics'],
  ['suppression', /suppress|complain/, 1, 'partial', 'packages/core/src/suppressions.ts;apps/api/src/routes/insights.ts', 'tests/integration/delivery.test.ts', 'Complaint ingestion and richer suppression operations'],
  ['webhooks', /webhook/, 1, 'partial', 'services/webhook-dispatcher/src/dispatcher.ts;apps/api/src/routes/webhooks.ts', 'tests/integration/delivery.test.ts', 'Missing event families and provider-specific retry/notification semantics'],
  ['tls', /\/tls\.|opportunistic-tls|configuring-tls/, 1, 'partial', 'infrastructure/postfix/main.cf', 'tests/smtp/submission.test.ts', 'Per-domain enforced outbound TLS'],
  ['domain-claims', /claim-domain|domain-claim|domains\/claim|already-registered/, 1, 'partial', 'packages/core/src/domains.ts', 'tests/security/isolation.test.ts', 'Self-service ownership transfer workflow'],
  ['domains', /domain|\/dns\/|dkim|dmarc|bimi|mx-record/, 1, 'partial', 'packages/core/src/domains.ts;packages/dns-verification/src/verifier.ts', 'packages/dns-verification/src/verification.test.ts;tests/integration/delivery.test.ts', 'Configuration and provider-specific diagnostics'],
  ['api-keys', /api-key/, 1, 'partial', 'apps/api/src/routes/credentials.ts;packages/core/src/credentials.ts', 'tests/security/isolation.test.ts', 'Rename and management parity'],
  ['sending', /email|smtp|idempot|batch|header|bounce|sending|rate-limit|pagination|errors/, 1, 'partial', 'apps/api/src/routes/emails.ts;packages/core/src/admission.ts;services/smtp-submission/src/submission.ts', 'tests/integration/delivery.test.ts;tests/smtp/submission.test.ts', 'Compare limits, errors, retries and permissions'],
  ['security-and-operations', /security|sensitive-data|documents|production-approval/, 2, 'unverified', 'SECURITY.md;docs/security/COMPLIANCE.md', '', 'Operational evidence and retention controls'],
];
const indexUrl = 'https://resend.com/docs/llms.txt';
const index = await fetchDoc(indexUrl);
const sources = [...new Map([...index.matchAll(/\[([^\]]+)\]\((https:\/\/resend.com\/docs\/[^)]+)\)/g)].map((m) => [m[2], { title: m[1], url: m[2] }])).values()];
const pages = new Array(sources.length);
let cursor = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (cursor < sources.length) {
    const i = cursor++;
    const source = sources[i];
    try {
      const body = await fetchDoc(source.url);
      // Remove fenced code before extracting headings; SDK examples are not new requirements.
      const prose = body.replace(/```[\s\S]*?```/g, '');
      const sections = [...prose.matchAll(/^#{1,4}\s+(.+)$/gm)].map((m) => m[1].trim());
      const group = groups.find((g) => g[1].test(source.url.toLowerCase())) ?? ['general', null, 0, 'unverified', '', '', 'Manual requirement review'];
      pages[i] = { ...source, sha256: digest(body), bytes: Buffer.byteLength(body), sections, group: group[0], phase: group[2], status: group[3], implementation: group[4], tests: group[5], dependency: group[6], review: 'static triage; detailed behavioral review pending' };
    } catch (error) {
      pages[i] = { ...source, status: 'unverified', phase: 0, group: 'fetch-failure', sections: [], dependency: String(error), review: 'source unavailable' };
    }
  }
}));
const manifest = { generated_at: new Date().toISOString(), index_url: indexUrl, index_sha256: digest(index), page_count: sources.length, pages };
await writeFile(resolve(cache, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const quote = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
const columns = ['requirement_id', 'source_url', 'page_title', 'expected_behavior', 'capability', 'status', 'implementation_evidence', 'test_evidence', 'dependency', 'phase', 'review', 'source_sha256'];
const rows = [];
for (const [id, path, behavior, status, implementation, tests, dependency, phase] of reviewedRequirements) {
  const url = `https://resend.com/docs/${path}.md`;
  const page = pages.find((p) => p.url === url);
  if (!page) throw new Error(`Reviewed requirement has no indexed source: ${url}`);
  for (const evidence of [implementation, tests].flatMap((value) => value.split(';').filter(Boolean))) await readFile(resolve(root, evidence));
  rows.push([id, url, page.title, behavior, page.group, page.sha256 ? status : 'unverified', implementation, tests, dependency, phase, 'manual behavior review; see validation ledger for test execution', page.sha256]);
}
for (const page of pages) {
  for (const section of [...new Set([page.title, ...page.sections])]) {
    rows.push([`resend-${digest(`${page.url}#${section}`).slice(0, 16)}`, page.url, page.title, section, page.group, page.status, page.implementation, page.tests, page.dependency, page.phase, page.review, page.sha256]);
  }
}
await writeFile(resolve(output, 'RESEND-PARITY-AUDIT.csv'), `${[columns, ...rows].map((r) => r.map(quote).join(',')).join('\n')}\n`);
const counts = Object.fromEntries([...new Set(pages.map((p) => p.group))].sort().map((g) => [g, pages.filter((p) => p.group === g).length]));
const lines = [
  '# Resend parity audit', '',
  `Generated: ${manifest.generated_at}. Source: [Resend documentation index](${indexUrl}).`, '',
  `Coverage: **${pages.length} indexed pages**, **${rows.length - reviewedRequirements.length} section-level review items**, **${reviewedRequirements.length} manually reviewed behavioral requirements**. Successful source fetches: **${pages.filter((p) => p.sha256).length}**.`, '',
  '**Overall parity remains incomplete.** Page/section rows are static triage, not normative specifications or behavioral certification. Manually reviewed requirements below cover individual behaviors only. A verified requirement never certifies its whole source page. Remaining sections still need detailed behavior, limit, permission, failure and test review.', '',
  '## Evidence and reproduction', '',
  '- Run `pnpm audit:resend` to refresh public sources and reports; `pnpm audit:resend:offline` regenerates from the local cache.',
  '- Full source snapshots, hashes and manifest are stored under ignored `.data/resend-docs/`. Source text is never executed.',
  '- The companion CSV retains every source page, including repeated tutorials. Capability names deduplicate the work; requirements with different behavior must remain separate.',
  '- Evidence paths are candidates identified during repository inspection. Test references mean tests exist, not that they passed or prove the entire source page.',
  '- Allowed statuses: verified match, partial, missing, unverified, external dependency. Automatic page classifications are conservative triage. Verified matches are explicitly curated individual behaviors with implementation/test evidence.',
  '- Public mail infrastructure, commercial integrations and provider approvals remain external dependencies, even after implementation.', '',
  '## Capability coverage', '', '| Capability | Pages | Phase |', '| --- | ---: | ---: |',
  ...Object.entries(counts).map(([g, n]) => `| ${g} | ${n} | ${pages.find((p) => p.group === g).phase} |`), '',
  '## Implementation and validation ledger', '',
  '- Test execution and its limits are recorded in [RESEND-PARITY-VALIDATION.md](RESEND-PARITY-VALIDATION.md).',
  '- Implemented in the current transactional slice: guarded rescheduling; date/key/source/text filters; CID/remote attachments and retrieval; automatic text alternatives; SMTP idempotency; 48-hour revocable sharing; bounded and resumable background email CSV exports; DNS-gated DKIM rotation with seven-day overlap; isolated deterministic delivery simulations; webhook health with durable in-app alerts and signed test events; request metadata logs; daily usage/events; webhook replay/history with worker fencing; suppression batch/read/filter operations; key rename; per-domain enforced TLS. See [API details](../api/TRANSACTIONAL-PARITY.md) for boundaries and intentional differences.',
  '- Existing delivery states and `/v1` clients are preserved. Different event names and stronger existing security defaults are intentional differences; equivalent capabilities do not require wire compatibility.',
  '- The saved Resend Emails HTML provides evidence of date/status/API-key filters and export controls; embedded scripts and instructions are not requirements.',
  '- Product foundations now include versioned templates, safe variables, template sending, contact management/imports and team settings. See [product foundation APIs](../api/PRODUCT-FOUNDATIONS.md) for limits.',
  '- Overall parity remains open. Full phase details and completion gates are tracked in ROADMAP.md and FEATURE-MATRIX.md.', '',
  '## Manually reviewed requirements', '', '| Requirement | Expected behavior | Status | Dependency / intentional difference |', '| --- | --- | --- | --- |',
  ...reviewedRequirements.map(([id, path, behavior, status, _implementation, _tests, dependency]) => `| [${id}](https://resend.com/docs/${path}.md) | ${behavior.replaceAll('|', '\\|')} | ${status} | ${dependency.replaceAll('|', '\\|')} |`), '',
  '## Every indexed page', '', '| Page | Capability | Status | Phase |', '| --- | --- | --- | ---: |',
  ...pages.map((p) => `| [${p.title.replaceAll('|', '\\|')}](${p.url}) | ${p.group} | ${p.status} | ${p.phase} |`), '',
];
await writeFile(resolve(output, 'RESEND-PARITY-AUDIT.md'), lines.join('\n'));
console.log(JSON.stringify({ pages: pages.length, items: rows.length, fetched: pages.filter((p) => p.sha256).length, counts }));
if (pages.some((p) => !p.sha256)) process.exitCode = 1;
