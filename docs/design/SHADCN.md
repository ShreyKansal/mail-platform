# Shared UI implementation

The user explicitly authorized shadcn elements on 24 October 2026. This extends the earlier Atlaskit-only component rule.

## Source and ownership

The checked-in primitives under apps/dashboard/src/components/ui come from the official shadcn/ui new-york registry: https://ui.shadcn.com/r/styles/new-york/{button,input,table,tabs,dropdown-menu,badge}.json. They are source-owned components, not a pretend shadcn package. Original project: https://github.com/shadcn-ui/ui (MIT). Retain attribution when modifying them.

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Rules

- Consume controls through components/controls. These adapt existing page props to shadcn primitives, so pending/disabled state and handlers retain their meaning. No per-page alternate button system.
- Buttons use restrained blue primary actions, outlined secondary actions and quiet tertiary actions. Destructive actions retain red and confirmation. Native button defaults are explicitly reset because Tailwind preflight is intentionally absent.
- Product colours live in ui.css as semantic variables, with dark and increased-contrast variants. Retained Atlaskit surfaces and text map to those variables. Do not override Atlaskit component internals. Main canvas, global header and sidebar share the same base.
- Keep self-hosted Inter for every app control and text surface. Input primitives explicitly set the font rather than inheriting the browser default.
- Serve the normal and italic font-face declarations unchanged from public/fonts/inter.css, linked in index.html. Keep typography.css for token mappings. The bundled CSS optimizer merged the two same-family font-face blocks and retained only the italic source; production checks must confirm a loaded normal face, not merely a loaded family named Inter.
- Keep the Compiled plugin and stylesheet ordering. Tailwind theme/utilities are imported without preflight to protect retained Atlaskit controls.
- Shared tables own one horizontal scroll container, accessible sortable headers and stable React keys. Sorting covers loaded rows only; cursor pagination stays server driven. The registry Table wrapper was removed to avoid nested scroll regions.
- Radix owns menu and tab keyboard behavior. Tab panel identities remain stable. Opening a dialog from a menu must not restore focus over the new dialog; sheets restore focus to the persistent Help trigger on close.
- Keep real API permissions, errors, loading, empty and pending states. Do not add fake trends, fake delivery guarantees or unsupported controls.
- Overview separates recent email activity from recipient outcomes. Bars are proportions of returned recipient counts, not invented progress or delivery scores.
- The development Atlaskit reference remains an original library reference. It does not define the new product control selection.

## Table and typography rules

- Product navigation uses Lucide icons at 18px. Header and shared action icons use the supported Atlaskit core medium size (16px). Keep icon-only button targets at least 32px.
- Body text, sidebar links, table values, table headers, form inputs, tabs and all action buttons use Inter at 14px. Compact buttons reduce height and padding, not font size. Use 12px for captions, group labels, status badges and secondary metadata; section headings remain 16px and page titles 24px.
- Table columns use fixed geometry with readable minimum widths: three columns 600px, four 800px, five 1000px, six or more 1120px. Two-column summaries may fit their container. Wide tables scroll inside the shared region. Percentage column widths must leave room for their header, controls and padding.
- Owned table cell selectors explicitly preserve 12px horizontal padding, including the first and last columns. Table body cells use 8px vertical padding. The CSS reset removes edge padding unless the product selector takes precedence.
- Long plain values and resource names are limited to two visible lines with the full plain text retained in the title. Do not let names squeeze status, date or action columns. Keep full DNS record values and copy controls usable.
- Multiple actions inside a cell must wrap. The webhook Attempts and Replay actions use a wrapping Inline. Never rely on hiding the page overflow to conceal cell overlap.
- Page descriptions are optional. Omit copy that repeats the title or explains an obvious list. Keep instructions that affect a decision, permissions, errors, limits or the meaning of a delivery status. Use direct labels rather than promotional language.

## Verification

Run dashboard typecheck, unit tests, production build, design audit, isolated browser interactions and mobile/dark/contrast route checks. Fixture review establishes presentation and interaction, not live SMTP or backend correctness.

## Navigation shell

- Expanded navigation is 232px; compact navigation is a 64px icon rail. Compact links retain accessible names and native title labels. Desktop collapse is persisted; mobile uses the existing modal drawer.
- The sidebar renders one continuous list with no section labels, group wrappers, divider lines, disclosure arrows or saved group-collapse state, including in Help. Permission filtering happens before links are rendered.
- Settings, Exports and Help follow the other links in the same list. The account menu stays anchored without divider lines. Workspace options stay in the global header. Names, initials and email addresses come from the current session.
- Keep a clear blue active surface and indicator, distinct icons for API logs and Webhooks, and the same base canvas and sidebar colour. Do not use fake workspace counters, plan promotions or status badges.
- Empty states use the shared resource-empty presentation with a 16px heading, short description and wrapping real actions.
- Recent emails on Overview combine subject and recipient, leaving room for readable status and submitted time.

## Compact spacing

- Sidebar links are 32px high with an 8px outer gutter and 8px inner horizontal padding. Keep 18px icons and 14px text. No group labels are rendered. Help articles are also one flat list.
- Main page gutters are 24px on desktop, 16px on tablet and 12px on small phones. Page and section gaps are 16px. Never reduce the font size to create density.
- Cards use 20px padding (16px on small phones); metric cards use 16px with a 112px minimum height. Tables, cards, forms and detail panels share the same compact wrapper spacing.
- Toolbars and table footers use 12px by 16px insets. Table cells use 8px by 12px. Keep their existing scroll containers, labels and recovery states.
- Settings rows, the template editor, Overview, Help reading layouts and the API side sheet use the shared spacing scale. Do not override retained Atlaskit control internals to make them smaller.

## Filters and table layout

- Overview uses the header period selector (past day, seven days or thirty days), with no repeated time subtitle. The API accepts hours and returns submitted_in_window for that period. Daily quota fields remain independent and retain their rolling-day meaning.
- Overview recent activity uses the selected period; first-use setup checks use an unfiltered email lookup so changing the period cannot restart onboarding.
- Overview and Analytics period controls sit with page actions and persist in the URL. Analytics delivery mode also persists.
- Email filter values live in the URL. The dialog edits a draft and applies all fields together. Cancel does not alter the request. Applied chips can be removed individually, and Clear filters resets the entire applied state, including header search.
- Date labels are From date and To date. The end date is inclusive, translated to the following local midnight for the API's exclusive created_before bound. Reject invalid/reversed dates without making a request.
- Filter changes reset cursor pagination before the new query renders. Header email search preserves other email filters. CSV and queued exports consume the same applied query.
- Filters belongs in the page header. Do not reserve a blank toolbar row when no filters are active; the chips row appears only when needed. Keep only one Clear filters action.
- Top-level list tables extend to the canvas edges and use the page gutter on their first/last cells. Nested tables retain their parent layout. Keep scrolling inside tables and preserve readable column widths; do not hide content to mask overflow.
