# DMARC

**Purpose.** DMARC (RFC 7489) tells receivers how to treat mail that fails SPF *and* DKIM alignment. The platform diagnoses the record. DMARC is **advisory**: it isn't required to send, but enforcement is required for BIMI, and major mailbox providers expect DMARC from bulk senders.

## What is checked

The record is expected at `_dmarc.<organizational domain>`, computed with the Public Suffix List (`tldts.getDomain`). For `notify.example.com` that's `_dmarc.example.com`. The suggested value is `v=DMARC1; p=none;`, which you can then raise to enforcement.

`parseDmarc` checks:
* `v=DMARC1` is the first tag;
* `p` is present and one of `none|quarantine|reject`;
* `sp` is valid if present;
* `pct` is an integer from 0 to 100;
* `adkim`/`aspf` are `r` or `s`;
* `rua`/`ruf` are `mailto:` URIs.

| Status | Meaning |
|---|---|
| `valid` | `p=quarantine` or `p=reject` with `pct` 100 |
| `partial` | `p=none` (monitoring only), or `pct` < 100 |
| `invalid` | Syntax errors |
| `conflict` | More than one DMARC record (receivers ignore them all) |
| `missing` | No record |

## Alignment provided by the platform

* **DKIM**: always aligned, because `d=` is the verified domain or its parent ([SENDING-SUBDOMAINS](SENDING-SUBDOMAINS.md)).
* **SPF**: aligned only when the custom Return-Path is active (`bounce.<domain>` shares the organizational domain).

## Limitations

* A record published on the subdomain itself (`_dmarc.notify.example.com`) is not looked up. Only the organizational domain is checked.
* The checker reads the policy record. It doesn't evaluate the `sp=` that applies to a given subdomain, and it doesn't process aggregate (`rua`) reports. Report ingestion isn't built.
