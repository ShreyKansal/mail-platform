> Historical review. The later [compact layout revision](UI-REVIEW-COMPACT.md) removes sidebar accordions and updates the spacing and widths.

# Navigation and shell redesign — 24 October 2026

The user remained dissatisfied with the sidebar and the overall application. This revision changes navigation behavior and hierarchy, shared presentation and the Overview summary.

## Final design

- Expanded sidebar: 256px. Compact desktop sidebar: 72px icon rail with accessible link names and titles. Collapse no longer removes all navigation.
- Overview is separate from the Sending, Content and Developer groups. Groups collapse independently and save their state. Navigating into a group reveals its active route. Empty groups are omitted after permission filtering.
- Settings and Exports sit together under Workspace. Help and a persistent account control remain at the bottom. Account and workspace initials, names and email come from the session.
- Navigation uses distinct 18px Lucide icons, a blue active surface and indicator, 14px Inter labels and a consistent row height. Primary actions use blue; the global header, sidebar and main canvas retain their shared neutral base.
- The supplied logo, workspace options, centered header breadcrumbs and compact global email search remain in the header.
- Resource empty states use a restrained icon, 16px title, short description and wrapping task actions. Overview combines subject and recipient so status and submitted time remain readable. Email Source and Created columns receive enough width for their labels.

## Production font correction

Visual review identified a real production difference: the bundled CSS contained one merged font-face block, with the normal declaration overwritten by the italic source. Checking only font-family had missed this.

Both original Inter font-face declarations now live in public/fonts/inter.css and are linked before the app. They bypass CSS optimization; typography token mappings remain in src/typography.css. Verification explicitly checks normal and italic face registration and a loaded normal face.

## Verification scope

Isolated API fixtures supply long content and resource states. Checks cover desktop, short-height desktop, 390px and 320px mobile and dark mode. Navigation checks exercise group persistence, route activation, rail navigation, mobile focus/Escape, Help in compact mode and account theme selection. Seven representative pages per layout receive WCAG A/AA axe scans. Existing unit tests, TypeScript, design audit and the production build are also run.

These checks establish UI behavior and presentation; they do not validate live API writes, SMTP or production data. Browser scripts and screenshots are in .data/check-shell-v2*.mjs and .data/ui-check/shell-v2-*.png.

Final production checks confirmed both normal and italic Inter faces loaded separately. All 17 unit tests, typecheck, build and design audit passed. Production route review covered 48 routes each on desktop and mobile, with eight representative routes each at 320px, dark and increased contrast. The navigation suite passed five layout/theme settings; shared forms, tabs, Help menu and API example languages passed desktop, mobile and dark. A contacts-only role hid forbidden links and empty navigation groups; malformed saved group preferences recovered without breaking navigation.

REA controlled replay of the production Overview exposed the italic-face build error; its pre-correction record is `.data/reviews/shell-v2-production.evidence.json`. The final settled Playwright screenshot after the correction is `.data/ui-check/shell-v2-overview-production.png`, with separate normal and italic face assertions in `.data/check-shell-font.mjs`.
