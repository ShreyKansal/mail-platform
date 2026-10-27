# My Email Went to Spam

## What We Can and Can't Control

Once the recipient's mail server accepts your email (status **Accepted by recipient server**), that provider alone decides whether it goes to the inbox, a tab, spam or quarantine. **No email service can guarantee inbox placement**, and we don't claim to. What you and we can do is give providers every reason to trust your mail.

What we do for every email:

- Send from our own mail servers with consistent, correctly configured identities.
- Sign it with DKIM for your domain.
- Use a unique per-recipient return address, so bounces are processed and bad addresses are suppressed automatically.
- Stop you from sending to addresses that have already hard-bounced.

## Checklist

### 1. Authentication

In **Domains**, open your domain and click **Check DNS now**.

- **Ownership** and **DKIM** must be Valid (sending wouldn't work otherwise).
- Add the **Return-Path MX and SPF** records, so SPF also aligns with your domain.
- Publish **DMARC**. Large mailbox providers expect DMARC from anyone sending in volume. Start with `p=none`, then move to `p=quarantine` or `p=reject` once all your sending sources are authenticated.

### 2. Sender Identity

- Send from a consistent From address and name that recipients recognize.
- Use a subdomain (`notify.yourcompany.com`) for application email, so its reputation is separate.
- Make **Reply-To** a mailbox someone reads.

### 3. Content

- Include a plain-text version as well as HTML.
- Avoid link shorteners, many images with little text, and attachments where a link would do.
- Make sure every link goes to a domain you control and that works.
- Write like a person. Misleading subject lines invite complaints.

### 4. Recipients and Consent

- Only email people who expect your mail. Purchased or scraped lists damage reputation quickly.
- Remove addresses that bounce; we suppress hard bounces automatically.
- For newsletters and marketing, make unsubscribing easy and honour it immediately. A spam complaint costs far more than an unsubscribe.

### 5. Volume

New domains have no reputation. Increase volume gradually and keep it consistent. Sudden spikes from a new domain are treated with suspicion.

### 6. Ask the Recipient

- Ask recipients to mark the message "Not spam" and add your From address to their contacts.
- For business recipients, their IT team can check quarantine reports and filter rules.

## Related

- [DNS setup](DNS-SETUP.md) · [My email wasn't delivered](EMAIL-NOT-DELIVERED.md)
