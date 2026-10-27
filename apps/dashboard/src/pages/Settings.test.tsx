import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type Session } from '../lib/api';
import { SettingsPage } from './Settings';
import { BrandLogo } from '../components/BrandLogo';

vi.mock('../components/feedback', async importOriginal => ({
  ...await importOriginal<typeof import('../components/feedback')>(),
  useNotify: () => ({ success: vi.fn(), failure: vi.fn() }),
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const permissions = ['org:read', 'org:manage', 'members:read', 'analytics:read', 'smtp_credentials:read', 'api_keys:read', 'emails:read'];
function Location() { return <output aria-label="Current location">{useLocation().search}</output>; }
function setup(path = '/settings', allowed = permissions) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData<Session>(['session'], { user: { id: 'u1', name: 'Example user', email: 'user@example.test' }, organization: { id: 'o1', name: 'Example workspace', status: 'active', sending_tier: 'sandbox', daily_recipient_limit: 100 }, project: { id: 'p1', name: 'Example project' }, role: 'admin', permissions: allowed });
  vi.spyOn(api, 'get').mockImplementation(async path => {
    if (path === '/v1/settings/usage') return { timezone: 'UTC', monthly_emails: 12, daily_recipients: 18, minute_recipients: 3, contacts: 24, broadcasts: 2, automations: 1, domains: 3, members: 1, rate_limit_per_second: 10 } as never;
    if (path === '/v1/settings/quotas') return { daily_recipient_limit: 100, per_minute_recipient_limit: 10, unlimited: false, editable: true, unlimited_available: true } as never;
    if (path === '/v1/settings/team') return { id: 'o1', name: 'Example workspace', members: [{ id: 'u1', name: 'Example user', email: 'user@example.test', role: 'admin' }] } as never;
    if (path === '/v1/smtp-credentials') return { data: [] } as never;
    throw new Error(`Unexpected request: ${path}`);
  });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><SettingsPage /><Location /></MemoryRouter></QueryClientProvider>);
}

describe('settings', () => {
  it('shows working personal theme preferences in their own settings section', async () => {
    setup('/settings?tab=preferences');
    expect(screen.getByRole('heading', { name: 'Personal Settings' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Light' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeTruthy();
    expect(screen.getAllByRole('radio').filter(radio => (radio as HTMLInputElement).checked)).toHaveLength(1);
  });
  it('shows plan sections with real usage and preserves query parameters when navigating tabs', async () => {
    setup('/settings?source=menu');
    expect((await screen.findAllByText('12')).length).toBeGreaterThan(0);
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Usage' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('heading', { name: 'Transactional' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Marketing' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Team' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Daily recipient limit' }).getAttribute('value')).toBe('18');
    expect(screen.getByText('10 req/s')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Billing' }));
    expect(await screen.findByText(/Online billing is not configured/)).toBeTruthy();
    expect(screen.getByLabelText('Current location').textContent).toBe('?source=menu&tab=billing');
  });

  it('retains functional sending-limit editing behind Manage limits', async () => {
    setup();
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({});
    fireEvent.click(await screen.findByRole('button', { name: 'Manage limits' }));
    const daily = screen.getByLabelText('Recipients per 24 hours');
    fireEvent.change(daily, { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save sending limits' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/v1/settings/quotas', { daily_recipient_limit: 200, per_minute_recipient_limit: 10, unlimited: false }));
  });

  it('shows a permission state without requesting restricted usage', async () => {
    setup('/settings', ['org:read']);
    expect(await screen.findByText(/Your role does not have access to usage analytics/)).toBeTruthy();
    expect(api.get).not.toHaveBeenCalledWith('/v1/settings/usage');
    expect(screen.queryByRole('button', { name: 'Manage limits' })).toBeNull();
  });

  it('supports legacy team links and retains the draft after a failed save', async () => {
    setup('/settings?tab=workspace');
    const patch = vi.spyOn(api, 'patch').mockRejectedValue(new Error('Connection interrupted'));
    expect(await screen.findByText('user@example.test')).toBeTruthy();
    const name = screen.getByLabelText('Workspace name');
    fireEvent.change(name, { target: { value: 'Updated workspace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save workspace' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/v1/settings/team', { name: 'Updated workspace' }));
    expect(await screen.findByText('Could not save workspace')).toBeTruthy();
    expect((name as HTMLInputElement).value).toBe('Updated workspace');
  });

  it('does not request SMTP credentials without read permission', async () => {
    setup('/settings?tab=smtp', ['org:read']);
    expect(await screen.findByText('Your role does not have access to SMTP credentials.')).toBeTruthy();
    expect(api.get).not.toHaveBeenCalledWith('/v1/smtp-credentials');
  });

  it('embeds working SMTP credentials without adding a second page title', async () => {
    setup('/settings?tab=smtp');
    expect(await screen.findByText('No SMTP credentials')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/v1/smtp-credentials');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('localhost')).toBeTruthy();
  });

  it('uses the workspace brand assets for both theme variants', () => {
    const { container } = render(<BrandLogo width={200} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBeTruthy();
    expect(container.querySelector('.brand-logo-light')?.getAttribute('src')).toContain('brand-logo.svg');
    expect(container.querySelector('.brand-logo-dark')?.getAttribute('src')).toContain('brand-logo-dark.svg');
  });
});
