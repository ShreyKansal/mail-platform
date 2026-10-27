import { AppError } from '@mp/shared';

/**
 * Granular permissions. Every API route declares the permission it needs;
 * UI hiding is cosmetic only. See docs/security/RBAC.md.
 */
export const PERMISSIONS = [
  'org:read',
  'org:manage',
  'members:read',
  'members:manage',
  'billing:read',
  'billing:manage',
  'audit:read',
  'domains:read',
  'domains:manage',
  'api_keys:read',
  'api_keys:manage',
  'smtp_credentials:read',
  'smtp_credentials:manage',
  'emails:read',
  'emails:read_content',
  'emails:send',
  'webhooks:read',
  'webhooks:manage',
  'suppressions:read',
  'suppressions:manage',
  'analytics:read',
  'templates:read',
  'templates:manage',
  'contacts:read',
  'contacts:manage',
  'broadcasts:read',
  'broadcasts:manage',
  'broadcasts:send',
  'automations:read',
  'automations:manage',
  'automations:send',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const MEMBER_ROLES = ['owner', 'admin', 'developer', 'billing_admin', 'analyst', 'read_only'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

const ALL = new Set<Permission>(PERMISSIONS);
const READS = PERMISSIONS.filter((p) => p.endsWith(':read'));

const DEVELOPER: Permission[] = [
  'org:read',
  'members:read',
  'domains:read',
  'domains:manage',
  'api_keys:read',
  'api_keys:manage',
  'smtp_credentials:read',
  'smtp_credentials:manage',
  'emails:read',
  'emails:read_content',
  'emails:send',
  'webhooks:read',
  'webhooks:manage',
  'suppressions:read',
  'suppressions:manage',
  'analytics:read',
  'templates:read',
  'templates:manage',
  'contacts:read',
  'contacts:manage',
  'broadcasts:read',
  'broadcasts:manage',
  'broadcasts:send',
  'automations:read',
  'automations:manage',
  'automations:send',
];

export const ROLE_PERMISSIONS: Readonly<Record<MemberRole, ReadonlySet<Permission>>> = {
  owner: ALL,
  admin: new Set(PERMISSIONS.filter((p) => p !== 'billing:manage')),
  developer: new Set(DEVELOPER),
  billing_admin: new Set<Permission>(['org:read', 'members:read', 'billing:read', 'billing:manage', 'analytics:read']),
  analyst: new Set<Permission>(['org:read', 'domains:read', 'emails:read', 'suppressions:read', 'analytics:read']),
  read_only: new Set<Permission>(READS.filter((p) => p !== 'audit:read' && p !== 'billing:read')),
};

/**
 * API key scopes. Keys can never manage keys, members or billing, so a leaked
 * key cannot mint new credentials or take over the organization.
 */
export const API_KEY_SCOPES = ['full_access', 'sending_access'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const SCOPE_PERMISSIONS: Readonly<Record<ApiKeyScope, ReadonlySet<Permission>>> = {
  full_access: new Set<Permission>([
    'org:read',
    'domains:read',
    'domains:manage',
    'api_keys:read',
    'emails:read',
    'emails:read_content',
    'emails:send',
    'webhooks:read',
    'webhooks:manage',
    'suppressions:read',
    'suppressions:manage',
    'analytics:read',
    'templates:read',
    'templates:manage',
    'contacts:read',
    'contacts:manage',
    'broadcasts:read',
    'broadcasts:manage',
    'broadcasts:send',
  'automations:read',
  'automations:manage',
  'automations:send',
  ]),
  sending_access: new Set<Permission>(['emails:send']),
};

export function permissionsForRole(role: MemberRole): ReadonlySet<Permission> {
  return ROLE_PERMISSIONS[role];
}

export function permissionsForScopes(scopes: readonly string[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const s of scopes) {
    const perms = SCOPE_PERMISSIONS[s as ApiKeyScope];
    if (perms) for (const p of perms) out.add(p);
  }
  return out;
}

export function assertPermission(granted: ReadonlySet<Permission>, needed: Permission): void {
  if (!granted.has(needed)) throw new AppError('forbidden', `missing permission ${needed}`);
}

/** A member may only grant roles whose permissions are a subset of their own. */
export function canAssignRole(actor: ReadonlySet<Permission>, role: MemberRole): boolean {
  if (!actor.has('members:manage')) return false;
  for (const p of ROLE_PERMISSIONS[role]) if (!actor.has(p)) return false;
  return true;
}
