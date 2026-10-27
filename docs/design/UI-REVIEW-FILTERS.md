# Period filters, applied state and full-width tables

## Behavior

Overview no longer shows a fixed time subtitle. Its top-right period selector requests a rolling day, seven days or thirty days from GET /v1/overview?hours=.... The endpoint validates a bounded integer period and reports submitted_in_window separately from organization-wide used_last_24h quota usage. Recipient counts stay scoped to the project. Domain counts remain current inventory.

Recent email activity follows the selected period. The setup checklist retains its unfiltered email lookup. Analytics period and delivery mode now live in the page header. Both pages preserve selected controls in the URL.

Emails uses a filter dialog with Apply/Cancel, inline date validation and inclusive end dates. The applied URL drives list requests, chips, CSV and queued exports. Header search combines with the existing filters. Reload, browser back/forward, chip removal and reset preserve predictable state. Pagination resets with the filter scope, preventing an old cursor from being sent with new filters.

The filter action is in the page header. A toolbar row appears only for applied chips. Duplicate empty-state Clear filters and Send test email actions were removed.

## Tables

Top-level tables extend to both canvas edges. The first/last cell padding aligns with the page heading gutter. Wide content scrolls within the table; nested tables retain their context. The Analytics chart scroll region is keyboard focusable on small screens.

## Validation scope

API route tests inject the real Fastify route with a stubbed tenant query layer: selected period, default period, invalid bounds, selected recipient counts and unchanged daily quota usage. These are not live database tests.

Dashboard tests cover URL restoration, inclusive end dates, invalid/reversed dates and filter-scoped cursor reset. Browser fixtures cover period requests, draft/cancel/apply, validation, URL reload/back/search, chips/reset, full-width geometry, dark/mobile reflow and WCAG A/AA scans. Long-content table review covers names, addresses, paths and DNS values.

Review scripts: .data/check-filters-wide-tables.mjs, .data/check-filters-production.mjs and .data/check-table-typography.mjs. Browser review is isolated from live email sending and production data.

All 25 dashboard tests and three API tests passed. Dashboard/API/contracts typechecks, dashboard/API builds and design audit passed. Development and production browser checks passed at 1440px, 390px, 320px and dark mode, including filter state and table edge geometry. Long-content checks passed on 17 routes at five viewport/theme settings.

Final production geometry checks measure the table and scroll region themselves, not just the outer panel. Legacy inner table padding and the reserved vertical-scrollbar gutter were removed so the rows reach both canvas edges; the nested Overview table also fills its complete region. Script: .data/check-final-table-edges.mjs.
