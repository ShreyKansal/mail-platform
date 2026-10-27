import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlagsProvider } from '@atlaskit/flag';
import { articleSections } from '../guides/sections';
import { classifyLink, resolveDocPath, hasGuideFile } from '../guides/content';
import { ALL_GUIDES, GUIDE_CATEGORIES, guideForRoute } from '../guides/manifest';
import { Markdown } from '../guides/Markdown';
import { ConfirmDialog, FormDialog, fieldErrorsFrom } from './dialogs';
import { Logo } from './Logo';
import { Page } from './Page';
import { SideSheet } from './SideSheet';
import { StateLozenge, RECIPIENT_STATES } from './status';
import { Table } from './Table';
import { ApiError } from '../lib/api';

afterEach(cleanup);

describe('side sheet', () => {
  it('labels the right-side dialog, makes the workspace inert and restores it on unmount', () => {
    const close = vi.fn();
    const workspace = document.createElement('div');
    workspace.className = 'app-shell';
    document.body.append(workspace);
    const before = document.body.style.overflow;
    const view = render(<SideSheet title="API examples" onClose={close}><p>Examples</p></SideSheet>);
    expect(screen.getByRole('dialog', { name: 'API examples' }).getAttribute('aria-modal')).toBe('true');
    expect(workspace.inert).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close side sheet' }));
    expect(close).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(workspace.inert).toBe(false);
    expect(document.body.style.overflow).toBe(before);
    workspace.remove();
  });
});

const wrap = (ui: ReactNode) =>
  render(
    <FlagsProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </FlagsProvider>,
  );

async function violations(container: Element) {
  // Colour contrast needs real layout and theme CSS, which jsdom lacks; Atlassian tokens are contrast-checked upstream.
  const res = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return res.violations.map((v) => `${v.id}: ${v.help}`);
}

