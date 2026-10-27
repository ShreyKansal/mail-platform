# Flat navigation and compact application layouts

The user requested no sidebar accordions, less spacing and less left padding. This revision replaces the earlier collapsible-group design and applies a compact spacing scale throughout the app.

- Main navigation and Help use one continuous list of always-visible links, with no section labels, grouping wrappers or divider lines. Old saved group preferences are ignored. Permission filtering remains unchanged.
- Expanded sidebar: 232px. Icon rail: 64px. Navigation rows: 32px. Outer and inner horizontal padding: 8px each. Icons remain 18px and text remains 14px Inter.
- Main gutters: 24px desktop, 16px tablet and 12px small phone. Page and section gaps: 16px. The content width grows to 1440px when room is available.
- Cards use 20px padding, or 16px on small phones. Metric cards use 16px padding and a 112px minimum height. Table body cells use 8px vertical and 12px horizontal padding.
- Toolbars, footers, empty states, Settings rows, detail panels, template editor, Overview, Help and the API side sheet use the same reduced spacing scale.
- Inter, the supplied logo, header breadcrumbs/search, matching canvas/sidebar colours, existing permissions, error recovery and table scroll regions remain.

## Verification

Three navigation regression tests cover always-visible links despite old saved preferences, permission filtering and accessible rail labels. Browser checks cover no sidebar disclosures on main and Help routes, 32px navigation rows, the 64px rail, mobile focus/Escape, account menus and accessibility. Separate long-content table and all-route production checks cover overflow, font consistency and shared surfaces.

Review uses isolated API fixtures. It validates presentation and UI interaction, not live backend writes or SMTP delivery. Screenshots: `.data/ui-check/compact-navigation-*.png`. Browser scripts: `.data/check-flat-navigation.mjs`, `.data/check-table-typography.mjs` and the production review scripts.

Typecheck, production build, design audit and all 20 unit tests passed. Flat navigation and seven representative accessibility scans passed at five desktop/mobile/theme settings. Production review covered 48 routes each at desktop and mobile, plus eight representative routes each at 320px, dark and increased contrast. Nine forms, twelve detail/settings tabs, filters, seven API language examples and error recovery passed at desktop, 390px, 320px and dark. The side sheet passed desktop, tablet, mobile and dark checks for focus, sizing, copying, closing and the actual SDK download. Interrupted browser checks were rerun after transient local connection failures.

The subsequent sidebar simplification also moved Help into the same list as Settings and Exports, removed account-area borders, and removed category headings from Help article navigation. Link spacing is uniform throughout. All 20 unit tests and the four-layout browser checks passed, including checks for absent headings/dividers, mobile focus return, permission filtering and accessibility.
