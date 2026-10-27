# Abuse prevention

Outbound email is a high-risk privilege. This page lists what is enforced today and what must exist before public registration opens.

## Enforced

| Control | Detail |
|---|---|
| Closed signup by default | `ALLOW_PUBLIC_SIGNUP` defaults to `false`; signup is throttled to 5 per hour per IP. |
| Sandbox tier | New organizations get `sending_tier='sandbox'`, `daily_recipient_limit=100`, `per_minute_recipient_limit=10`. Raising them is currently a manual database change. |
| Quotas | Checked transactionally at admission under a per-org advisory lock, across a rolling 24 h and 1 minute: `quota_exceeded` or `rate_limited` (HTTP 429, SMTP 451). |
| Verified domains only | Ownership TXT + DKIM required; no sending from shared or platform domains. |
| Credential scoping | Sending-only API keys; per-domain restriction; SMTP CIDR allow-lists. |
| Suspension | `organizations.status != 'active'` blocks admission, SMTP AUTH and dispatch (mail already queued is failed, not sent). |
| Attachment blocklist | `exe com bat cmd scr pif vbs vbe js jse wsf wsh msi msp jar ps1 psm1 hta cpl reg lnk dll iso img vhd vhdx`; 10 MiB total; 20 files. |
| Message limits | 50 recipients per email, 100 emails per batch, header and subject validation. |
| Suppression | Hard bounces are suppressed automatically, and suppressions are re-checked at dispatch. |
| Request rate | Per key/user per second (Redis). |

## Missing (blockers for public registration)

* Email verification of new accounts (`users.email_verified_at` exists but isn't enforced or sent).
* An account review or approval workflow and an admin UI for tiers and suspension.
* Content and URL scanning (phishing, malware). There's no antivirus integration.
* Complaint feedback loops (ARF) and complaint-rate suspension.
* Automatic risk scoring (bounce rate, sudden volume changes).
* CAPTCHA or bot protection on signup (not to be relied on alone).
* Unsubscribe handling (RFC 8058) for marketing mail; the marketing module isn't built.
