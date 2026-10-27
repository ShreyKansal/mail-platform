# Sending subdomains

## Rule

`findSendingDomain(org, project, fromDomain)` looks for verified, sending-enabled domains in the same project whose name is the `From` domain **or one of its parents**, and picks the longest match.

| Verified domains | `From` | Signing domain used |
|---|---|---|
| `example.com` | `noreply@example.com` | `example.com` |
| `example.com` | `alerts@mail.example.com` | `example.com` (relaxed DKIM alignment) |
| `example.com`, `notify.example.com` | `x@notify.example.com` | `notify.example.com` |
| `notify.example.com` | `x@example.com` | — rejected: `domain_not_verified` |

Controlling a parent domain implies controlling its subdomains. A parent never inherits from a child.

## Recommendation

Verify a dedicated subdomain per traffic type, for example `notify.example.com` for transactional mail and `news.example.com` for marketing. Each gets its own DKIM key and Return-Path and builds its own reputation, so a marketing problem doesn't hurt password resets. API keys and SMTP credentials can be restricted to a single domain (`domain_id`).

## What the platform will not do

It won't invent subdomains per message, or rotate sending identities, to get around receiver filtering. Reputation follows authenticated, consistent identities and recipient consent.

## Not built

Per-stream policy enforcement (for example, "marketing only from domain X") and dedicated IP pools per subdomain.
