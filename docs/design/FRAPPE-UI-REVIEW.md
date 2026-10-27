# Frappe CRM UI alignment

Latest user refinement: remove all breadcrumbs, reduce control/panel corners to 4px and dialog corners to 8px, and keep the sidebar anchored. Upstream palette data remains unchanged; these product geometry overrides intentionally replace the upstream radii in the component recipes below.

The shell now uses a viewport-height grid, with independently scrolling main content and sidebar navigation. The account footer stays at the bottom of the viewport. Documentation uses the same model with an extra bar row; mobile navigation remains a full-height overlay. Fixed 56px sidebar offsets were removed. Route changes reset main-content scrolling before paint, and scroll anchoring is disabled to prevent async data from moving the new page. The browser's outer scrollbar is suppressed only while the workspace shell is mounted; auth pages retain normal document scrolling. The automation editor has a single dedicated title rather than a breadcrumb trail.

Reviewed 27 October 2026 against the local source at `C:/Users/skans/frappe-crm/crm`.

Reference components: `frontend/src/components/Layouts/DesktopLayout.vue`, `AppHeader.vue`, `AppSidebar.vue`, `components/LayoutHeader.vue`, `components/ListViews/ContactsListView.vue`, `pages/Contacts.vue` and `pages/Contact.vue`.

The mailer retains its own product navigation and workflows. The user's follow-up explicitly requires the exact Frappe CRM design system rather than the initial visual approximation. The pinned reference dependency is `frappe-ui@1.0.0-rc.2`.

Its framework-independent token module and four data files are vendored, unchanged, under `apps/dashboard/src/design/frappe` with the upstream MIT license and package integrity recorded in `provenance.json`. `scripts/sync-frappe-tokens.mjs` emits the exact 551 light-theme and 535 dark-theme variables. The design audit checks generated CSS against that source. Browser comparison verified all variables in both modes, with zero mismatches; production comparison normalizes harmless CSS minification such as `0.205` becoming `.205`.

Shared React components implement the upstream Button, TextInput, Badge, SidebarItem, ListHeader, menu and Dialog presentation recipes while retaining their existing behavior. This includes 28px default controls, 8px control corners, 16px dialog corners, the exact Frappe elevation shadows, 420-weight text, the upstream Inter 3.19 font files, and Lucide icons. Sidebar rows are 28px with 13px labels and 16px icons; the sidebar is 240px wide. The main canvas uses `surface-base`; the sidebar uses `surface-gray-1`, matching the CRM source. First visits default to light mode, as in the reference App.vue; saved theme choices remain respected.

The workspace initial badge was removed. Workspace options retain the organization name and accessible menu label. Email search occupies the center grid column on desktop and a full-width second row on small screens; breadcrumbs and help remain on the right. The full-screen automation editor retains its dedicated title and actions.

## Browser coverage

Isolated local fixtures were used; browser checks do not establish live email delivery or production backend behavior. Frappe source was inspected; a Frappe backend was not started.

Desktop and 390px mobile review covered Overview, Emails, Broadcasts, Automations, Analytics, Suppressions, Templates, Contacts, Domains, API keys, SMTP credentials, Webhooks, API logs, Exports, Notifications, Settings and Documentation. Detail review covered email, domain, add-domain, template, webhook, broadcast, broadcast editor, automation editor and a documentation article. Sign-in, signup and not-found rendering were also reviewed.

All seven settings tabs were opened. Review checked one page heading, no document-level horizontal overflow and no workspace initial badge. Wide tables scroll locally. A 320px header collision was found and corrected by constraining the workspace trigger and shrinking the brand artwork.

Additional checks cover search submission, filter preservation, cursor reset, sidebar collapse, mobile drawer Escape and focus restoration, light/dark/increased-contrast rendering, and the installed `/design-system` reference. Backend fixtures are kept under ignored `.data/`; they are not shipped in the app.