describe('brand and page frame', () => {
  it('renders the logo as an accessible image', () => {
    wrap(<Logo />);
    expect(screen.getByRole('img', { name: 'mymorphix Mailer' })).toBeTruthy();
  });

  it('Page sets its title without rendering breadcrumbs or unrelated actions', async () => {
    const { container } = wrap(
      <><div id="header-breadcrumbs" /><Page title="Domains" route="/domains">
        <p>body</p>
      </Page></>,
    );
    expect(document.title).toBe('Domains · mymorphix Mailer');
    expect(screen.queryByRole('navigation', { name: 'Breadcrumbs' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Domains', level: 1 })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /^guide$/i })).toBeNull();
    expect(await violations(container)).toEqual([]);
  });
});

describe('status lozenges', () => {
  it('explain every state in text, never by colour alone', () => {
    wrap(<StateLozenge state="REMOTE_ACCEPTED" />);
    const el = screen.getByLabelText(/Accepted by recipient server\. .*does not confirm it reached the inbox/);
    expect(el.getAttribute('tabindex')).toBe('0');
  });

  it('cover all recipient states', () => {
    for (const s of ['QUEUED', 'SCHEDULED', 'MTA_ACCEPTED', 'DEFERRED', 'REMOTE_ACCEPTED', 'BOUNCED', 'FAILED', 'SUPPRESSED', 'CANCELLED', 'DELIVERY_UNKNOWN']) {
      expect(RECIPIENT_STATES[s]?.help.length).toBeGreaterThan(10);
    }
  });
});

describe('Table', () => {
  it('renders rows, an accessible table and cursor pagination', async () => {
    const onNext = vi.fn();
    const { container } = wrap(
      <Table
        label="Things"
        isLoading={false}
        columns={[{ key: 'name', content: 'Name', isSortable: true }]}
        rows={[{ key: 'a', cells: [{ content: 'alpha', sortValue: 'alpha' }] }]}
        emptyView={<p>None</p>}
        pagination={{ hasPrevious: false, hasNext: true, onPrevious: () => undefined, onNext }}
      />,
    );
    expect(screen.getByText('alpha')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onNext).toHaveBeenCalled();
    expect(await violations(container)).toEqual([]);
  });

  it('shows the empty view and errors', () => {
    wrap(<Table label="Things" isLoading={false} columns={[{ key: 'n', content: 'Name' }]} rows={[]} emptyView={<p>Nothing here</p>} />);
    expect(screen.getByText('Nothing here')).toBeTruthy();
    cleanup();
    wrap(
      <Table
        label="Things"
        isLoading={false}
        columns={[]}
        rows={[]}
        error={new ApiError(500, { code: 'internal_error', message: 'Boom' }, 'req_1')}
        emptyView={<p />}
      />,
    );
    expect(screen.getByText('Boom')).toBeTruthy();
    expect(screen.getByText(/req_1/)).toBeTruthy();
  });
});

describe('dialogs', () => {
  it('keeps a pending form open, blocks duplicate writes and restores recovery after failure', async () => {
    let rejectSave!: (error: Error) => void;
    const onSubmit = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectSave = reject; }));
    const onClose = vi.fn();
    wrap(<FormDialog title="Create resource" submitLabel="Create" fields={[]} onSubmit={onSubmit} onClose={onClose}><p>Resource details</p></FormDialog>);
    fireEvent.click(await screen.findByRole('button', { name: /^Create/ }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: /^Create/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    rejectSave(new Error('Request failed. Try again.'));
    await screen.findByText('Request failed. Try again.');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ConfirmDialog is a labelled modal dialog that can be cancelled', async () => {
    const onClose = vi.fn();
    wrap(
      <ConfirmDialog title="Remove domain?" confirmLabel="Remove" onConfirm={() => undefined} onClose={onClose}>
        <p>This stops sending.</p>
      </ConfirmDialog>,
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Remove domain?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('maps API validation details onto form fields', () => {
    const err = new ApiError(422, { code: 'validation_error', message: 'bad', details: [{ path: 'to[0]', message: 'invalid address' }, { path: '[1].subject', message: 'too long' }] }, null);
    expect(fieldErrorsFrom(err, ['to', 'subject'])).toEqual({ to: 'invalid address', subject: 'too long' });
    expect(fieldErrorsFrom(new Error('x'), ['to'])).toEqual({});
  });
});

describe('guides', () => {
  it('generates unique article anchors and excludes code fences', () => {
    const sections = articleSections('## Save settings\n\n### Limits\n\n~~~text\n## Not a section\n~~~\n\n## Save settings');
    expect(sections.map(section => section.id)).toEqual(['save-settings', 'limits', 'save-settings-1']);
    expect(sections.map(section => section.line)).toEqual([1, 3, 9]);
    expect(classifyLink('help/FAQ.md', '#limits')).toEqual({kind:'anchor', href:'#limits'});
    expect(classifyLink('help/FAQ.md', '/settings?tab=sending')).toEqual({kind:'guide', to:'/settings?tab=sending'});
  });
  it('every guide has a unique slug and every route has at most one guide', () => {
    const slugs = ALL_GUIDES.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(GUIDE_CATEGORIES.length).toBeGreaterThan(3);
    expect(guideForRoute('/webhooks')?.slug).toBe('webhooks');
    expect(ALL_GUIDES.every(hasGuideFile)).toBe(true);
  });

  it('rewrites links between guides and drops links to non-guide docs', () => {
    expect(resolveDocPath('help/VERIFY-DOMAIN.md', '../api/DOMAINS.md')).toBe('api/DOMAINS.md');
    expect(classifyLink('help/VERIFY-DOMAIN.md', 'DNS-SETUP.md#txt')).toEqual({ kind: 'guide', to: '/guides/dns-setup' });
    expect(classifyLink('help/VERIFY-DOMAIN.md', '../architecture/SYSTEM-OVERVIEW.md')).toEqual({ kind: 'text' });
    expect(classifyLink('help/FAQ.md', 'https://example.com')).toEqual({ kind: 'external', href: 'https://example.com' });
  });

  it('renders Markdown with brand substitution, in-app links and code blocks', async () => {
    const { container } = wrap(
      <Markdown
        file="help/VERIFY-DOMAIN.md"
        source={'# Title\n\nWelcome to MAIL_PLATFORM. See [DNS setup](DNS-SETUP.md) and [internals](../architecture/X.md).\n\n## Steps\n\n```bash\ncurl -X POST /v1/domains\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |\n'}
      />,
    );
    expect(container.textContent).toContain('Welcome to mymorphix Mailer.');
    expect(screen.queryByRole('heading', { name: 'Title' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Steps' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'DNS setup' }).getAttribute('href')).toBe('/guides/dns-setup');
    expect(screen.queryByRole('link', { name: 'internals' })).toBeNull();
    expect(container.textContent).toContain('curl -X POST /v1/domains');
    expect(screen.getByRole('table')).toBeTruthy();
    expect(await violations(container)).toEqual([]);
  });
});
