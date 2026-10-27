# Frequently Asked Questions

**Does "Accepted by recipient server" mean the email is in their inbox?**
No. It means the recipient's mail server accepted it. Whether it lands in the inbox or spam is decided by that provider. See [My email went to spam](EMAIL-IN-SPAM.md).

**Do you use another email provider behind the scenes?**
No. Email is delivered by the platform's own mail servers directly to the recipient's mail server.

**Can I send from Gmail, Outlook or Yahoo addresses?**
No. You can only send from domains you own and have verified.

**Can I send from a subdomain of my verified domain?**
Yes. If `yourcompany.com` is verified, you can also send from `notify.yourcompany.com` within the same project.

**Why did my new account hit a limit?**
Open **Settings > Sending limits** to review the configured allowance. Authorized users can adjust it when the deployment allows changes. Local development may offer unlimited sending. See [Manage sending limits](SENDING-LIMITS.md).

**Someone left the company. How do I stop their access?**
Revoke any API keys or SMTP credentials they used (**API keys**, **SMTP credentials**). Member management in the dashboard is not available yet; ask your platform administrator to remove their membership.

**I lost my API key. Can you show it again?**
No. We store only a hash. Create a new key and revoke the old one.

**Can I recall an email?**
Only before it's handed to our mail server: scheduled emails, or ones still queued. Open the email and click **Cancel unsent recipients**. After hand-off it can't be recalled.

**How long do you keep retrying when a recipient's server is busy?**
Up to 2 days. After that the recipient shows **Failed** with the reason "retry expired".

**Why does an address show "Suppressed"?**
It hard-bounced before (the mailbox doesn't exist), or someone added it manually. Remove it in **Suppressions** if it's now valid.

**Can I see the content of emails I sent?**
Owners, Admins and Developers can, on the email's page. Analysts and Read-only members can't.

**How do I get notified about bounces in my own system?**
Add a webhook endpoint in **Webhooks**. Your developers can find details in the [webhook guide](../developer-guides/WEBHOOK-VERIFICATION.md).

**Which dashboard theme options are there?**
Match system, Light, Dark and Increased contrast. Open the account menu at the bottom of the left navigation and choose under **Appearance**. See [Themes and accessibility](THEMES-AND-ACCESSIBILITY.md).
