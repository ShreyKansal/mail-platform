# Application UI review - 24 October 2026

## Confluence-inspired update

The task shell now has a collapsible, persistent desktop sidebar, a distinct content canvas and compact global breadcrumbs. Navigation groups are Delivery, Content and Developer, with workspace utilities below. Mobile navigation retains its modal focus and dismissal behavior.

Repeated Guide actions and empty-state help links have been removed. Global Help provides contextual help, the Help center and API examples. Infrequent domain and webhook actions use labelled menus. Redundant workspace-navigation buttons and disabled menu placeholders were removed. The first-use setup checklist precedes monitoring data; configured workspaces use the full content width for delivery summaries.

Help center replaces the long card catalog with task starting points, topic previews, title/summary search and bookmarkable topic views. Articles reuse the sidebar as a page tree, include unique section anchors and provide contents and related-article navigation. Inline article links are underlined. Internal design and architecture Markdown is excluded from the help loader.

Stale sandbox-banner, old-navigation, quota-support and outdated action instructions were corrected. Templates, Contacts and Sending limits now have published task articles. See [Information architecture](INFORMATION-ARCHITECTURE.md) for sources, REA evidence scope and implementation rules.

## Verification

Dashboard TypeScript, unit tests, production build and design audit are required. Browser checks use isolated API fixtures, not a live delivery backend. Review covers populated application routes, settings failure recovery, quotas, search, filtered and first-use empty states. The new help flows cover sidebar collapse persistence, topic selection, mobile drawer dismissal, article selection, section anchors, search recovery, and long-title header reflow.

Production rendering was checked at desktop, tablet and phone widths, including 320px reflow, dark mode and increased contrast. The API sheet checks keyboard focus containment and return, all language tabs, clipboard examples and the actual downloadable SDK archive. Automated WCAG A/AA checks cover the help index, quota, template and contact articles, plus settings. They do not establish complete accessibility conformance. Fixtures do not validate SMTP delivery or backend authorization.

## Inter and shared canvas follow-up

The current visual requirement is Inter throughout the app and identical sidebar/header/canvas base surfaces. See [Inter UI review](UI-REVIEW-INTER.md) for page and control coverage, REA evidence, fixes and validation boundaries. The previous distinct white page canvas is superseded.
