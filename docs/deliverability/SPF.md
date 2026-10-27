# SPF

**Purpose.** SPF (RFC 7208) authorizes IP addresses to use a domain in the **envelope sender** (`MAIL FROM`, which becomes Return-Path). The platform checks SPF on the customer's Return-Path domain, not on the visible `From` domain.

## What the platform publishes and expects

For a domain `example.com` with Return-Path label `bounce`, the platform generates this record:

| Host | Type | Value |
|---|---|---|
| `bounce.example.com` | TXT | `v=spf1 include:<PLATFORM_SPF_INCLUDE> -all` |

`PLATFORM_SPF_INCLUDE` (for example `_spf.mail-platform.example`) is a record the **platform operator** publishes, listing every outbound IP. Publishing it is an operational prerequisite and is not automated.

## How the check works (`checkReturnPathSpf`)

1. Fetch the TXT records at the host and keep those starting with `v=spf1`.
   * none → `missing`; more than one → `conflict` (that's a permanent error under RFC 7208 §4.5).
2. Check the syntax with `parseSpf`: unknown mechanisms, bad `ip4`/`ip6`, `include` without a domain, more than 10 lookups in this record alone, `+all`, `redirect` combined with `all`. Any error → `invalid`.
3. **When `PLATFORM_OUTBOUND_IPS` is set** (production), mailauth evaluates SPF in full for *every* outbound IP. The record is `valid` only if every IP gets `pass`; a `temperror` gives `temp_error`. The real evaluation counts nested includes.
4. **When no outbound IPs are configured** (local development), the record is `valid` if it contains `include:<PLATFORM_SPF_INCLUDE>`.

## Effect on sending

SPF is **not required to send**. When both Return-Path records (MX and SPF) are valid, `domains.return_path_verified_at` is set and the worker uses `bounce.example.com` as the envelope domain, giving **SPF alignment** for DMARC. Otherwise the envelope uses `PLATFORM_BOUNCE_DOMAIN`, and DMARC alignment comes from DKIM alone.

## Failure cases

| Status | Typical cause | Remediation |
|---|---|---|
| `missing` | Record not published, or published on the root domain instead of the Return-Path host | Publish at `bounce.<domain>` |
| `conflict` | Two `v=spf1` records | Merge them into one |
| `invalid` | Typo, `+all`, missing include, or an IP not authorized | Use the generated value verbatim |
| `temp_error` | DNS timeout | Retried automatically |

## Verification

```sh
dig +short TXT bounce.example.com
```
Unit tests: `packages/dns-verification/src/verification.test.ts` ("return-path SPF" cases, including real evaluation with outbound IPs).