The initial production build was checked across 29 routes, with no document-level overflow, duplicate page heading or error-boundary render. Thirteen collection pages were checked with empty fixtures. A simulated API failure and its Try again recovery were verified on Emails. After exact token integration, the 29 routes were reviewed again in desktop light and mobile dark modes, followed by production desktop/mobile verification. API-key dialog inputs, select options, validation feedback and theme menus were also inspected. Production control checks caught and corrected utility-style overrides on input backgrounds and badge weights. Dashboard typecheck, 42 unit tests, production build and the design audit passed. Final previews are `.data/reviews/frappe-exact-light.jpg` and `frappe-exact-dark.jpg`.
# Sidebar and table refinement

Latest documentation reference: https://greenpelletsindia.com/resources/product-datasheets. The dedicated documentation view now uses one 272px searchable article tree, expandable article-section links, a wide 920px reader and tabular guide indexes. It retains the mailer header and theme; it does not invent PDF downloads, update dates or summarization actions. Documentation is removed from the workspace sidebar and remains available through Help/search. Section links support both cross-article and repeated same-article hash navigation.

The latest header follows the supplied account-menu reference: Notifications, icon-only Help, Settings gear and avatar on the right. The avatar dropdown has identity, Profile, Personal Settings, nested Theme, current Workspace/settings and Log Out. Personal Settings exposes the actual theme preference controls. The left workspace name is plain text. Current backend routes do not support workspace creation/switching or unread notification counts, so those are not invented.

Notifications now use a top-right floating modal with real API alerts, loading/error/empty states, pagination and webhook detail links. The underlying page and filters remain intact. The workspace-name favicon is removed. Header, sidebar and controls share a 14px font scale, metadata uses 12px and page titles use 20px, including documentation. The Frappe palette remains unchanged.

The user restored the global top header: a 56px row with brand/workspace on the left, centered universal search and Help/notifications on the right. The single workspace/account menu stays in the header, with no duplicate personal dropdown. Navigation and documentation rails start below it; the search dialog, settings modal and documentation reader behavior remain intact.

Documentation now uses the remaining content width rather than viewport width to lay out the reader. The 690px reading column only gains a right-hand contents rail when its own container has at least 960px available. At narrower sizes, article sections use an expandable list. The title/search remain fixed above topic-grouped pages. The documentation home uses compact section headings, article rows and a neutral quickstart panel. Article section tracking listens to the main scroll container.

The article rail now has an explicit Documentation heading above title search. Workspace settings, personal account, appearance and sign out share the single top favicon dropdown; the separate bottom account dropdown is removed.

Documentation retains the complete workspace sidebar and places a separate 240px article navigation immediately to its right. The article list includes published guides, title filtering and an active-page state. The Version/API version block and redundant documentation top bar are removed. On mobile, article pages expand above the content while the existing workspace drawer remains unchanged.

Settings now follows Frappe CRM `components/Settings/Settings.vue`: a 1024px dialog, viewport height minus 8rem, 224px section navigation, and a separate scrolling content pane. Existing account, team, usage, billing, SMTP, integrations and documents views retain their API actions. The background page keeps its location and filters; dismissing Settings restores it. Personal identity appears only in the bottom account control, while the favicon row identifies the workspace.

The workspace identity now follows the Frappe UserDropdown structure: one dropdown row with the actual favicon, workspace name and a Workspace label. The collapsed rail keeps the favicon. Universal search opens a modal from the sidebar or Ctrl/Cmd+K. It searches permitted pages and guides plus server-filtered emails, contacts, broadcasts and automations; contacts open their matching list through a URL filter. Loading and partial API failures are announced, and results remain permission-aware. Browser review uses isolated fixtures; source integration tests verify record requests and links.

Standard desktop pages place branding, workspace selection and search in the full-height sidebar, with no global top header. Mobile uses a compact navigation bar; the automation editor keeps its task toolbar. Navigation scrolls independently above the persistent account controls.

Resource tables use 40px single-line rows, ellipsis for long values and hover titles for full text. Column minimum widths create local horizontal scrolling on narrow viewports. Fixture browser checks confirmed 40px rows on desktop and at 390px, a 700px table within a 366px scroll region, and horizontal keyboard scrolling without page overflow.

