# Surfaces and empty states — October 26, 2026

## Surface rules

The latest light-theme request restores visible structural separation. Cards, metrics, settings sections, empty tables and side sheets use 1px semantic outlines without drop shadows. The sidebar's outer edge and header bottom retain their boundary; the flat navigation has no internal group dividers. Settings cards use separate action footers. Tables retain an outer boundary and header separator, with lighter body-row rules. Controls and keyboard focus indicators remain visible. White canvas and sidebar surfaces stay white.

The six supplied Resend settings captures establish a light structural border of `#d7d7d7`, lighter `#eeeeee` data-row rules, outlined cards and action footers without shadows. These are centralized as `--border` and `--border-subtle` in ui.css, with dark and increased-contrast equivalents. See the latest section of [the reference alignment ledger](UI-REFERENCE-ALIGNMENT.md) for observations and verification.

The saved Broadcasts editor was replayed with scripts and remote requests blocked. REA evidence `ev_275062a4f4859adcc308034f527573ad858c64af67831021935d3cb071d446a6` shows an open canvas, compact field rows, style inspector, editor/code modes and review/test actions. This is visual evidence, not proof of authenticated actions or complete feature reconstruction.

## Current artwork

The user rejected neobrutalism. Replacements use white paper forms with fine blue edges and subtle internal blue shading. All four have transparent backgrounds, without heavy outlines, hard cast shadows, text, logos or confetti. The palette remains blue and white.

Generated with the **built-in imagegen tool**, one generation per subject, with `transparent_background: true`. No CLI fallback or raster post-processing. The mail output supplied the style reference for the other three generations. Each output was visually inspected and copied into the project:

- `apps/dashboard/public/illustrations/mail.png`: envelope, letter and smaller folded message.
- `apps/dashboard/public/illustrations/automation.png`: connected event, delay and email cards.
- `apps/dashboard/public/illustrations/search.png`: documents and a magnifying lens.
- `apps/dashboard/public/illustrations/resources.png`: folder with contact and record cards.

Artwork is decorative (`alt=""`); adjacent text and real actions convey the state. Reserved image boxes fit these compositions without stretching. Keep artwork within narrow viewports. Update the URL version when replacing assets to invalidate cached artwork. Inter remains the application font.

### Exact prompts

Mail:

> Use case: stylized-concept. Asset: refined enterprise email platform empty-state illustration, transparent background. Subject: an open white paper envelope with a letter emerging, with a second smaller folded message resting beside it. Create a quiet sophisticated editorial paper illustration, soft subtle dimensional layering with very fine blue edge contours, restrained blue planes and broad clean white areas. Airy, precise, warm but professional. Palette strictly white and shades of blue including pale icy blue and royal cobalt; no black, gray, other hues. Delicate dimensional depth within objects, no cast shadow, no heavy outlines, no neobrutalism, no chunky icon, no confetti, stars, decorative dots, labels, text, logo or background. Composition landscape about 1.22:1, objects fill central 82% of image with modest negative space, graceful asymmetric arrangement, fully visible edges, useful at 264x216 pixels. Export actual transparent alpha.

Shared style prompt for the remaining assets (mail PNG supplied as a style reference):

> Use case: stylized-concept. Asset: enterprise email platform empty-state illustration. Input image is STYLE REFERENCE ONLY: match its refined white folded-paper material, very fine blue edge contours, soft blue internal dimensional layering, no heavy outlines, blue-and-white palette and transparent cutout. Make a new scene, not an envelope copy. Landscape composition about 1.22:1, subject fills central82% with modest clear margins, legible at264x216. Strict white and blue shades only, no other colors, no black, no gray, no text/logos, no confetti/stars/dots, no background, no cast shadow, no chunky icon and no neobrutalism. Actual transparent alpha.

Automation subject:

