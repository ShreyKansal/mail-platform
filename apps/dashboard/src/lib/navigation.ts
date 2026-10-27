import { ChartNoAxesCombined, Radio, Workflow, Users, FileText, LayoutDashboard, Webhook, ScrollText, Mail, Globe, KeyRound, Send, ShieldBan, type MaterialIcon } from '../components/icons';
type NavItem = { to: string; label: string; icon: MaterialIcon; permission: string };
export const NAVIGATION: Array<{ title: string; items: NavItem[] }> = [
  { title: '', items: [{ to: '/', label: 'Overview', icon: LayoutDashboard, permission: 'analytics:read' }] },
  { title: 'Sending', items: [
    { to: '/emails', label: 'Emails', icon: Mail, permission: 'emails:read' },
    { to: '/broadcasts', label: 'Broadcasts', icon: Radio, permission: 'broadcasts:read' },
    { to: '/automations', label: 'Automations', icon: Workflow, permission: 'automations:read' },
    { to: '/metrics', label: 'Analytics', icon: ChartNoAxesCombined, permission: 'analytics:read' },
    { to: '/suppressions', label: 'Suppressions', icon: ShieldBan, permission: 'suppressions:read' },
  ] },
  { title: 'Content', items: [
    { to: '/templates', label: 'Templates', icon: FileText, permission: 'templates:read' },
    { to: '/audience', label: 'Contacts', icon: Users, permission: 'contacts:read' },

  ] },
  { title: 'Developer', items: [
    { to: '/domains', label: 'Domains', icon: Globe, permission: 'domains:read' },
    { to: '/api-keys', label: 'API Keys', icon: KeyRound, permission: 'api_keys:read' },
    { to: '/smtp', label: 'SMTP Credentials', icon: Send, permission: 'smtp_credentials:read' },
    { to: '/webhooks', label: 'Webhooks', icon: Webhook, permission: 'webhooks:read' },
    { to: '/logs', label: 'API Logs', icon: ScrollText, permission: 'emails:read' },
  ] },
];
export function navigationForPath(path: string) {
  for (const section of NAVIGATION) {
    const item = section.items.find(item => path === item.to || (item.to !== '/' && path.startsWith(item.to + '/')));
    if (item) return { section: section.title || 'Workspace', ...item };
  }
  if (path.startsWith('/guides')) return { section: 'Documentation', label: 'Documentation' };
  if (path.startsWith('/settings') || path.startsWith('/exports') || path.startsWith('/notifications')) return { section: 'Workspace', label: path.startsWith('/exports') ? 'Exports' : path.startsWith('/notifications') ? 'Notifications' : 'Settings' };
  return undefined;
}
