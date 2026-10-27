# Compliance

The platform makes **no compliance certification or conformance claim** (SOC 2, ISO 27001, GDPR, DPDP, CAN-SPAM and so on).

Controls that support future compliance work, with links:

| Area | Implemented control | Doc |
|---|---|---|
| Access control | RBAC, scoped keys, RLS | [RBAC](RBAC.md), [TENANT-SECURITY](TENANT-SECURITY.md) |
| Audit | Append-only audit log for credential, domain, webhook and suppression changes | [THREAT-MODEL](THREAT-MODEL.md) |
| Cryptography | AES-256-GCM sealed secrets, Argon2id, hashed tokens | [KEY-MANAGEMENT](KEY-MANAGEMENT.md) |
| Change management | CI typecheck, tests and image builds; pinned dependencies | [TEST-STRATEGY](../testing/TEST-STRATEGY.md) |
| Sender honesty | Status names never claim inbox placement; DMARC/SPF/DKIM diagnostics | [DELIVERABILITY-TROUBLESHOOTING](../deliverability/DELIVERABILITY-TROUBLESHOOTING.md) |

Required before any claim:
- [ ] Legal review per jurisdiction ([PRIVACY](PRIVACY.md))
- [ ] Retention, export and deletion workflows
- [ ] Marketing consent records and unsubscribe (RFC 8058)
- [ ] Incident response plan and exercises
- [ ] Backup restore drills ([BACKUP-RESTORE](../operations/BACKUP-RESTORE.md))
- [ ] Penetration test