> Subject: a graceful short branching workflow made of three small white folded-paper cards arranged upper-left to lower-right. The first card bears a minimal blue event pulse, linked with a very thin blue curved connector to a white clock card, then to a small envelope card. Small blue connector joints belong to the workflow. Show connected movement and layering; quiet precise composition rather than a UI screenshot. Keep card proportions compact and avoid excessive white margins.

Search subject:

> Subject: two white paper document sheets resting at a gentle angle with a delicate translucent pale-blue magnifying lens hovering over the front sheet. Fine cobalt rim and slender blue handle, a few unobtrusive pale-blue abstract lines on the paper, gracefully folded sheet corner. Balanced composed vignette, lens neither huge nor cartoonish, quiet professional editorial character.

Resources subject:

> Subject: a gently opened white paper folder with a subtle blue inner lining, holding two layered white records cards. One card has a small simple blue profile silhouette and two pale-blue abstract lines; another has three pale-blue record lines. Folder and cards turn slightly in perspective, graceful thin blue edges and a fine folded corner. Quiet professional editorial arrangement, realistic paper thinness, not toy blocks.

Original output directory: `C:/Users/skans/.codex/generated_images/01a174f0-837a-7e60-9022-ade177f1897e/`.

| Asset | Generated file |
| --- | --- |
| Mail | `exec-f9484ba6-9608-427e-a3b9-8c815a4c1c4f.png` |
| Automation | `exec-5f71983f-0481-4509-b3e6-b6a83bd40b84.png` |
| Search | `exec-2a061e8b-7128-49da-a924-4ad7510a395c.png` |
| Resources | `exec-b2d00a58-7bff-46d7-ac32-1c3fc842a392.png` |

## Verification record

Current assets were visually inspected for subjects, cohesive style, blue/white palette, complete edges and transparency. The shared image URL now uses `?v=calm-blue` to invalidate the previous artwork.

The Overview now puts sending volume and recipient status in one aligned analytics row, above a full-width recent-email table. When the selected period has no recipient activity, the separate status section is absent; no empty status card floats beside the table. Long recipient breakdowns scroll locally. Sending-volume errors retain a retry action, and an empty selected period is distinguished from a new workspace.

Current development checks: 15 Overview empty/populated/large-data cases across desktop, 390px/320px mobile, dark and increased contrast; period-filter and failed-chart recovery; 20 artwork cases across the same viewports/themes. No page overflow or Axe violations in the checked views. Actual installed component examples were inspected via REA before changes (`ev_6b9db7d095203d6243abdec6feff82dd1acdfc0a76c7b419e419af20ff269327`). Automation checks include a 50-node branching graph, keyboard selection, focused editing, revision conflict recovery, saved-template mapping, test previews and lifecycle/run controls in isolated API fixtures. These UI checks do not establish external delivery.

Production verification: dashboard typecheck, 32 unit tests, production build and design audit passed. The built app repeated the 15 Overview cases, filter/error recovery and 20 artwork cases successfully. Automation flows passed in five production contexts: 1440px light, 390px light, 320px light, 1280px dark and 1280px increased contrast, including empty/filtered states, 25-row pagination, a 50-node workflow and read-only permissions. Representative screenshots are in `.data/ui-check/overview-*`, `automation-default-*`, `automation-large-*` and `blue-white-*` (the last filename prefix is historical; these captures show the replacement artwork).

Historical validation before this replacement: 72 development and production empty/populated fixture states across nine resource pages and four viewport/theme combinations; a later 20-case illustration pass across desktop, 390px/320px mobile, dark and increased contrast. These checked image loading, bounded layout, shell borders, no unwanted shadows, and representative Axe checks. They are not validation of the latest artwork/editor and do not prove live email delivery.

The automation baseline was checked against the [official Automations announcement](https://resend.com/blog/introducing-automations). Implemented behavior and limitations are in [AUTOMATIONS-IMPLEMENTATION.md](AUTOMATIONS-IMPLEMENTATION.md).

