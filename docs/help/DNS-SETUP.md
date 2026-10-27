# DNS Setup

This page explains each record we ask you to add, and the mistakes that most often stop verification.

## Automatic Setup with GoDaddy or Cloudflare

For GoDaddy, **Automatic setup** opens GoDaddy Domain Connect directly when enabled by the service administrator. Sign in at GoDaddy and approve the DNS changes, then return and check DNS. This flow does not ask for your developer API key. If Domain Connect is not enabled yet, use manual setup. Developer API credentials are a separate alternative under **API credentials (advanced)**.

For the developer API alternative, open **API credentials (advanced)** in the setup panel and select your DNS provider:

- **GoDaddy:** enter a production API key and secret for the account managing your DNS. Your account must have GoDaddy DNS API access; if access is unavailable, use manual setup.
- **Cloudflare:** enter an API token scoped to the relevant zone with Zone Read and DNS Edit permissions.

Credentials are used only for this setup and are not saved. Choose **Preview DNS changes** before adding records.

The preview lists missing records, existing matches and conflicts. The default plan includes Ownership, DKIM and Return-Path records. DMARC is optional; existing DMARC policies are preserved. Choose **Add DNS records** to publish missing records. Existing records are never overwritten. If any record fails, the result identifies it; reconnect and preview again to retry safely. **Check DNS now** verifies propagation separately.

The closest accessible DNS zone is found automatically. If needed, enter the GoDaddy zone domain or Cloudflare Zone ID under **Advanced options**. A changed or expired preview must be refreshed before applying.

Other DNS providers, including Route 53, use manual setup. Copy the records or download instructions from the domain page, publish them at your authoritative DNS provider, then check DNS.

## The Records

| Record | Type | Required? | Why it exists |
| --- | --- | --- | --- |
| **Ownership** (`_mp-challenge.…`) | TXT | Yes | Proves your account controls the domain. The value is unique to your account. |
| **DKIM** (`…._domainkey.…`) | TXT | Yes | Publishes a public key. We sign every email with the matching private key, so receivers can check the email really came from you and wasn't altered. |
| **Return-Path MX** (`bounce.…`) | MX | Recommended | Sends bounce notifications for your domain back to us, so we can tell you which addresses failed. |
| **Return-Path SPF** (`bounce.…`) | TXT | Recommended | Authorizes our servers to send for your bounce address. Together with the MX record, it makes SPF line up with your domain. |
| **DMARC** (`_dmarc.…`) | TXT | Recommended | Tells receiving providers what to do with email that fails authentication. Large providers expect it from bulk senders. Needed later for brand logos (BIMI). |

Without the two Return-Path records, you can still send: bounces use our shared bounce address, and authentication passes through DKIM. Adding them improves alignment and reputation.

### About DMARC

We suggest starting with `v=DMARC1; p=none;`, which monitors without affecting delivery. Once you're sure every service that sends as your domain is authenticated, move to `p=quarantine` and then `p=reject`. If you already have a DMARC record, keep yours; you need only one. The DMARC record lives on your main domain (`_dmarc.yourcompany.com`) even when you send from a subdomain.

## Common Pitfalls

### The Host Name Gets Doubled

Many providers add your domain to whatever you type in the **Host/Name** field automatically. If you paste the full name `_mp-challenge.notify.yourcompany.com`, the provider may create `_mp-challenge.notify.yourcompany.com.yourcompany.com`.

**Fix:** if your provider shows your domain next to the Host field, enter only the part before it. For `notify.yourcompany.com` in the `yourcompany.com` zone, that's `_mp-challenge.notify`. The **Found in DNS** section stays empty while the name is wrong.

### The DKIM Value Is Long

DKIM values are about 400 characters. A single DNS text string can hold only 255 characters, so:

- Most providers split long values automatically. Paste the whole value as one line.
- Some providers need you to split it yourself into quoted chunks: `"v=DKIM1; k=rsa; p=MIIB…" "…rest…"`. Receivers join the chunks back together.
- Make sure nothing is cut off at the end. A truncated key shows as **Invalid** with "The published public key does not match".

### Two SPF Records

A name may have only **one** `v=spf1` record. If `bounce.yourcompany.com` already has one, merge the `include:` we give you into it rather than adding a second record. Two SPF records produce **Conflict** and cause SPF to fail everywhere.

### Extra MX Records on the Bounce Name

The bounce subdomain should have only our MX record. Extra MX hosts show as **Conflict**, because bounces might go there instead.

### Quotes and Spaces

Paste the value without surrounding quotes unless your provider requires them. Don't add spaces inside the DKIM key.

### CNAME at the Same Name

A name that has a CNAME record cannot also have TXT or MX records. Remove the conflicting CNAME.

### Proxied Records (Cloudflare)

TXT and MX records are never proxied, but make sure you're editing the DNS zone that is actually authoritative for the domain.

## Checking Your Records Yourself

```bash
nslookup -type=TXT _mp-challenge.notify.yourcompany.com
nslookup -type=MX bounce.notify.yourcompany.com
```

or `dig TXT _mp-challenge.notify.yourcompany.com +short`.

## Related

- [Verify a domain](VERIFY-DOMAIN.md) · [Email goes to spam](EMAIL-IN-SPAM.md)
