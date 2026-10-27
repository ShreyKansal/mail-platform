# Table and typography corrections — 24 October 2026

The reported issues were reviewed in shared styles and across table routes. The earlier shared UI check covered global page overflow but did not adequately cover cell boundaries or readable column allocation.

## Corrections

- Sidebar links and compact buttons now use the same 14px Inter scale as body text and table values. Smaller captions, navigation group headings and status badges retain a deliberate 12px size.
- Help navigation links, article contents links and article body text use the same 14px body scale.
- Fixed table widths and readable minimum table sizes prevent long resource names from squeezing neighbouring columns. Each table owns horizontal scrolling.
- Product cell selectors now override the CSS reset's removal of first/last cell padding. Horizontal insets remain 16px throughout.
- Long plain values and resource names show at most two lines. Full plain values remain in native titles. DNS record content and copy controls remain available.
- Webhook delivery actions wrap, fixing a reproduced Replay button overlap in the final column.
- Redundant page descriptions and Settings introductions were removed. Sending limits explain recipient counting directly. Repeated delivery language was shortened while retaining the distinction between server acceptance and inbox placement.

## Review scope

Isolated browser fixtures use long names, subjects, email addresses, webhook paths and DNS values. Checks cover cell boundary containment, shared 14px typography, loaded Inter, page overflow and runtime errors. Viewports cover 1440px, 1024px, 390px, 320px and dark mode. These are presentation checks, not live backend or SMTP validation.

Browser script: `.data/check-table-typography.mjs`. Screenshots: `.data/ui-check/table-fixed-*.png`. Implementation rules: [SHADCN.md](SHADCN.md).

Final long-content checks passed on all 17 routes at each of the five viewport/theme settings. TypeScript, all 17 unit tests, the production build and design audit passed. Production accessibility checks also passed on twelve routes at desktop and mobile, plus the webhook form and scheduled-email actions.
