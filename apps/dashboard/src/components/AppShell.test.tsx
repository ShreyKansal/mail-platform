import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useContext } from 'react';
import { SettingsReturnContext } from '../lib/settings-modal';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import { Page } from './Page';
import { api, type Session } from '../lib/api';
import { NotificationsPage } from '../pages/Operations';

vi.mock('../lib/theme', () => ({ THEME_OPTIONS: [], useThemePreference: () => ['light', vi.fn()] }));
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

function Location() { const location = useLocation(); return <output aria-label="Current route">{location.pathname}{location.search}</output>; }
function SettingsFixture() { const returnTo = useContext(SettingsReturnContext), navigate = useNavigate(); return <section role="dialog" aria-label="Settings"><button onClick={() => navigate(returnTo, { replace: true })}>Close settings</button></section>; }
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData<Session>(['session'], { user: { id: 'u', name: 'Example User', email: 'example@example.test' }, organization: { id: 'o', name: 'Example workspace', status: 'active', sending_tier: 'sandbox', daily_recipient_limit: 100 }, project: { id: 'p', name: 'Main' }, permissions: ['emails:read', 'org:read'], role: 'owner' });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/emails?status=bounced&cursor=old']}><Routes><Route element={<AppShell />}><Route path="emails" element={<Page title="Emails"><Location /></Page>} /><Route path="guides" element={<Page title="Documentation"><Location /></Page>}/><Route path="settings" element={<SettingsFixture/>}/><Route path="notifications" element={<NotificationsPage/>}/></Route></Routes></MemoryRouter></QueryClientProvider>);
}

describe('workspace header', () => {
  it('opens notifications as a modal without replacing the current page', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: [], next_cursor: null });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(await screen.findByRole('dialog', { name: 'Notifications' })).toBeTruthy();
    expect(screen.getByLabelText('Current route').textContent).toBe('/emails?status=bounced&cursor=old');
    expect(await screen.findByText("You're All Caught Up")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close Notifications' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notifications' })).toBeNull());
    expect(screen.getByLabelText('Current route').textContent).toBe('/emails?status=bounced&cursor=old');
  });
  it('puts workspace and personal actions in one dropdown', async () => {
    setup();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Account menu' }), { key: 'Enter' });
    expect(await screen.findByRole('menuitem', { name: 'Profile' })).toBeTruthy();
    expect(screen.getAllByRole('menuitem', { name: 'Personal Settings' })).toHaveLength(1);
    expect(screen.getByRole('menuitem', { name: 'Log Out' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Example User: account menu' })).toBeNull();
  });
  it('opens dedicated documentation from Help without a workspace sidebar link', async () => {
    const { container } = setup();
    expect(screen.queryByRole('link', { name: 'Documentation' })).toBeNull();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Help and developer resources' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Documentation' }));
    const articles = screen.getByRole('navigation', { name: 'Documentation articles' });
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Back to Workspace' })).toBeTruthy();
    expect(articles.closest('.app-sidebar')).toBeNull();
    expect(articles.closest('.app-workspace')).toBeTruthy();
    expect(container.textContent).not.toContain('Morphmailer API v1');
    expect(screen.queryByText('Version')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Documentation', level: 2 })).toBeTruthy();
  });
  it('keeps the underlying page and filters when settings opens and closes', async () => {
    setup();
    fireEvent.click(screen.getByRole('link', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByLabelText('Current route').textContent).toBe('/emails?status=bounced&cursor=old');
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull());
    expect(screen.getByLabelText('Current route').textContent).toBe('/emails?status=bounced&cursor=old');
  });
  it('keeps branding, unified workspace options and universal search in the header', () => {
    const { container } = setup();
    expect(screen.getByRole('button', { name: 'Account menu' })).toBeTruthy();
    expect(container.querySelector('.workspace-favicon')).toBeNull();
    expect(container.querySelector('.header-workspace-label')).toBeNull();
    expect(screen.getByRole('button', { name: 'Account menu' }).textContent).not.toContain('Example User');
    expect(container.querySelector('.sidebar-account')).toBeNull();
    expect(screen.getByRole('button', { name: 'Search workspace' }).closest('.workspace-header')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Account menu' }).closest('.workspace-header')).toBeTruthy();
    expect(container.querySelector('.workspace-tools [role="search"]')).toBeNull();
    expect(container.querySelector('.workspace-topbar')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Breadcrumbs' })).toBeNull();
  });

  it('searches workspace pages from the header without changing email filters', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Search workspace' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search workspace' }), { target: { value: 'Settings' } });
    await waitFor(() => expect(screen.getByRole('link', { name: 'Settings Page' })).toBeTruthy());
    expect(screen.getByLabelText('Current route').textContent).toBe('/emails?status=bounced&cursor=old');
  });
});
