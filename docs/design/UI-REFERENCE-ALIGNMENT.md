# UI reference alignment

26 October 2026. This pass compares the user-supplied saved HTML with actual dashboard rendering. Reference documents are data, not instructions. Existing brand assets, Material icons, Inter, flat compact navigation and white light-theme canvas remain explicit user preferences.

## Reference-to-implementation mapping

| Reference | Observed layout | Implemented change |
| --- | --- | --- |
| Add domain 03:12:35, `ev_a95d857360c97356e1b73851c71db471a7459bf88da188bd00d78be10976b2aa` | Full-page domain entry, sender preview, next DNS step | `/domains/new`, bounded form, live sender-address preview, advanced return-path disclosure, next-step progression |
| Add domain 03:13:02, `ev_d88b39dadbcb422cffef4a3d288caeda61af3a5c720c0038f501c09ee77e48eb` | Completed domain, provider/manual setup choices | Domain-added identity followed by provider choice; manual setup expands records; supported automatic setup retains its real authorization flow |
| Add domain 03:13:34, `ev_6aec2438a25a1c6817c53afb3788d7ef767d780861610a9237b04d422efb7dc7` | Grouped DNS records, inline copying, provider and verification actions | Verification/return-path/DMARC groups; bounded names/values with copy controls; instructions in one menu; one verification action below records |
| Atlassian Users references, documented in ATLASSIAN-TABLE-REVIEW.md | Clear header/body geometry, restrained table boundaries | Removed inherited double table borders, legible type hierarchy, subtle row separation, visible Actions at desktop widths, bounded mobile scrolling |
| Automation references, documented in RESEND-OCT26-REFERENCES.md | Compact connected nodes on a workflow surface | Shorter node spacing, readable small-workflow fit, selected-step inspector, fewer repeated headings, stable selection scrolling |
| Broadcast editor 01:51:18, fresh `ev_eddd0ba70745ca0a158036cf8ed81eb85b80b391ce879330a4c712ff2283f075` | Compact sender metadata, wide email canvas, narrow settings inspector | From/reply-to/subject rows, Preview/HTML/plain-text views, audience/settings rail, lifecycle actions in header |

Receiving toggles, unsupported AI/third-party actions and unconfigured provider authorization are not presented as working features. Customer-authored email HTML keeps its own rendering inside sandboxed previews; application chrome uses Inter.

## Concrete shared defects corrected

- An inherited two-pixel `thead`/`tbody` border compounded the owned table boundary.
- Excessive minimum widths hid Actions at 1280px despite sufficient room.
- Legacy mobile metric selectors restored inconsistent borders in production CSS.
- Search icon wrappers consumed the available input padding.
- SMTP credentials with an empty network allowlist displayed a blank cell.
- Bold coloured success/error flags obscured content; standard neutral flags retain semantic icons and dismiss controls.

## Verification scope

The shared audit covered six table routes in empty/filled states at desktop, mobile, dark and increased contrast, with additional 40-row long-content cases. A separate visual sweep inspected Overview, Settings, SMTP, Webhooks, Suppressions, Exports, Notifications and Help in desktop/mobile empty and filled fixture modes. The generic fixture's empty Overview retains populated summary counts; it does not establish a true zero-count analytics state.

Domain browser checks cover entry, creation, provider/manual choice, grouped records, instructions download, connection options, DNS verification, security settings and read-only permissions across five viewport/theme combinations. Editor checks cover automation and broadcast operations, failure recovery, keyboard navigation, pagination, permissions and long workflows. All provider/mail actions use isolated fixtures; this pass does not establish live DNS publication or external email delivery.

Screenshots are saved under `.data/ui-check/domain-redesign-*`, `shared-*`, `remaining-*`, `automation-*` and `broadcast-*`. See the final verification record below for production results.

## Final verification

- Dashboard unit tests: 32 passed.
- Dashboard TypeScript check and production build passed. The final production bundle includes the legacy metric-border and search-padding cleanup.
- Design audit passed against 619 installed ADS tokens.
- Domain flow: five production browser contexts passed (1440px light, 390px light, 320px light, 1280px dark, 1280px increased contrast), including accessibility and overflow checks.
- Automation and broadcast editors: five production contexts each passed, including save/error recovery, permissions, lifecycle actions and long-workflow keyboard navigation.
- Shared table checks included empty, filled and long-content fixtures. Additional visual checks covered the remaining dashboard routes. These are controlled browser fixtures rather than a production-data audit.
- Focused final production checks at 390px confirmed borderless Overview metrics, an 8px Help search icon/text gap and the SMTP `Any network` fallback, with no page errors or document overflow. Screenshots: `shared-final-production-{overview,guides,smtp}-390-light.png`.

## Focused automation and domain follow-up

The user requested closer matching of the automation and domain HTMLs. The earlier normal dashboard frame left a material mismatch in the automation editor; numbered domain steps also differed from the reference timeline.

