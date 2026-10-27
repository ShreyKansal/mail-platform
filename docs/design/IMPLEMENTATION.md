> Current visual system: the user requires Frappe CRM's exact colors and component design as of 27 October 2026. See [Frappe implementation and verification](FRAPPE-UI-REVIEW.md). The React controls and retained Atlaskit behavior are styled through the pinned Frappe tokens and recipes; older ADS visual guidance below is historical where it conflicts.

﻿# Dashboard design implementation

## Sources and scope

Use the [element catalog](ATLASSIAN-CATALOG.md), [machine-readable elements](ads-elements.json), [source ledger](ads-source-inventory.json), and [installed tokens](ads-tokens.json). Official source: [Atlassian Design System](https://atlassian.design/design-system), reviewed 23 October 2026. The catalog contains original project recommendations linked to official pages, not copied Atlassian source code. All public same-origin documentation links within the declared sections were followed; failing links remain visible in the ledger. Interactive demos, authenticated libraries and external sites are not certified by this extraction.

## Decisions for this app

The installed component rendering reference is available at `/design-system` in development. It renders actual installed controls, states and overlays; it is separate from the broad documentation index. Production does not register this demonstration route.

The reference includes actual public imports for buttons, icon/link buttons, forms, disabled inputs, textarea, selection, checkbox, avatar, badge, status lozenges, dropdown actions, tabs, tooltip, modal/confirmation, section messages, spinner, flags, empty states, DynamicTable and code display. Their JSX lives in `apps/dashboard/src/pages/ComponentReference.tsx`. This is the installed-component sample set, not a claim that every catalog package is installed.

Rendering setup uses `@compiled/vite-plugin` 1.1.6 before the React plugin, with CSS extraction and sorting enabled. This line is compatible with the installed Compiled 1.x runtime; the newer plugin 2.x expects a different runtime and is not used here. See [Compiled installation](https://compiledcssinjs.com/docs/installation) and [Atlassian developer setup](https://atlassian.design/get-started/develop/atlassians). Atlassian currently describes Vite integration as experimental, so actual development and production browser rendering must both be checked.

The official `@compiled/css` sorter also processes pre-extracted `.compiled.css` during development. Responsive overrides follow base styles and use ordered breakpoints. Do not reintroduce duplicate base layout definitions or mix obsolete padding shorthands with current longhands.

The user requires Inter throughout the app. Inter 4.1 normal and italic variable fonts are self-hosted in public/fonts with the SIL OFL license. typography.css maps every ADS font-family and composite font token to Inter while retaining the ADS size and line-height scale; this includes code examples. No external font stylesheet is loaded. App CSS styles wrappers. It must not override DynamicTable cell typography/padding, Heading internals, or global label/input/button styling. Duplicate layout declarations have been consolidated so stylesheet sorting cannot choose an obsolete earlier layout.

| Concern | Implementation | Rule |
| --- | --- | --- |
| App setup | main.tsx; AppProvider; centralized theme.ts | One router adapter and one theme owner; preserve user/system appearance. |
| Page hierarchy | components/Page.tsx | One h1, parent breadcrumbs, wrapping actions, supporting description. |
| Navigation | components/AppShell.tsx; components/HelpNavigation.tsx | Permission-filtered task groups, persistent desktop collapse and modal mobile navigation. Help reuses the sidebar as a topic index or article tree. The shell is custom, not the Navigation System package. |
| Tables | components/Table.tsx | DynamicTable with local overflow and server cursors; sorting is limited to the loaded rows. |
| Overlays | components/dialogs.tsx; components/SideSheet.tsx | Installed ModalDialog manages dialogs. Cancel receives destructive-confirmation focus. Sheets opened from menus supply a persistent focus-return target. |
| Loading/error | components/feedback.tsx | Polite status for loading; persistent alert with retry and request ID for errors. |
| Status | components/status.tsx | Text lozenges represent observed backend states; tooltips supplement labels. |
| Numbers | pages/Overview.tsx | MetricText, not a heading styled as a number. |
| Forms | Atlaskit Form, Textfield, Select, Checkbox | Visible associated labels; exact API validation; pending/retry states. |
| Layout | index.css | Semantic tokens for visual decisions; explicit dimensions only for geometry and responsive boundaries. |

The custom shell is a project adaptation. A future `@atlaskit/navigation-system` migration needs version and React compatibility review; no claim is made that installing that package is already complete. Existing primitives/xcss imports are migration debt, not permission to expand caution-marked APIs. Storybook and official lint plugins are cataloged, not installed by this change.

## Visual rules

The current navigation, vocabulary and settings hierarchy are specified in [Information architecture](INFORMATION-ARCHITECTURE.md). Keep this mapping synchronized with `lib/navigation.ts`; labels should agree with page titles and top-header breadcrumbs.

- Base spacing is the ADS scale. Inline groups normally use space.100/150; containers use space.200/300; page separation uses space.400 or larger where needed. These are project defaults, not mandatory values for every component.
- Body text uses font.body; font.body.small is secondary context. Titles use heading tokens through Heading. Metrics use MetricText. Do not shrink the whole navigation or all labels to arbitrary 11px/13px sizes.
- Use color.text, color.text.subtle, color.text.selected and semantic feedback roles, rather than resolved light-theme colors. Pair surfaces and borders with their actual layer.
- Hover, focus, selected, disabled, loading and failure states must remain distinguishable. Color alone does not carry status.
- One primary task action per section. Move secondary actions into labelled menus when actions compete for space.
- Empty results explain the next action. Unavailable functionality does not receive a fake working tab or button.
- The brand SVG may retain its intentional brand color. Email-preview content has its own light document canvas; it is sandboxed and not dashboard UI.

## Review gates

Run `pnpm audit:design` to catch unknown ADS CSS variables, obsolete radius variables, production imports of deprecated navigation components and raw spacing/typography values. The check uses the pinned token inventory and reports explicitly allowed layout dimensions separately. It is a focused guardrail, not the official Atlassian ESLint/Stylelint toolchain or full accessibility certification.

Run dashboard typecheck, unit/accessibility tests and production build. Browser review should include populated and empty resource lists, filters, submit errors, confirmation dismissal, permissions, mobile keyboard focus, dark/increased contrast, long addresses and 200% zoom. Fixture testing does not verify SMTP delivery or production prerequisites.

## Refresh

The current source ledger contains the declared crawl scope and failed URLs. The catalog and token snapshot are versioned artifacts; update their review date and verify changed release phases when refreshing. Do not silently turn an upstream beta/caution label into a compatibility guarantee.
