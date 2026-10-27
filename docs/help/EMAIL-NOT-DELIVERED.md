# My Email Wasn't Delivered

Open the email in **Emails** and look at the recipient's status. Then find it below.

## The API or SMTP Refused the Email

If your application got an error, the email was never accepted and nothing appears in **Emails**.

| Error | Fix |
| --- | --- |
| `domain_not_verified` / SMTP `550 5.7.1` | The From address must be on a domain with status **Verified**. |
| `sender_not_authorized` | The API key or SMTP credential is restricted to a different domain. |
| `quota_exceeded` | You've reached your 24-hour recipient limit. Wait, or ask support to raise it. |
| `rate_limited` | Too many recipients per minute, or too many requests per second. Slow down and retry. |
| `validation_error` | Something in the message is malformed; the error explains what. |
| `account_suspended` | Contact your platform administrator. |

## Status: Suppressed

The address is on your **Suppressions** list, usually because an earlier email to it bounced as "mailbox doesn't exist". If you know the address now works, remove it from **Suppressions** and send again.

## Status: Bounced

The recipient's mail server refused the email. The reason appears under the status:

| Reason shown | What it means | What to do |
| --- | --- | --- |
| mailbox unavailable | The address doesn't exist or is disabled. | Check the spelling. The address is now suppressed. |
| domain invalid | The recipient domain doesn't exist or can't receive mail. | Check the domain spelling. |
| recipient rejected | The server refused the address without saying why. | Check the address with the recipient. |
| policy rejected | The receiver's policy blocked the message (reputation, a blocklist, local rules). | Read the SMTP response for a link or code from the receiver. Check your domain's records still verify. |
| authentication rejected | The receiver says SPF, DKIM or DMARC failed. | Open **Domains**, click **Check DNS now**, and fix anything not Valid. Check that your DMARC record doesn't conflict. |
| content rejected | The content or an attachment was refused, sometimes as suspected spam or malware. | Review the content, links and attachments. |
| mailbox full | The recipient's mailbox is full. | Try again later, or contact them another way. |

## Status: Deferred

The recipient's server temporarily refused the email. This is common: greylisting, a full mailbox, a busy server. Our mail server keeps retrying automatically for up to 2 days, and nothing is needed from you. Don't send the email again, or the recipient may get two copies.

## Status: Failed

We stopped trying. Typical reasons:

- **retry expired**: the recipient's server kept deferring for the whole retry period.
- **sending is disabled for this domain**: your domain lost its DNS verification after the email was accepted. Fix the records in **Domains**.
- **organization is not permitted to send**: contact your platform administrator.

## Status: Accepted by Recipient Server, But They Can't Find It

The recipient's server took the email, so it is now inside their system. Ask them to check spam/junk, quarantine, filters and rules, and any company email-security portal. See [My email went to spam](EMAIL-IN-SPAM.md).

Rarely, a server accepts a message and bounces it later; the status then changes to **Bounced**.

## Status: Outcome Unknown

A connection inside our system dropped at the moment of hand-off. We're checking our mail-server logs to find out what happened rather than risk sending twice. It resolves by itself, usually within a couple of minutes.

## Still Stuck?

Contact your platform administrator with the **Email ID** (copy it from the email's page) and, for API errors, the `request_id` from the error response.