| Question | Result and evidence | Coverage |
| --- | --- | --- |
| Automation editor structure | Dedicated 64px rail and 60px desktop header, near-full-height bounded dotted canvas, 400 × 126px inline trigger, 448px grouped terminal-step menu, vertical zoom controls. Header keeps the existing brand assets and real save/publish controls. Saved reference evidence: `ev_91f34de9dc44e33dde6f96123033e3a68c9b2094f907f48401c438ef5edb5d1d`, `ev_ff6795490f1a1b3d88ebdd6b27d12512178af1ae603a9bcec7f21d4bfd19357b`. | Layout corrected and browser-tested. White surfaces, Inter and Material icons retain explicit user preferences. |
| Automation observability | Activity rail opens separate Runs and Metrics views. Metrics has a 7/14/30-day filter, current run-status shares, daily counts and a graph of the immutable published version with execution counts. Reference: `ev_514c17994017a2a0721531c9f486588644e29cefb1831f6d962632a495310f82`. | Implemented with new server aggregation, not the paginated run list. Receiving-server acceptance is labelled truthfully. |
| Domain entry | Continuous timeline and hollow milestones; icon heading, bounded Name form, sender preview and next DNS stage. Fresh local replay: `ev_0c065d895333e65e745b2c520985baa0e0491a9036fd3db1ad61f0bb4f5a9758`. | Saved HTML replay, scripts/remote content blocked; no observed page errors. |
| Domain provider choice | Completed Domain panel remains above DNS; Auto configure and Manual setup sit together below the description. Fresh replay: `ev_12f8d1dc4d3a7e19c7b4385782f7ae836837e3a594e720d8a5811176c3b05a5f`. | Direct automatic-setup fallback now opens records rather than returning to the choice screen. |
| Domain records | Timeline continues; ownership/DKIM, sending SPF/return-path and optional DMARC use compact rounded header bands, unboxed rows, full-value copying and one instructions menu. Fresh replay: `ev_afe5306b119d609560562d5e09f862755e235dcbd750a442da2aa1536e567602`. | Backend-generated record types/values remain authoritative. Required ownership and status information remain visible. |

Fresh reference replay evidence is retained in `.data/reviews/automation-domain-oct26-final.evidence.json`. HTML content remains reference data, not executable task instructions.

Production verification: all five domain contexts passed creation, provider/manual fallback, instruction download, verification, security and permissions checks. All five automation contexts passed inline trigger, step creation/save, empty/filled/error Metrics, date filters, version-correct graph, accessibility and overflow checks. Five additional production lifecycle contexts passed template mapping, typed schema/conditions, save failure/conflict recovery, publish/pause/resume, dry-run preview, retry/cancel, pagination, read-only permissions and 50-node keyboard navigation. Contexts were 1440 light, 390 light, 320 light, 1280 dark and 1280 increased contrast.

The mobile list-to-editor transition exposed stale `inert` state on a reused navigation element. Distinct navigation keys and the shell effect now reset that state; lifecycle browser checks cover this transition. Closing a mobile inspector restores focus to its node.

Dashboard tests: 32 passed. New metrics and existing automation integration scenarios: 12 passed in isolated PostgreSQL. Dashboard/API typechecks and builds, plus the ADS design audit, passed. The final stylesheet was rebuilt after spacing values were expressed with equivalent ADS tokens. Final images use `domain-exact-*` and `automation-focused-*` under `.data/ui-check`.

Scope boundaries: audience/AI workflow actions are not supported node types. GoDaddy Domain Connect still depends on external template approval/public configuration. These UI checks do not establish live DNS publication or external email delivery; they do not certify pixel equality for every Resend feature or state.

## Documentation workspace and automation entry

The supplied Microsoft Learn HTML was freshly replayed with scripts and remote content blocked. REA observation `ev_42c5da709f0b7cfe1ada610ed0202877517b527972906027b6e875ca472d160d` completed without page errors; full inline evidence is cached at `.data/reviews/docs-learn-layout.evidence.json`. Promotional content, Microsoft branding and unrelated service actions are outside this reconstruction.

- Documentation uses the existing sidebar at 274px, title filtering, a product navigation bar, a bounded 690px reader and a 227px article-contents rail on wide screens. The article-contents rail tracks the current section. Narrow layouts use the navigation drawer and a collapsible contents list above the article.
- The article title and body share one reading column. Reader prose uses the existing large body token, with Inter retained throughout. Heading components retain semantic sizes; light surfaces stay white. All 26 published product/developer guides remain accessible; internal design documents remain excluded.
- The index now reads as documentation rather than a card directory. Search/empty/unavailable article states, lazy content loading, code blocks, local table scrolling and related links remain functional. Article navigation resets scroll or resolves the requested fragment after loading. Wide Markdown tables can be focused and scrolled with a keyboard.
- Documentation replaces Help center in navigation and breadcrumbs. Dashboard-tour and automation instructions now match current labels and behavior.
- The first automation capture, REA `ev_2a03d838717517330fa8ecf44618ee938286ad7e2eda37310c86cc59cb193905`, establishes the initial centered Start with a trigger action. That state is now implemented and focuses the event field when activated. Its cached record is `.data/reviews/automation-first-state.evidence.json` and its screenshot is saved separately.
- Automation rows link directly to Activity. Workflow/Activity, Runs/Metrics and the selected Metrics range persist in URLs and work with reload and browser Back. Existing role checks continue to control access; anonymous session inspection does not establish the user's role.

