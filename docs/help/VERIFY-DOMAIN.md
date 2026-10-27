# Verify a Domain

Before you can send email, you need to prove you own the domain you send from. You do this by adding a few records at your DNS provider, the company where your domain's DNS is managed (often your registrar, Cloudflare, Route 53, GoDaddy and so on).

## Steps

1. Go to **Domains** and click **Add domain**.
2. Enter the domain you'll put in the "From" address. We recommend a subdomain such as `notify.yourcompany.com` or `mail.yourcompany.com`, so problems with bulk mail can't affect your main domain.
3. Under **Advanced options**, leave **Return-Path label** as `bounce` unless that name is already used. Select **Add domain** to continue to DNS setup.
4. Choose **Auto configure** to connect your provider, or **Manual setup** for any DNS host. Manual records are grouped into Domain verification, Custom return-path and DMARC. Copy each name and value; the **DNS record options** menu can copy or download all instructions. Existing domains keep these records on the **DNS records** tab. See [DNS setup](DNS-SETUP.md) for provider access and advanced API options.
5. Back in the dashboard, click **Check DNS now**.

When the two **Required** records (Ownership and DKIM) show **Valid**, the domain becomes **Verified** and you can send.

## How Long Does It Take?

Usually a few minutes. Some providers take longer, and DNS changes can take up to 48 hours to reach everyone. We check automatically every few minutes, so you don't need to keep clicking. A record showing **Propagating** means your provider has published it and we are waiting for caches to update.

If the required records aren't found within 72 hours, the domain shows **Failed**. Fix the records and click **Check DNS now**; it will verify as soon as they're correct.

## What the Statuses Mean

| Status | What to do |
| --- | --- |
| Valid | Nothing. |
| Propagating | Wait. |
| Missing | We can't see the record. Check the host name (see the "doubled domain" pitfall in [DNS setup](DNS-SETUP.md)). |
| Invalid | A record exists but its value is wrong. Open "Found in DNS" to compare with what we expect. |
| Partial | DMARC is in monitoring mode. That's fine to start with. |
| Conflict | There are duplicate records. Delete the extras. |
| DNS timeout / Lookup failed | A temporary DNS problem. Try again later. |

## "Already Verified by Another Account"

A domain can only be verified by one account at a time. If you see this, the domain is in use by another account, perhaps a colleague's. Ask your platform administrator to investigate if you believe you should own it.

## After Verification

We keep checking your records every few hours. If someone deletes the Ownership or DKIM record, sending from that domain stops and the domain shows **Failed** until the record is restored. Temporary DNS outages don't trigger this.

## Related

- [DNS setup](DNS-SETUP.md) · [Send your first email](SEND-FIRST-EMAIL.md)
