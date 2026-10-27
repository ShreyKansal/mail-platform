# PTR / reverse DNS

## Requirement

For every public IP an outbound MTA node sends from:

1. **PTR**: `<ip>.in-addr.arpa PTR mta1.<platform-domain>.`, set by whoever owns the IP block (the cloud provider or hosting company).
2. **Forward confirmation**: `mta1.<platform-domain> A <ip>`.
3. **HELO**: Postfix `myhostname`/`smtp_helo_name` = that same name (`MTA_HOSTNAME`).
4. The IP is listed in the platform SPF include (`PLATFORM_SPF_INCLUDE`) and in `PLATFORM_OUTBOUND_IPS`, so domain verification evaluates SPF against real addresses.

Receivers such as Gmail and Microsoft reject or junk mail from IPs without forward-confirmed reverse DNS. That shows up as 5.7.x / 4.7.x rejections, classified `policy_rejected` or `authentication_rejected`.

## Status: blocker

Not configured. The development environment relays everything to Mailpit and has no public IP. Before production sending, you need:

- [ ] Static public IPv4 addresses per MTA node
- [ ] PTR records delegated or set at the provider
- [ ] A/AAAA records for the MTA hostnames
- [ ] Outbound TCP/25 allowed by the provider
- [ ] `MTA_HOSTNAME` set per node
- [ ] The platform SPF include record published

The platform has no automated FCrDNS check yet. Check by hand:

```sh
dig +short -x 203.0.113.10
dig +short mta1.mail-platform.example
```
