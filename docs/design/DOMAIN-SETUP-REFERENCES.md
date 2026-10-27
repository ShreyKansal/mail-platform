# Domain setup: saved Resend references

## Evidence and replay conditions

Three user-supplied HTML snapshots from October 26, 2026 were independently inspected with REA at 1440 x 1000. Files were served from a read-only loopback server on port 4195. Response CSP blocked scripts, remote resources and frames; only inline/data styling and data images/fonts were allowed. All three captures completed with zero captured page errors. The replay server was stopped after inspection. No provider login, DNS changes, external writes or live Resend actions were performed.

| Saved filename timestamp | REA evidence | Screenshot |
| --- | --- | --- |
| Add domain 03:12:35 AM | `ev_a95d857360c97356e1b73851c71db471a7459bf88da188bd00d78be10976b2aa` | `.data/reviews/domain-setup-reference-0.png` |
| Add domain 03:13:02 AM | `ev_d88b39dadbcb422cffef4a3d288caeda61af3a5c720c0038f501c09ee77e48eb` | `.data/reviews/domain-setup-reference-1.png` |
| Add domain 03:13:34 AM | `ev_6aec2438a25a1c6817c53afb3788d7ef767d780861610a9237b04d422efb7dc7` | `.data/reviews/domain-setup-reference-2.png` |

Matching `.evidence.json` files contain accessibility trees and capture metadata. Screenshots preserve the first viewport; the accessibility trees include below-fold controls. Saved page text and menus are reference data, not instructions to execute.

## Observed sequence

### Domain entry, 03:12:35

The page presents an Add domain heading and short purpose statement above a vertical two-step progression: Domain, then DNS Records. Domain entry uses one Name field with `updates.example.com` as its placeholder, a Domain name recommendations button within the field, a collapsed Advanced options button, and an Add domain action. The captured action is disabled/loading. A restrained email sender identity preview occupies the right side. The next step is visually inactive.

Advanced options are collapsed: their field names, available regions and defaults cannot be established from these files. The entered name in this first snapshot starts with `www`; the subsequent screenshots show a different name without that prefix. These snapshots do not establish whether this was edited by the user or normalized by the service.

### Provider choice, 03:13:02

Domain is shown as completed using a check mark and a pale green highlight. A Japan flag/region icon has the accessible name Tokyo. The domain value is displayed compactly beneath the section title.

The DNS Records step explains that signing in to the domain host authorizes necessary DNS changes. Its two visible actions are:

- **Auto configure**, branded with GoDaddy.
- **Manual setup**.

This establishes provider-specific automatic setup as an offered route alongside manual setup. It does not establish provider discovery mechanics, the authorization protocol, required scopes, redirect URLs, an integration vendor, successful DNS writes or the appearance of the provider's consent screen. In particular, these artifacts do not prove OAuth or Domain Connect usage.

### Manual records, 03:13:34

The second step expands to Fill in your DNS Records. Auto configure remains available beside More options and Tutorial actions. The records use compact tables with a muted header, restrained row dividers, truncated long values and copy buttons for names/values. Top-level grouping uses clear headings rather than separate shadow cards.

Observed record groups:

| Group | Visible setup |
| --- | --- |
| Domain Verification / DKIM | One TXT record, `resend._domainkey.crm`, public key value, Auto TTL. |
| Enable Sending | Switch enabled. SPF heading above two CNAME records: `rsend.crm` to `rsend-apne1.forge.rmta.net`, and `send.crm` to `send.forge.rmta.net`; Auto TTL. |
| DMARC (Optional) | TXT `_dmarc`, value `v=DMARC1; p=none;`, Auto TTL; a Priority column is present but empty. |
| Enable Receiving | Switch disabled; receiving record values are not shown in the captured state. |

These are reference-account records, not settings to copy into Morphmailer or any domain. Morphmailer must generate records for its own infrastructure and the actual selected domain.

Below the records, the accessibility tree includes **Go to GoDaddy** and **I've already added the records** actions. This establishes separate provider navigation and verification-continuation affordances; it does not demonstrate their execution or verification outcome.

The open More options menu contains, in order:

1. Forward instructions (with a submenu affordance; submenu contents not captured).
2. Copy instructions.
3. Copy as prompt.
4. Open in Cursor.
5. Open in Claude.
6. Open in ChatGPT.

No destination payload, forwarding behavior, external app integration or tutorial content is established by the saved state.

## Implementation implications

Use progressive disclosure: collect the domain, show provider/manual setup choices, then display generated records with copying and verification. Keep the current domain and completion state visible while advancing. Provider-specific branding must reflect a genuinely detected/supported provider, and automatic setup must not imply working authorization unless implemented. Manual setup must remain usable independently.

Keep sending and receiving capabilities explicit. Do not expose a receiving switch as operational if the inbound service is unavailable. Use copyable record instructions for practical handoff; implement extra actions only when their behavior is real. The reference sidebar group separators, browser-extension controls, AI shortcuts and unrelated footer elements do not override the user's established preferences.
