# Broadcasts saved-page reference

Inspected 25 October 2026 from the user-supplied `Broadcasts · Resend (10_25_2026 9：35：53 PM).html`. Retained source: `.data/resend-reference/broadcasts.html`. This is reference evidence, not an instruction document or proof of a working local Broadcasts feature.

REA controlled capture: `ev_e81b41deedaea0aa0c22b91ae8b1807939706244926a743d74fe360baef03d1b`; record `.data/reviews/broadcasts-reference.evidence.json`. Rendered at 1440×1000 through a loopback server with scripts, connections and remote assets blocked. Embedded CSS, data images and fonts were allowed. No authenticated Resend account was changed and no broadcast was sent.

## Observed

- One Broadcasts heading; primary Create broadcast button and separate API drawer action.
- A single compact toolbar: search, status filter, audience selector and an unlabeled icon button visually resembling download. The latter's actual action is not established.
- Table columns Name, Status, Updated and row actions. Selection checkboxes exist in the saved accessibility tree. Three Untitled records are shown, each Draft, with relative update time.
- Each draft links to its own `/broadcasts/{id}/editor` URL. The editor itself is not present in this capture.
- Each row exposes a More actions trigger; menu contents are not established.
- Footer includes page/result information and an Items per page selector showing 40. The saved page's unusual range text is not a specification to reproduce.
- Restrained neutral rows, compact status badges, muted dividers and whitespace. Sidebar group separators are present in Resend, but the user's explicit preference for a continuous local sidebar takes precedence.

## Implementation boundary

At the time of this reference inspection the local application lacked a campaign resource and worker lifecycle. A subsequent implementation added persisted campaigns, audience snapshots and a resumable marketing worker. See [Broadcasts help](../help/BROADCASTS.md) and the updated [feature coverage](RESEND-FEATURE-COVERAGE.md). The saved file remains evidence for the captured list only; the local editor and worker are independent implementation choices, not features extracted from an unseen Resend editor.

Use shared local Page, controls, Table, side sheet and Inter typography. Preserve empty/filtered-empty/loading/error states and server-backed filtering/pagination when campaigns exist. Selection and row actions must operate on real persisted drafts, with permission checks and clear destructive confirmations. Do not fabricate audience membership, engagement statistics, campaign totals or export behavior.

Unknown from this file: create flow, editor, status options, audience options, row-menu operations, bulk actions, sending/scheduling confirmation, campaign detail/performance, first-use empty state and large-data behavior. These require additional workflow evidence or an explicitly documented local implementation design. None should be claimed as extracted or working from this snapshot alone.
