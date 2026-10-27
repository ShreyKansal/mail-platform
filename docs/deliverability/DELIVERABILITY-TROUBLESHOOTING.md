# Deliverability troubleshooting

The platform reports what it **observed**: hand-off to its MTA, and the remote server's SMTP answer. It can't see inbox versus spam placement. Never present `REMOTE_ACCEPTED` as "delivered to inbox".

| Observation | Meaning | What to do |
|---|---|---|
| `domain_not_verified` on send | The `From` domain, and every parent, are unverified in this project | Verify the domain ([DNS records](SPF.md), [DKIM](DKIM.md)) |
| Domain verified, then `sending_enabled=false` | Drift: the ownership or DKIM record was removed or changed | Re-publish; check the domain page's "Found in DNS" |
| `BOUNCED`, `authentication_rejected` (5.7.26 etc.) | The receiver's DMARC/SPF/DKIM checks failed | DKIM record valid? DMARC policy sensible? Custom Return-Path active for SPF alignment? PTR in place? |
| `BOUNCED`, `policy_rejected` (5.7.1) | Reputation, blocklist or content policy at the receiver | Read `last_response`; check the IP and domain on blocklists; slow down and clean the list |
| Repeated `DEFERRED`, `greylisted` | Normal greylisting | Nothing; Postfix retries |
| Repeated `DEFERRED`, 4.7.x rate-limit text | Receiver throttling | Reduce volume. Per-provider throttling isn't built ([SMTP-TO-MX](../smtp/SMTP-TO-MX.md)). |
| `REMOTE_ACCEPTED` but the user can't find the mail | Spam folder or a receiver-side filter | Check the receiver's spam folder and their postmaster tools; review DMARC alignment and content |
| `SUPPRESSED` | The address hard-bounced earlier, or was suppressed manually | Remove the suppression only if the mailbox is known to be fixed |

Gather these for any investigation: email ID, recipient ID, `mta_queue_id`, `last_smtp_code`, `last_enhanced_status` and `last_response` (`GET /v1/emails/{id}`), and the matching `maillog` lines (`grep <queue id>`).
