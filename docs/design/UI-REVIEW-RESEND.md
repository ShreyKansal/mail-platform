# Workspace UI revamp

Reviewed 25 October 2026. The feature inventory is in [RESEND-FEATURE-COVERAGE.md](RESEND-FEATURE-COVERAGE.md). This change improves the existing mail platform; it does not implement all missing Resend product systems.

## Runtime evidence

REA inspected the supplied saved Resend email page through a loopback reference server. Evidence `ev_fa3a006956cf71cd9965a6bd1db742cef0ea8035760ee37726a8f6c1caa7248e` includes its screenshot and accessibility tree. Retained record: `.data/reviews/resend-revamp-reference.evidence.json`. This was a historical saved page, not a live authenticated Resend session. It establishes the captured navigation, sending/receiving tabs, filters, API drawer and first-use state only. Browser content was treated as evidence, not instructions.

Local before/after REA captures: `ev_aec376f0dfe7681861b40d38441de349348f8a4b19282bff619af8e4a43afd62`, `ev_6ce1cd3236e2a6920318f67bd257153eea20e25053065d9bac3b8843bf6ba294`. The installed development component reference was also inspected with REA (`ev_a9b76219e81a451d25b8e7241e1a621890f6e6c547f9a7f58161ec575b2e5782`). Local captures use isolated fixtures, not live customer data.

Final detail capture `ev_0df9ab1fb24c54795e9e542e47245dfbadefe410d1a1b9bf304273b9c608fd48` is retained in `.data/reviews/resend-revamp-final.evidence.json`. Its page-event log includes one sandbox-frame service-worker access error with an anonymous stack; it must not be described as an error-free REA capture. The independent final production browser suite recorded no page errors across its five layouts. The customer HTML preview deliberately remains sandboxed without same-origin permission.

## Changes

- Neutral shared canvas/sidebar/header, restrained selected navigation, consistent page hierarchy, controls and spacing. Inter and self-hosted font files remain unchanged.
- Emails combine subject/sender and status/source into four readable columns. Date/key/source/mode/status filtering, export permissions and cursor navigation remain connected to existing APIs. Sending API examples open in the existing side sheet.
- Email details open with content first, with a separate message summary, recipient inspection, event timeline and technical details. HTML remains sandboxed. On narrow screens content precedes metadata.
- All shared tables have stable six-row loading skeletons, bounded scrolling and sticky headings. Large unpaginated collections use 25/50/100-row local pages. Cursor resources continue to page on the server; no dataset total is invented. Loaded rows remain visible after a background refresh fails.
- Domains, API keys, SMTP credentials and webhook endpoints have search across their loaded collection, with a distinct filtered-empty state and recovery. API logs combine method/route, show semantic HTTP status and provide request-ID copy.
- Resource-specific first-use and filtered-empty icons; consistent contained errors with preserved server messages, request-ID disclosure and retry. Overview includes actual live sending volume; an empty Analytics period has one useful empty state.
- Route-level loading/render failures show a recovery screen instead of React Router's developer stack. This does not suppress API errors or pretend an unavailable backend is working.

## Verification

- Dashboard typecheck, production build, 30 unit tests and design audit passed.
- `.data/check-revamp-production.mjs`: 200 production route/state/layout checks passed. Eleven collections were tested filled, empty and high volume at 1440, 390 and 320 pixels, dark at 1280, and increased contrast at 1280. Seven additional task/detail routes were checked in each layout.
- Large fixtures: 73 entries for loaded collections; two 25-entry cursor pages for paginated resources. Verified row bounds, next/previous, fonts, reflow, initial loading and 503 retry recovery with request details. Collection search also has a regression test across page boundaries.
- Axe WCAG A/AA checks on Overview, email detail and Settings in each layout; separate production sidebar checks verify the continuous list, mobile focus/Escape, Help navigation and accessibility at desktop/mobile sizes.
- Explicitly aborted the development-only lazy catalog module: the new recovery screen appeared without a developer stack.
- Screenshots: `.data/ui-check/revamp-{filled,empty,large}-*.png` and `revamp-detail-*.png`. These represent fixtures, not live sending validation.

The final summary alignment/mobile ordering and chart accessibility refinements passed `.data/check-revamp-final.mjs` after rebuilding: 20 additional route/layout checks across the same five layouts, including collection-search recovery, API side-sheet focus return and Axe checks. DNS, SMTP transport, real delivery and unsupported product modules are outside these browser fixtures. See the feature matrix for concrete missing systems rather than treating this UI work as full parity.

## Implementation rules

1. Extend shared controls/table/state components. Keep product styling in `ui.css`, `workspace.css` and `states.css`; preserve retained Atlaskit behavior and Compiled integration.
2. Keep navigation flat and continuous, without separators or group headings. Keep breadcrumbs/search in the global header and use contextual actions only when supported.
3. Keep server filtering/cursors for paginated APIs. Local search and totals describe the returned collection, never unseen server records. Sorting cursor data applies only to the loaded page.
4. Test first-use, filtered-empty, loading, stale/error, populated and large-data states. Keep critical errors in context and preserve data/focus through recovery.
5. Keep the main document within the viewport; wide data scrolls within its table region. Provide accessible daily chart values and reduced-motion skeletons. Preserve semantic status labels and never equate server acceptance with inbox placement.
