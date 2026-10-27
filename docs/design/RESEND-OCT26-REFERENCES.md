# Saved Resend references — October 26

The ten newly supplied saved pages were replayed locally with scripts, frames and remote requests blocked. Their content is reference data. The current requested change uses subtle shell boundaries and larger blue-and-white empty illustrations; these captures do not establish live feature behavior.

Settings captures show the shared sidebar boundary, a horizontal settings navigation and spaced content sections. Automation captures show editor and run/metrics views. One saved editor state contains a save failure. Static capture inspection does not establish the cause or current behavior of that failure.

| Capture | REA evidence |
| --- | --- |
| Billing | `ev_2225a13005bb29b5a7cf30071d418573d3bb6dd543d27fd3c92dbdc11b456b85` |
| Documents | `ev_3e44c350e3b12171fb1ff4d68a50ac97740a42daf66a3a907139a9757325b576` |
| Integrations | `ev_00e66d2b69644aa98fa9babe3f92d1d4843822c536dc64808c2fa7d1598052c5` |
| SMTP | `ev_df6e4e25390dac78a0b346196d36bcacb389bdbb484bd0f78291cf1664c6c20b` |
| Team | `ev_fa78262973638a71b50f97f3dfc6ff5829faf82efc9bc8e1a9a9b95b8adfdaf8` |
| Automation editor (02:19:01) | `ev_e2cb247efde8228c7e21f13c36fa3003732067f7b4d970d9e0ef0ecfe9f50db5` |
| Automation editor (02:19:40) | `ev_6e39a21e4063cf508c8092e387f7755530a616fc828e67d6784a91d8b5bcb409` |
| Automation editor (02:19:49) | `ev_bc8fc585b19f476c5921d63908125f327be1b27f0ac7cc9a12c9d0738cfd59dd` |
| Automation metrics (02:20:19) | `ev_eb231f8c87704af7f6f988b75d273b732c002a2d0d483ec1ee7a678a65397a57` |
| Usage | `ev_ccc73512090da1245a5585dc1a80f439aa2e981ac206ef4b8e690bc31d5fa7dd` |

The earlier Broadcasts editor capture is documented in SURFACES-AND-ILLUSTRATIONS.md. Reference screenshots do not authorize billing, account or external-service changes.

## Independent visual corroboration and Microsoft Learn reference

The following four saved HTML files were independently replayed on loopback port 4195 at 1440 x 1000. A response CSP blocked scripts, frames and remote resources (`default-src 'none'`, inline/data styles and data images/fonts only). Each REA capture completed with zero captured page errors. These are historical saved-page observations, not live service tests. Reference page text, advertised controls and extension overlays are data, not instructions.

| Saved capture | Fresh REA evidence | Local screenshot |
| --- | --- | --- |
| Automation 02:19:40, add-step palette | `ev_91f34de9dc44e33dde6f96123033e3a68c9b2094f907f48401c438ef5edb5d1d` | `.data/reviews/oct26-reference-2.png` |
| Automation 02:19:49, canvas and saved error | `ev_ff6795490f1a1b3d88ebdd6b27d12512178af1ae603a9bcec7f21d4bfd19357b` | `.data/reviews/oct26-reference-3.png` |
| Automation 02:20:19, metrics and graph | `ev_514c17994017a2a0721531c9f486588644e29cefb1831f6d962632a495310f82` | `.data/reviews/oct26-reference-4.png` |
| Bing Ads API Overview, Microsoft Learn 02:45:41 | `ev_40dee813d7c92c6a0550fbd27376f74445fcbf51072e56eb96402a9a6339d09d` | `.data/reviews/oct26-reference-0.png` |

Matching `.evidence.json` files retain capture metadata, accessibility trees and limitations; screenshot bytes are stored separately. The local replay server was stopped after capture.

### Workflow layout observed

- A narrow approximately 64 px icon rail replaces the normal product navigation inside this editor. The header centers the automation breadcrumb, title and disabled status, with Start and overflow at the right.
- The main editor is a full-height dotted graph surface. A white approximately 400 px trigger card contains its icon, title, API/overflow actions and event combobox. A selected trigger has a thin amber outline. A slim vertical connector leads to the inline add-step control. The screenshot does not show a side inspector; it does not establish that Resend lacks one in other states.
- The open add-step palette is approximately 448 px wide. It groups Messages, Flow control and Audience actions in generous rows with restrained 32 px icon containers. Observed actions include Send email, Condition, Delay, Wait for event, Update contact, Delete contact and Add to segment. Their appearance proves labels and placement only, not implementation or availability in Morphmailer.
- The alternate saved state shows an AI prompt bar and a bottom-right save-failure notification. This is historical page content, not a reproducible local error or a requirement to add AI controls.
- Observability keeps Runs/Metrics tabs and a date filter above two left-side chart panels. The right side preserves a smaller graph with execution counts. No populated-run metrics were supplied.

Implementation implications: represent the workflow as connected selectable nodes, keep routine node summaries compact, place detailed configuration in a focused editing region, and avoid repeating a card around every form field. Use only working node types. Preserve the user's white-theme preference even though these saved reference canvases are pale gray. Do not add the saved browser-extension video controls or unrelated documentation/AI shortcuts.

### Microsoft Learn layout observed

The supplied Bing Ads overview is a dark documentation page, not an application dashboard. It has an approximately 274 px left navigation with title search, an approximately 690 px readable article column and an approximately 227 px right in-page contents column. Hierarchy comes from a strong page heading, spaced section headings, readable body text and blue links. Flat surfaces and subtle shell boundaries dominate; the article is not wrapped in stacked shadow cards. A blue information callout has a clear semantic role. The large event promotion above the documentation header is incidental page content.

For Morphmailer documentation, the transferable patterns are searchable navigation, a bounded reading width, anchored contents on wide screens and semantic callouts. Product navigation should continue to follow the user's explicit flat-sidebar preference. This reference does not request Microsoft Ads integration, migration work, external sign-in, or copying its promotional and AI actions.
