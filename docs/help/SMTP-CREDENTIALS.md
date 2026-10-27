# SMTP Credentials

Use SMTP credentials when software sends email through an SMTP server setting (a CMS, CRM, framework or device), rather than through our API.

## Create Credentials

1. Go to **SMTP credentials** and click **Create credentials**.
2. Give them a name.
3. Optionally list **Allowed client networks**: the IP addresses your servers send from. Logins from anywhere else will be refused.
4. Copy the **username** and **password**. The password is shown only once.

## Configure Your Software

| Setting | Value |
| --- | --- |
| Server / host | The SMTP host shown in the dashboard for your deployment |
| Port | **587** with STARTTLS (sometimes labelled "TLS"), or **465** with SSL/TLS |
| Encryption | Required. Plain unencrypted connections can't log in. |
| Authentication | Username and password (PLAIN or LOGIN) |

The "From" address must be on a verified domain.

## Troubleshooting

| Error | Meaning |
| --- | --- |
| `535 Authentication credentials invalid` | Wrong username or password, revoked credentials, or your server's IP isn't in the allowed networks. |
| `530 Authentication required` | The software tried to send without logging in. Enable authentication. |
| `454 Too many failed authentication attempts` | Too many wrong passwords from your IP. Wait 10 minutes. |
| `550 5.7.1 … not a verified sending domain` | The From address uses a domain that isn't verified. |
| `550 … the To header must list at least one envelope recipient` | Every recipient was hidden (Bcc only). Put at least one recipient in To. |

## Revoke

Click **Revoke**. The next login with those credentials fails.

## Related

- Developers: [SMTP integration](../developer-guides/SMTP-INTEGRATION.md)
