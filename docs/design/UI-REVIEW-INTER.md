# Inter and shared-canvas UI review

## Product requirements

The sidebar, header and main canvas use the same semantic sunken surface. The white rounded page canvas is removed. Tables, forms and overlays keep distinct surfaces. Mobile metrics use two columns so activity remains visible sooner.

All application typography uses self-hosted Inter 4.1, including controls, code, headings and portal overlays. The original logo remains supplied vector artwork. Customer-authored email previews remain isolated documents. Typography mapping lives in apps/dashboard/src/typography.css, retaining ADS sizes and line heights. Font files, source hashes and the SIL OFL license are under apps/dashboard/public/fonts. Source: [official Inter repository](https://github.com/rsms/inter/tree/v4.1/docs/font-files).

## Issues corrected

- Different page and sidebar background surfaces.
- Mixed application font families and external font-stylesheet dependence.
- Inactive current-location breadcrumb buttons; current location is now text with aria-current, and parent pages are links.
- Missing standard heading and frame on the not-found page.
- Excessive mobile metric stacking and unnecessary horizontal scrolling in two-column summary tables.
- Scheduled-email actions that needed wrapping.
- Template action spacing, helper text running beside a button and always-visible API payload instructions.
- Missing descriptions for rescheduled-email and webhook-test events. The event-help map now requires every contract event at compile time.

## Review coverage

| Coverage | Review |
| --- | --- |
| 48 views | All app route types, authentication, not-found, three settings views and all 24 published help articles. |
| Five environments | Desktop light, mobile 390px, mobile 320px, dark and increased contrast. |
| Typography | Computed family for every visible text node and text input; actual Inter font-face load state checked in production. Native checkbox glyphs, SVG artwork and isolated preview documents are outside text-family assertions. |
| Base surfaces | Canvas and sidebar computed background equality. |
| Nine forms | Domain, API key, SMTP, webhook, add/import contacts, template, suppression and email submission. No fixture action sends real mail. |
| Detail panels | All 12 email/domain/template/settings tabs, filters and help menu. |
| API sheet | Seven language tabs and Inter in their code content. |
| Recovery | Contact-list failure preserves search, and retry restores rows. |
| Conditional actions | Scheduled-email action wrapping and rescheduling form. |
| Accessibility | Automated WCAG A/AA checks on representative pages and webhook form across light, mobile, dark and increased contrast; authentication included in the production pass. |

## REA evidence

REA capture_browser_scenario performed declared navigation and waits against the actual app through a loopback-only fixture proxy. Both 1440px desktop and 390px mobile captures completed 57 recorded steps with no page-error events. These are controlled UI observations, not a live-backend or mail-delivery validation.

- Desktop Evidence: ev_a163fa6529fbed3a33fede40fbd6767a19193b2676635ae8155b91faaa7906b5.
- Final mobile follow-up Evidence: ev_a947ff65f926093f5050d87e3c2b8cb744d6a92dab3348e21634ebb695cf97af.
- Final summary-table verification Evidence: ev_315742ad9020c29856ccd8f2220a9e2437894b1b14b97251e99d00c71f040458.
- Mobile Evidence: ev_9ac72af52bcb8b2bbd82a5983f891668f6992f7978bdf94e68cd7ba55563310f.
- Complete local evidence: .data/reviews/inter-desktop.evidence.json and .data/reviews/inter-mobile.evidence.json.

Automated checks and sampled screenshots do not establish perfect visual quality or complete accessibility conformance. Interaction fixtures do not validate authentication, backend authorization or delivery services. The normal application backend and user data were not modified by this review.
