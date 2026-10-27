# Team Roles and Permissions

Every member of an organization has one role. The dashboard only shows pages and buttons your role allows, and the server checks the same permissions on every request, so hiding a button is never the only protection. Your current role is shown in the account menu at the bottom of the left navigation.

## Roles

| Role | Typical person | Can do |
| --- | --- | --- |
| **Owner** | Account creator | Full access to available workspace capabilities. |
| **Admin** | Team lead | Manage workspace, sending, content and integrations. |
| **Developer** | Engineer | Manage domains, API keys, SMTP credentials, webhooks and suppressions; send email; read logs and message content. |
| **Billing admin** | Finance | View workspace details and analytics. Cannot send or change sending setup. |
| **Analyst** | Support or marketing analyst | Read domains, email logs, suppressions and analytics. **Can't** read message content. |
| **Read-only** | Auditor | Read most settings and logs. Can't change anything or read message content. |

## Permission Details

| Area | Owner | Admin | Developer | Billing admin | Analyst | Read-only |
| --- | --- | --- | --- | --- | --- | --- |
| Overview and analytics | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| View domains | ✓ | ✓ | ✓ | | ✓ | ✓ |
| Add, verify and remove domains | ✓ | ✓ | ✓ | | | |
| View email logs | ✓ | ✓ | ✓ | | ✓ | ✓ |
| View message content | ✓ | ✓ | ✓ | | | |
| Send and cancel email | ✓ | ✓ | ✓ | | | |
| Manage API keys and SMTP credentials | ✓ | ✓ | ✓ | | | |
| Manage webhooks | ✓ | ✓ | ✓ | | | |
| Manage suppressions | ✓ | ✓ | ✓ | | | |

## API Keys Have Their Own Permissions

API keys don't take a member's role. Each key has one of two permissions:

- **Sending access:** can only send email. Use this for application servers.
- **Full access:** can also read logs and manage domains, webhooks and suppressions.

No API key, whatever its permission, can create other keys, manage members or manage billing. A leaked key therefore can't be used to take over the account. See [API keys](API-KEYS.md).

## Inviting Members

Inviting more people to an organization isn't available in the dashboard yet. Until it is, every organization has the member who created it. Ask your platform administrator if you need more members added.
