# Security policy

## Reporting a vulnerability

Do not open a public issue. Report vulnerabilities privately to the maintainers, through your organization's security contact or a private repository advisory. Include reproduction steps and the affected component. We aim to acknowledge reports within two business days.

## Scope highlights

These matter most for an email platform:

- Anything that lets one tenant read or act on another tenant's data.
- Sending as a domain the caller has not verified, or relaying without authentication.
- Header or CRLF injection into outbound messages.
- Webhook SSRF, or bypassing signature verification.
- Leakage of API keys, SMTP passwords, webhook secrets or DKIM private keys.

## Design references

- [Threat model](docs/security/THREAT-MODEL.md)
- [Tenant isolation](docs/architecture/TENANT-ISOLATION.md)
- [Key management](docs/security/KEY-MANAGEMENT.md)
- [Abuse prevention](docs/security/ABUSE-PREVENTION.md)
