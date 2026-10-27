import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceNavigation } from './WorkspaceNavigation';

afterEach(() => { cleanup(); localStorage.clear(); });

describe('workspace navigation', () => {
  it('keeps allowed links visible even when old collapsed-group preferences exist', () => {
    localStorage.setItem('mailer-navigation-groups', JSON.stringify(['Sending', 'Developer']));
    render(<MemoryRouter initialEntries={['/emails']}><WorkspaceNavigation permissions={['emails:read', 'api_keys:read', 'org:read']} compact={false} /></MemoryRouter>);
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByRole('link', { name: 'Emails' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: 'API Keys' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Settings' })).toBeTruthy();
    expect(within(nav).queryAllByRole('button')).toHaveLength(0);
    expect(nav.querySelector('details, summary, [hidden], hr, .nav-group, .nav-group-label')).toBeNull();
  });

  it('omits disallowed links and their empty groups', () => {
    render(<MemoryRouter><WorkspaceNavigation permissions={['contacts:read']} compact={false} /></MemoryRouter>);
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getAllByRole('link').map(link => link.getAttribute('aria-label'))).toEqual(['Contacts']);
    expect(within(nav).queryByText('Developer')).toBeNull();
    expect(within(nav).queryByText('Workspace')).toBeNull();
  });

  it('retains names and title labels for icon-rail links', () => {
    render(<MemoryRouter><WorkspaceNavigation permissions={['emails:read', 'org:read']} compact /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Emails' }).getAttribute('title')).toBe('Emails');
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('title')).toBe('Settings');
  });

  it('exposes automations for read access and selects nested activity routes', () => {
    const { rerender } = render(<MemoryRouter initialEntries={['/automations/flow-1?view=activity&tab=runs']}><WorkspaceNavigation permissions={['automations:read']} compact={false} /></MemoryRouter>);
    const link = screen.getByRole('link', { name: 'Automations' });
    expect(link.getAttribute('href')).toBe('/automations');
    expect(link.getAttribute('aria-current')).toBe('page');
    rerender(<MemoryRouter><WorkspaceNavigation permissions={['automations:read']} compact /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Automations' }).getAttribute('title')).toBe('Automations');
    rerender(<MemoryRouter><WorkspaceNavigation permissions={[]} compact /></MemoryRouter>);
    expect(screen.queryByRole('link', { name: 'Automations' })).toBeNull();
  });
});
