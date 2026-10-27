# Workspace information architecture

The application uses Confluence-inspired separation between global utilities, workspace navigation and task content. This is an adaptation for email infrastructure, not a Confluence clone or an installation of the Navigation System package.

| Area | Destinations | Purpose |
| --- | --- | --- |
| Delivery | Overview, Emails, Analytics, Suppressions | Monitor sending and investigate recipient outcomes. |
| Content | Templates, Contacts | Maintain message content and recipient data. |
| Developer | Domains, API keys, SMTP credentials, Webhooks, API logs | Configure sender identity and connect applications. |
| Workspace | Settings, Exports | Manage configuration, quotas and exports. |
| Help center | Task articles, topic navigation, article tree | Find guidance without inserting documentation buttons into every task. |

Routes and permission checks remain authoritative. Contacts retains /audience and Analytics retains /metrics. Labels and breadcrumb sections share lib/navigation.ts.

## Global shell

The header contains a navigation toggle, the supplied Frame wordmark, a workspace menu, centered breadcrumbs, compact email search, help and notifications. LinkedIn cover - 14.svg is used only for the favicon. A dark variant adjusts the wordmark lettering for contrast.

Desktop sidebar collapse is saved in this browser. Mobile uses a modal navigation drawer with focus containment and Escape dismissal. Following a help topic closes the mobile drawer even when only query parameters change.

The header help menu offers contextual help when mapped, the Help center and API examples. The API sheet restores focus to the persistent Help button because its originating menu item unmounts when selected.

## Page hierarchy and actions

- Use one h1, a short task description and the actions needed for that task.
- Do not automatically inject Guide buttons. Help remains available in the header.
- Put infrequent destructive and credential actions in labelled overflow menus. Preserve confirmation and permission checks.
- Avoid repeating navigation links in settings content or showing disabled menu items as informational placeholders.
- Empty states explain the resource and offer one permitted creation action. Filtered empty states offer filter recovery.
- Tables scroll inside their container. Loading and error states preserve filters and retry controls.
- Represent server acceptance truthfully; it does not establish inbox placement.

## Help space

Help reuses the sidebar rather than adding a second rail. On the index, the sidebar filters five task-oriented topic groups. In an article, it becomes an expandable page tree with the current article selected. Back to workspace returns to Overview.

The help index previews three articles per topic; selecting the topic heading opens the full list. Search matches article titles and summaries. Search and topic selection use query parameters so reload and browser history preserve context. Hide unpublished entries rather than displaying Coming soon cards.

Articles have a bounded reading width, a measured reading time, section anchors, an On this page list and related articles. Small screens put contents above the article. Headings in code fences are not article sections; repeated heading names receive distinct IDs.

Only help and developer-guide Markdown enters the documentation loader. Internal architecture, design catalogs and reverse-engineering audits are not customer help.

Settings exposes Workspace, Sending limits and Account tabs. Numeric quotas and unlimited local sending are described according to actual API capabilities, not a removed sandbox banner or an assumed support process.

## Reference evidence

[Confluence navigation](https://support.atlassian.com/confluence-cloud/docs/what-is-the-new-navigation-in-confluence/) documents a collapsible sidebar, space context and global utilities. [ADS layout](https://atlassian.design/components/navigation-system/layout) distinguishes top navigation, side navigation and content areas.

REA capture_browser_scenario inspected the public Confluence support page on 24 October 2026 with Edge at 1440 x 1000. Evidence ID: ev_0f898aeb77f186d37c9ca20c6bc17c6a528264ae1f017bcb4a8dff7fb0b1b14e. DOM and accessibility were captured after navigation and a declared wait. This was a public reference-page observation, not an authenticated Confluence product session. The implementation choices above are project adaptations.

## Typography and canvas

Use only the self-hosted Inter family for app text, controls, overlays and code. The logo is supplied artwork. Main canvas, sidebar and header use the same semantic sunken surface in every theme; content tables and form panels keep their own surfaces. Mobile metrics use two columns to preserve space for activity.
