# RBAC

Source of truth: `packages/permissions/src/index.ts`. Every API route declares `config.permission`; the security hook enforces it for sessions and API keys alike. Hiding something in the UI (`useCan`) is cosmetic only.

## Permissions

`org:read`, `org:manage`, `members:read`, `members:manage`, `billing:read`, `billing:manage`, `audit:read`, `domains:read`, `domains:manage`, `api_keys:read`, `api_keys:manage`, `smtp_credentials:read`, `smtp_credentials:manage`, `emails:read`, `emails:read_content`, `emails:send`, `webhooks:read`, `webhooks:manage`, `suppressions:read`, `suppressions:manage`, `analytics:read`.

## Organization roles

| Role | Grants |
|---|---|
| `owner` | everything |
| `admin` | everything except `billing:manage` |
| `developer` | `org:read`, `members:read`, read+manage on domains, API keys, SMTP credentials, webhooks and suppressions; `emails:read`, `emails:read_content`, `emails:send`, `analytics:read` |
| `billing_admin` | `org:read`, `members:read`, `billing:read`, `billing:manage`, `analytics:read` |
| `analyst` | `org:read`, `domains:read`, `emails:read`, `suppressions:read`, `analytics:read` (no message content) |
| `read_only` | every `*:read` except `audit:read` and `billing:read` (no `emails:read_content`, since that isn't a `:read` permission) |

Role assignment rule (`canAssignRole`): the actor needs `members:manage` **and** every permission of the target role. An admin can't create an owner.

## API key scopes

| Scope | Permissions |
|---|---|
| `sending_access` (default) | `emails:send` |
| `full_access` | `org:read`, domains read+manage, `api_keys:read`, `emails:read`, `emails:read_content`, `emails:send`, webhooks read+manage, suppressions read+manage, `analytics:read` |

Keys can **never** manage keys, members or billing. Routes marked `sessionOnly` (`/auth/logout`, `/auth/session`) reject API keys.

## Not built

Platform roles (`super_admin`, `security_admin`, `support`) exist in the schema (`users.platform_role`) but no route uses them. There's no member invitation or role-change API, and no workspace- or project-level roles: a session always uses the organization's first project.