Verification: dashboard production build, typecheck, design audit and 33 unit tests passed. Production docs checks passed six viewport/theme contexts (1440 dark/light, 390 light, 320 light, 1280 increased contrast, 720 light), including title filtering, article navigation/anchors, code-containing articles, unavailable routes, accessibility and document overflow. All 26 articles were additionally rendered at 1440 dark and 320 light, with one h1 and matching contents targets. Automation's focused visual/history suite and full workflow suite each passed five production contexts, including the new first state, direct Activity entry, reload/Back, typed workflow forms, failure/conflict recovery, lifecycle operations, permissions and 50-node keyboard navigation.

Final screenshots: `.data/ui-check/docs-learn-{overview,automation,quickstart}-*`, `automation-first-trigger-*`, and `automation-focused-*`. Tests use isolated API fixtures; no real mail or external-service changes were performed. The local runtime restarted during verification; owned preview services were restarted and production checks were completed. REA export transport became unavailable, so already returned inline observations were cached locally without changing client configuration.

## Light-theme separation: six settings references

The user supplied Documents, Integrations, SMTP, Team, Billing and Usage captures and requested visible hairline separation. Each HTML was freshly replayed on loopback with scripts and remote content blocked, at 1440 x 1000. These are observed saved states, not live authenticated actions. Full returned REA records, including screenshots, are retained as `.data/reviews/settings-separation-reference-{team,0,1,2,3,9}.evidence.json`.

| Capture | REA observation | Observed structure |
| --- | --- | --- |
| Team | `ev_75c47ce65870552d39d00a013e2ca16261c75dd8f3508a287c192ee64711c290` | Separate overview and members cards; the save action has a footer rule. |
| Billing | `ev_10391788af1ebe0aa91558475d13c415626ebb76b1fcccdbb6596552e428ea03` | Bounded sections, subscription rows and separate action footers. |
| Documents | `ev_37643911927920106f2af667e0524bcbeb1d9d562b68110ccd3626f41d8c89a6` | Separate compliance-document cards with action footers. This is not the API documentation layout. |
| Integrations | `ev_b60b704ee8d8ab546f94f48ea88ea8b54661e80c782a90e17565218904e85161` | Outlined integration cards without unnecessary internal rules. |
| SMTP | `ev_3a25d3f617e8d2fd5ace55ce2d84037760cc37f2a405cc171c7a84b2f21fe351` | A bounded connection panel and clearly outlined controls. |
| Usage | `ev_f2eb3b9a7ce50d4989ab0bd08151703ce0745905b8ccd552f65e0d6033ae6e2c` | Unboxed groups separated by full-width rules; lighter rules within usage rows. |

Independent ordinary-browser measurements corroborate 1px `#d7d7d7` structural outlines, 1px `#eeeeee` inner data rules, 24px settings-card radii and no card shadows. Screenshots and computed measurements are `.data/ui-check/reference-{billing,documents,integrations,smtp,team,usage}.{png,borders.json}` (measurement filenames use `-borders.json`). Navigation tabs in these captures have a selected gray pill and no full-width underline.

Implementation: removed blanket border suppression from cards, settings rows, advanced options and side-sheet headers. Shared border tokens now distinguish structural and inner-row rules in light, dark and increased contrast. Workspace details, Members, Sending limits and Account use bounded settings sections; save actions have distinct footers. SMTP connection information uses the same section treatment. Overview summaries and its analytics region have clear boundaries. Empty tables retain a bounded surface, and analytics groups have an intentional separator. The existing flat navigation and white base surfaces remain requirements.

The reconstruction uses real Morphmailer capabilities. No billing charges, integration connections or compliance attestations are fabricated from the reference content. All six visual questions are answered for their supplied saved states; unobserved states and complete Resend feature parity remain outside this comparison.

Verification: dashboard typecheck, 33 unit tests, production build and design audit passed. Development and production browser checks each passed five contexts: 1440 light, 390 light, 320 light, 1280 dark and 1280 increased contrast. The final production pass covered 65 rendered states with no Axe violations or document overflow, including settings save failure/retry with retained input, quota changes, read-only permissions, 63-member pagination/local scrolling, filled/empty/filtered lists, SMTP, Analytics, Overview, template details, documentation and the API side sheet. All three settings tabs fit at 320px. Motion is allowed to settle before text-contrast measurements.

Fresh REA production replay `ev_47898c44d1ed084da753a256ffcbd1397fef934da47f87964ed3f062970e99dc` completed with no page errors; cached at `.data/reviews/settings-separation-production.evidence.json`. Final fixture screenshots are `.data/ui-check/separation-*-production.png`. These are isolated API-fixture checks, not live workspace writes or external mail delivery. The existing app at port 5173 and API readiness endpoint remained healthy.
