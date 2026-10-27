import '@atlaskit/css-reset';
import './index.css';
import './ui.css';
import './workspace.css';
import './typography.css';
import './states.css';
import './broadcasts.css';
import './automations.css';
import './domains.css';
import './documentation.css';
import './frappe-tokens.css';
import './frappe-system.css';
import './shell.css';
import { forwardRef, type AnchorHTMLAttributes } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Link, RouterProvider } from 'react-router-dom';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppProvider, { type RouterLinkComponentProps } from '@atlaskit/app-provider';
import { FlagsProvider } from '@atlaskit/flag';
import { AppShell } from './components/AppShell';
import { RouteError } from './components/RouteError';
import { ApiError } from './lib/api';
import { applyTheme, readThemePreference } from './lib/theme';
import { ApiKeysPage } from './pages/ApiKeys';
import { LoginPage, SignupPage } from './pages/Auth';
import { AddDomainPage, DomainDetailPage, DomainsPage } from './pages/Domains';
import { EmailDetailPage, EmailsPage } from './pages/Emails';
import { GuidePage, GuidesPage } from './pages/Guides';
import { NotFoundPage } from './pages/NotFound';
import { OverviewPage } from './pages/Overview';
import { SmtpPage } from './pages/Smtp';
import { SuppressionsPage } from './pages/Suppressions';
import { WebhookDetailPage, WebhooksPage } from './pages/Webhooks';
import { LogsPage, MetricsPage } from './pages/Activity';
import { ExportsPage, NotificationsPage } from './pages/Operations';
import { TemplatesPage, TemplateDetailPage } from './pages/Templates';
import { AudiencePage } from './pages/Audience';
import { SettingsPage } from './pages/Settings';
import { BroadcastsPage, BroadcastDetailPage } from './pages/Broadcasts';
import { AutomationsPage, AutomationDetailPage } from './pages/Automations';

// Apply the saved theme before first render to avoid a flash of the wrong theme.
void applyTheme(readThemePreference());

/**
 * Atlaskit links (LinkItem, LinkButton, Breadcrumbs …) navigate through React
 * Router; absolute URLs and server-rendered paths (/docs) stay plain anchors.
 */
type RouterLinkProps = RouterLinkComponentProps<never> & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>;

const RouterLink = forwardRef<HTMLAnchorElement, RouterLinkProps>(function RouterLink({ href, children, ...rest }, ref) {
  const url = typeof href === 'string' ? href : '';
  if (/^(https?:|mailto:)/.test(url) || url.startsWith('/docs') || url.startsWith('#')) {
    return (
      <a ref={ref} href={url} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link ref={ref} to={url} {...rest}>
      {children}
    </Link>
  );
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: (n, err) => !(err instanceof ApiError && err.status < 500) && n < 2, refetchOnWindowFocus: true },
  },
  mutationCache: new MutationCache({
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401) window.location.assign('/login');
    },
  }),
});

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },
  { path: '/signup', element: <SignupPage />, errorElement: <RouteError /> },
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      ...(import.meta.env.DEV ? [{ path: 'design-system', lazy: async () => ({ Component: (await import('./pages/ComponentReference')).default }) }] : []),
      { index: true, element: <OverviewPage /> },
      { path: 'emails', element: <EmailsPage /> },
      { path: 'broadcasts', element: <BroadcastsPage /> },
      { path: 'broadcasts/:id', element: <BroadcastDetailPage /> },
      { path: 'broadcasts/:id/editor', element: <BroadcastDetailPage /> },
      { path: 'automations', element: <AutomationsPage /> },
      { path: 'automations/:id', element: <AutomationDetailPage /> },
      { path: 'templates', element: <TemplatesPage /> },
      { path: 'templates/:id', element: <TemplateDetailPage /> },
      { path: 'audience', element: <AudiencePage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'logs', element: <LogsPage /> },
      { path: 'exports', element: <ExportsPage /> },
      { path: 'notifications', element: <NotificationsPage /> },
      { path: 'metrics', element: <MetricsPage /> },
      { path: 'emails/:id', element: <EmailDetailPage /> },
      { path: 'domains', element: <DomainsPage /> },
      { path: 'domains/new', element: <AddDomainPage /> },
      { path: 'domains/:id', element: <DomainDetailPage /> },
      { path: 'api-keys', element: <ApiKeysPage /> },
      { path: 'smtp', element: <SmtpPage /> },
      { path: 'webhooks', element: <WebhooksPage /> },
      { path: 'webhooks/:id', element: <WebhookDetailPage /> },
      { path: 'suppressions', element: <SuppressionsPage /> },
      { path: 'guides', element: <GuidesPage /> },
      { path: 'guides/:slug', element: <GuidePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  // No <StrictMode>: in development its double-invoked effects make @atlaskit/portal render
  // modals, flags and menus into a detached container (they never appear). Production is unaffected.
  <>
    {/* Theming is driven by setGlobalTheme (lib/theme.ts) so increased contrast can be offered. */}
    <AppProvider routerLinkComponent={RouterLink} UNSAFE_isThemingDisabled>
      <FlagsProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </FlagsProvider>
    </AppProvider>
  </>,
);
