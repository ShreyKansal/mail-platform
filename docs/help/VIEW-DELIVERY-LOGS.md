# View Delivery Logs

## The Emails List

**Emails** shows every message sent through the API or SMTP, newest first, and refreshes automatically. Use the **Status** filter to find, for example, every email with a bounced recipient. Click a row to open it.

An email sent to several people shows **Mixed** when the recipients ended in different states.

## An Email's Page

The page has four tabs:

- **Recipients:** each address, whether it was To, Cc or Bcc, its current status, and the last response from the recipient's mail server.
- **Timeline:** everything that happened, in order. For example: accepted, handed to our mail server, then accepted or rejected by the recipient's server.
- **Content:** the **HTML** and **Plain text** you sent. HTML appears in a locked-down preview where scripts never run. Analyst and Read-only roles can't see message content.
- **Details:** the email ID (with a copy button), the Message-ID header, tags, metadata and the scheduled time.

Actions in the page header:

- **Reschedule** appears while every recipient is still scheduled. Choose a **New sending time**, in your local time and within 30 days.
- **Cancel unsent recipients** stops recipients that haven't been handed to our mail server yet. Recipients that are already on their way can't be recalled.

Hover over any status label, or focus it with the keyboard, to see what it means.

## What the Statuses Mean

| Status | Meaning |
| --- | --- |
| Scheduled | Waiting for its scheduled send time. |
| Queued / Dispatching | Accepted and about to be sent. |
| Handed to mail server | Our mail server has the message and is delivering it. |
| Deferred | The recipient's server asked us to try again later. This is normal (for example "greylisting"); we keep retrying automatically for up to 2 days. |
| Retrying hand-off | A brief internal delay; it retries automatically. |
| Outcome unknown | A connection dropped at a critical moment. We're checking our server logs instead of risking a duplicate, and the status resolves on its own. |
| **Accepted by recipient server** | The recipient's mail server accepted the email. This is the furthest any email service can see. It **doesn't guarantee** the email landed in the inbox rather than spam. |
| Bounced | The recipient's server refused the email. The reason appears under the status and in "Last SMTP response". |
| Failed | We stopped trying (for example, the recipient's server kept deferring for 2 days). |
| Suppressed | Not sent, because this address is on your suppression list. |
| Cancelled | Cancelled before sending. |

## Overview

**Overview** totals the last 24 hours by status and shows how much of your daily limit you've used. All figures come from your actual delivery records.

## Related

- [My email wasn't delivered](EMAIL-NOT-DELIVERED.md)
