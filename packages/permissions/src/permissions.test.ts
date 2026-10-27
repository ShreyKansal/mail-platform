import { describe, expect, it } from 'vitest';
import {
  assertPermission,
  canAssignRole,
  MEMBER_ROLES,
  permissionsForRole,
  permissionsForScopes,
  PERMISSIONS,
} from './index';

describe('RBAC', () => {
  it('owners hold every permission', () => {
    expect([...permissionsForRole('owner')].sort()).toEqual([...PERMISSIONS].sort());
  });

  it('read-only members cannot change anything or read message content', () => {
    const p = permissionsForRole('read_only');
    for (const perm of p) expect(perm.endsWith(':read')).toBe(true);
    expect(p.has('emails:read_content')).toBe(false);
    expect(p.has('emails:send')).toBe(false);
  });

  it('billing admins cannot send or manage domains', () => {
    const p = permissionsForRole('billing_admin');
    expect(p.has('billing:manage')).toBe(true);
    expect(p.has('emails:send')).toBe(false);
    expect(p.has('domains:manage')).toBe(false);
  });

  it('analysts cannot read message bodies', () => {
    expect(permissionsForRole('analyst').has('emails:read_content')).toBe(false);
  });

  it('prevents privilege escalation through role assignment', () => {
    expect(canAssignRole(permissionsForRole('admin'), 'owner')).toBe(false);
    expect(canAssignRole(permissionsForRole('admin'), 'developer')).toBe(true);
    expect(canAssignRole(permissionsForRole('developer'), 'read_only')).toBe(false);
    for (const r of MEMBER_ROLES) expect(canAssignRole(permissionsForRole('owner'), r)).toBe(true);
  });

  it('API keys can never manage keys, members or billing', () => {
    const p = permissionsForScopes(['full_access', 'sending_access']);
    expect(p.has('api_keys:manage')).toBe(false);
    expect(p.has('members:manage')).toBe(false);
    expect(p.has('billing:manage')).toBe(false);
    expect([...permissionsForScopes(['sending_access'])]).toEqual(['emails:send']);
    expect(permissionsForScopes(['made_up']).size).toBe(0);
  });

  it('assertPermission throws a forbidden AppError', () => {
    expect(() => assertPermission(permissionsForRole('analyst'), 'domains:manage')).toThrow(/domains:manage/);
  });
});
