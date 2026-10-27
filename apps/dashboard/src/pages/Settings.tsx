import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import ModalDialog, { ModalTransition } from '@atlaskit/modal-dialog';
import IconButton from '../components/controls/IconButton';
import { X, CreditCard, FileText, Plug, Send, User } from '../components/icons';
import { SettingsReturnContext } from '../lib/settings-modal';
import { useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../components/controls/Button';
import LinkButton from '../components/controls/LinkButton';
import Lozenge from '../components/controls/Lozenge';
import Textfield from '../components/controls/Textfield';
import { Checkbox } from '@atlaskit/checkbox';
import { Label } from '@atlaskit/form';
import Heading from '@atlaskit/heading';
import { Text } from '@atlaskit/primitives';
import { Table } from '../components/Table';
import { ErrorBlock, LoadingBlock, useNotify } from '../components/feedback';
import { api } from '../lib/api';
import { useCan, useSession } from '../lib/hooks';
import { THEME_OPTIONS, useThemePreference } from '../lib/theme';
import { SmtpPage } from './Smtp';
import { CalendarDays, Clock, Globe, Mail, Radio, Users, Workflow, type MaterialIcon } from '../components/icons';

const SETTINGS_TABS = ['usage', 'billing', 'team', 'smtp', 'integrations', 'documents', 'account', 'preferences'] as const;

function PersonalSettings() {
  const [theme, setTheme] = useThemePreference();
  return <div className="personal-theme-settings"><Text as="p" color="color.text.subtle">Choose how Mailer looks on this device.</Text><fieldset><legend>Theme</legend>{THEME_OPTIONS.map(option => <label key={option.value}><input type="radio" name="personal-theme" checked={theme === option.value} onChange={() => setTheme(option.value)}/><span>{option.label}</span></label>)}</fieldset></div>;
}

function SettingsSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="settings-card"><header className="settings-card-header section-intro"><Heading size="small" as="h2">{title}</Heading>{description && <Text as="p" color="color.text.subtle">{description}</Text>}</header><div className="settings-card-body">{children}</div></section>;
}

interface SettingsUsage {
  timezone: 'UTC'; monthly_emails: number; daily_recipients: number; minute_recipients: number;
  contacts: number; broadcasts: number; automations: number; domains: number; members: number; rate_limit_per_second: number;
}

function UsageRow({ label, value, icon: Icon, hint, used, limit }: { label: string; value: ReactNode; icon: MaterialIcon; hint?: string; used?: number; limit?: number }) {
  return <div className="usage-limit-row"><dt><Icon size={18} /><span>{label}{hint && <span className="usage-limit-hint">{hint}</span>}</span></dt><dd>{value}</dd>
    {used !== undefined && limit !== undefined && limit > 0 && <progress className="usage-limit-progress" aria-label={label} max={limit} value={Math.min(used, limit)} />}
  </div>;
}

function UsageGroup({ id, title, description, action, children }: { id: string; title: string; description: string; action?: ReactNode; children: ReactNode }) {
  return <section className="usage-plan-section" aria-labelledby={id}><header className="usage-plan-intro"><Heading size="small" as="h2" id={id}>{title}</Heading><Text as="p" color="color.text.subtle">{description}</Text>{action && <div className="usage-plan-action">{action}</div>}</header><div className="usage-plan-details">{children}</div></section>;
}

function UsageSettings({ manage }: { manage: boolean }) {
  const canRead = useCan('analytics:read'), canContacts = useCan('contacts:read'), canBroadcasts = useCan('broadcasts:read'), canDomains = useCan('domains:read'), canAutomations = useCan('automations:read');
  const { data: session } = useSession();
  const usage = useQuery({ queryKey: ['settings-usage'], queryFn: () => api.get<SettingsUsage>('/v1/settings/usage'), enabled: canRead, refetchInterval: 60_000 });
  const quota = useQuery({ queryKey: ['sending-quotas'], queryFn: () => api.get<Quotas>('/v1/settings/quotas') });
  const [editing, setEditing] = useState(false);
  const numbers = new Intl.NumberFormat();
  const count = (value: number | undefined) => value === undefined ? 'Unavailable' : numbers.format(value);
  const quotaValue = (used: number | undefined, limit: number | undefined) => <>{count(used)} <span className="usage-limit-divider">/</span> {quota.data?.unlimited ? 'Unlimited' : count(limit)}</>;
  const data = usage.data;
  const plan = session?.organization.sending_tier.replace(/_/g, ' ') ?? 'Workspace';
  return <div className="settings-panel usage-settings">
    {!canRead && <Text as="p" color="color.text.subtle">Your role does not have access to usage analytics. Configured sending limits are shown below.</Text>}
    {usage.isLoading && canRead && <LoadingBlock label="Loading usage" />}
    {usage.error && <ErrorBlock title="Could not load usage" error={usage.error} onRetry={() => void usage.refetch()} />}
    {quota.error && <ErrorBlock title="Could not load sending limits" error={quota.error} onRetry={() => void quota.refetch()} />}
    <UsageGroup id="usage-transactional" title="Transactional" description="Integrate email into your app using the API or SMTP interface." action={manage && quota.data?.editable ? <Button onClick={() => setEditing(value => !value)} aria-expanded={editing} aria-controls="usage-sending-limits">{editing ? 'Close limits' : 'Manage limits'}</Button> : undefined}>
      <Heading size="xsmall" as="h3"><span className="capitalize">{plan}</span></Heading>
      <dl className="usage-limits">
        <UsageRow icon={CalendarDays} label="Monthly emails" hint="Current project, calendar month in UTC" value={count(data?.monthly_emails)} />
        <UsageRow icon={Mail} label="Daily recipient limit" hint="Organization, rolling 24 hours" value={quotaValue(data?.daily_recipients, quota.data?.daily_recipient_limit)} used={data?.daily_recipients} limit={quota.data?.unlimited ? undefined : quota.data?.daily_recipient_limit} />
        <UsageRow icon={Clock} label="Per-minute recipient limit" hint="Organization, rolling 60 seconds" value={quotaValue(data?.minute_recipients, quota.data?.per_minute_recipient_limit)} used={data?.minute_recipients} limit={quota.data?.unlimited ? undefined : quota.data?.per_minute_recipient_limit} />
      </dl>
      <Text as="p" size="small" color="color.text.subtle">Monthly emails count live transactional messages. Recipient quotas include all projects and sending streams, including simulated messages.</Text>
      {editing && <section id="usage-sending-limits" className="usage-limit-editor" aria-label="Edit sending limits"><SendingLimits manage={manage} /></section>}
    </UsageGroup>
    <UsageGroup id="usage-marketing" title="Marketing" description="Create campaigns and reach your audience using broadcasts and contacts." action={canBroadcasts ? <LinkButton href="/broadcasts">View broadcasts</LinkButton> : undefined}>
      <Heading size="xsmall" as="h3">Current project</Heading><dl className="usage-limits">
        <UsageRow icon={Users} label="Active contacts" value={count(data?.contacts)} />
        <UsageRow icon={Radio} label="Broadcasts" value={count(data?.broadcasts)} />
      </dl><Text as="p" size="small" color="color.text.subtle">No separate marketing plan is configured. Sending uses your organization's recipient limits.</Text>{canContacts && <Link to="/audience">Manage contacts</Link>}
    </UsageGroup>
    <UsageGroup id="usage-team" title="Team" description="Understand resource usage and limits for your workspace." action={<LinkButton href="/settings?tab=team">Team settings</LinkButton>}>
      <Heading size="xsmall" as="h3">Workspace resources</Heading><dl className="usage-limits">
        <UsageRow icon={Users} label="Team members" hint="Organization" value={count(data?.members)} />
        <UsageRow icon={Workflow} label="Automations" hint="Current project" value={canAutomations ? <Link to="/automations">{count(data?.automations)}</Link> : count(data?.automations)} />
        <UsageRow icon={Globe} label="Domains" hint="Current project, excluding disabled domains" value={canDomains ? <Link to="/domains">{count(data?.domains)}</Link> : count(data?.domains)} />
        <UsageRow icon={Clock} label="API rate limit" hint="Per user or API key" value={data ? `${count(data.rate_limit_per_second)} req/s` : 'Unavailable'} />
      </dl>
    </UsageGroup>
    <div className="usage-extras-title"><Heading size="large" as="h2">Extras</Heading></div>
    <UsageGroup id="usage-payg" title="Pay-as-you-go" description="Automatic overage billing is not configured for this deployment.">
      <div className="usage-extra-option"><Checkbox label="Transactional overages" isChecked={false} isDisabled /><Text as="p" color="color.text.subtle">Sending stops at the configured recipient limit. To change your allowance, contact your platform administrator.</Text></div>
      <div className="usage-extra-option"><Checkbox label="Automation run billing" isChecked={false} isDisabled /><Text as="p" color="color.text.subtle">No per-run pricing or automatic charges are configured.</Text></div>
    </UsageGroup>
    <UsageGroup id="usage-addons" title="Add-ons" description="Additional infrastructure and account capabilities.">
      {[{ title: 'Additional domains', text: 'No paid domain package is configured. Manage sending domains from the Domains page.' }, { title: 'Dedicated IPs', text: 'Dedicated sending IPs are provisioned by your infrastructure administrator.' }, { title: 'Single sign-on', text: 'Single sign-on is not available in this deployment.' }].map(addon => <div className="usage-addon" key={addon.title}><Heading size="xsmall" as="h3">{addon.title}</Heading><Text as="p" color="color.text.subtle">{addon.text}</Text></div>)}
    </UsageGroup>
  </div>;
}

function BillingSettings() {
  const { data } = useSession();
  return <div className="settings-panel"><SettingsSection title="Subscriptions and billing" description="This workspace runs on your own mail infrastructure.">
    <div className="settings-detail-row"><div><Text weight="semibold">Sending tier</Text><Text as="p" color="color.text.subtle">Current organization configuration</Text></div><Lozenge>{data?.organization.sending_tier ?? 'Unknown'}</Lozenge></div>
    <div className="settings-detail-row"><div><Text weight="semibold">Payment methods</Text><Text as="p" color="color.text.subtle">Online billing is not configured for this deployment. Contact your platform administrator for pricing or billing changes.</Text></div></div>
  </SettingsSection><SettingsSection title="Invoices" description="Invoices are not issued through this deployment."><Text as="p" color="color.text.subtle">Your infrastructure and service providers manage their own invoices.</Text></SettingsSection></div>;
}

function IntegrationSettings() {
  const smtp = useCan('smtp_credentials:read'), keys = useCan('api_keys:read'), webhooks = useCan('webhooks:read');
  return <div className="settings-panel settings-resource-grid">
    <SettingsSection title="Morphmailer SDK" description="Send transactional emails from your Node.js or TypeScript application."><div className="settings-resource-actions"><LinkButton href="/downloads/morphmailer-0.1.0.tgz" download>Download SDK</LinkButton><Link to="/guides/quickstart">Quickstart</Link></div></SettingsSection>
    <SettingsSection title="SMTP" description="Connect applications and authentication providers using a verified sender and dedicated SMTP credentials."><div className="settings-resource-actions">{smtp && <LinkButton href="/settings?tab=smtp">Configure SMTP</LinkButton>}<Link to="/guides/smtp-integration">SMTP documentation</Link></div></SettingsSection>
    {keys && <SettingsSection title="REST API" description="Create a scoped API key to connect your application to the email API."><LinkButton href="/api-keys">Manage API keys</LinkButton></SettingsSection>}
    {webhooks && <SettingsSection title="Webhooks" description="Receive signed delivery, bounce and suppression events in your application."><LinkButton href="/webhooks">Configure webhooks</LinkButton></SettingsSection>}
  </div>;
}

function DocumentSettings() {
  return <div className="settings-panel"><SettingsSection title="Documents" description="Workspace documentation and compliance availability.">
    <div className="settings-document-list"><div className="settings-detail-row"><div><Text weight="semibold">Product and developer documentation</Text><Text as="p" color="color.text.subtle">Account setup, sending guides and API integration instructions.</Text></div><LinkButton href="/guides">Open documentation</LinkButton></div>
    <div className="settings-detail-row"><div><Text weight="semibold">Compliance and legal documents</Text><Text as="p" color="color.text.subtle">No audit attestations, SOC 2 reports, DPA or tax documents have been published for this deployment. Request applicable documents from your platform administrator.</Text></div><Lozenge>Not published</Lozenge></div></div>
  </SettingsSection></div>;
}

interface Quotas { daily_recipient_limit: number; per_minute_recipient_limit: number; unlimited: boolean; editable: boolean; unlimited_available: boolean }
function SendingLimits({ manage }: { manage: boolean }) {
  const qc = useQueryClient(), notify = useNotify();
  const quota = useQuery({ queryKey: ['sending-quotas'], queryFn: () => api.get<Quotas>('/v1/settings/quotas') });
  const [draft, setDraft] = useState<{ daily: string; minute: string; unlimited: boolean } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null);
  if (quota.isLoading) return <div className="settings-card-body"><LoadingBlock label="Loading sending limits" /></div>;
  if (quota.error || !quota.data) return <div className="settings-card-body"><ErrorBlock error={quota.error} onRetry={() => void quota.refetch()} /></div>;
  const current = quota.data;
  const values = draft ?? { daily: String(current.daily_recipient_limit), minute: String(current.per_minute_recipient_limit), unlimited: current.unlimited };
  const editable = manage && current.editable;
  const valid = [values.daily, values.minute].every(value => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 2147483647);
  const dirty = Number(values.daily) !== current.daily_recipient_limit || Number(values.minute) !== current.per_minute_recipient_limit || values.unlimited !== current.unlimited;
  return <form onSubmit={async event => {
    event.preventDefault(); if (!editable || !valid || !dirty || busy) return;
    setBusy(true); setError(null);
    try {
      await api.patch('/v1/settings/quotas', { daily_recipient_limit: Number(values.daily), per_minute_recipient_limit: Number(values.minute), unlimited: values.unlimited });
      await Promise.all(['sending-quotas', 'session', 'overview'].map(key => qc.invalidateQueries({ queryKey: [key] })));
      setDraft(null); notify.success('Sending limits updated');
    } catch (err) { setError(err); } finally { setBusy(false); }
  }}>
    <div className="settings-card-body"><div className="quota-form settings-fields">
    {current.unlimited_available && <Checkbox label="Unlimited sending in local development" isChecked={values.unlimited} isDisabled={!editable || busy} onChange={event => setDraft({ ...values, unlimited: event.currentTarget.checked })} />}
    <div className="quota-fields">
      <div><Label htmlFor="quota-daily">Recipients per 24 hours</Label><Textfield id="quota-daily" type="number" min={1} max={2147483647} step={1} isRequired value={values.daily} isDisabled={!editable || values.unlimited || busy} onChange={event => setDraft({ ...values, daily: event.currentTarget.value })} /></div>
      <div><Label htmlFor="quota-minute">Recipients per minute</Label><Textfield id="quota-minute" type="number" min={1} max={2147483647} step={1} isRequired value={values.minute} isDisabled={!editable || values.unlimited || busy} onChange={event => setDraft({ ...values, minute: event.currentTarget.value })} /></div>
    </div>
    <Text as="p" color="color.text.subtle">{values.unlimited ? 'Daily and per-minute quotas are bypassed locally. Saved numeric limits apply when unlimited sending is turned off.' : 'Rolling limits apply to all API keys and SMTP credentials in this organization. Existing usage is included.'}</Text>
    {!current.editable && <Text as="p">Production quotas are managed by the platform administrator.</Text>}
    {error != null && <ErrorBlock error={error} title="Could not save sending limits" />}
    </div></div>
    {editable && <footer className="settings-card-footer"><Button type="submit" appearance="primary" isDisabled={!dirty || !valid || busy} isLoading={busy}>Save sending limits</Button></footer>}
  </form>;
}

export function SettingsPage() {
  const session = useSession(), qc = useQueryClient(), notify = useNotify();
  const returnTo = useContext(SettingsReturnContext), navigate = useNavigate();
  const close = () => navigate(returnTo, { replace: true });
  const manage = useCan('org:manage'), readMembers = useCan('members:read');
  const canSmtp = useCan('smtp_credentials:read'), canExports = manage;
  const [name, setName] = useState(''), [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<unknown>(null);
  const s = session.data;
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab') ?? 'usage';
  const selectedTab = requestedTab === 'workspace' ? 'team' : requestedTab === 'sending' ? 'usage' : requestedTab;
  const tab = Math.max(0, SETTINGS_TABS.indexOf(selectedTab as typeof SETTINGS_TABS[number]));
  useEffect(() => { setName(s?.organization.name ?? ''); }, [s?.organization.name]);
  const team = useQuery({ queryKey: ['team-settings'], queryFn: () => api.get<{ id: string; name: string; members: Array<{ id: string; name: string; email: string; role: string }> }>('/v1/settings/team'), enabled: readMembers });
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setNameError(null);
    try {
      await api.patch('/v1/settings/team', { name: name.trim() });
      await Promise.all([qc.invalidateQueries({ queryKey: ['session'] }), qc.invalidateQueries({ queryKey: ['team-settings'] })]);
      notify.success('Workspace saved');
    } catch (error) { setNameError(error); }
    finally { setBusy(false); }
  };
  const sections = [
    { key: 'account', label: 'Account', icon: User, group: 'Personal' },
    { key: 'preferences', label: 'Personal Settings', icon: User },
    { key: 'usage', label: 'Usage', icon: Mail, group: 'Workspace' },
    { key: 'billing', label: 'Billing', icon: CreditCard },
    { key: 'team', label: 'Team', icon: Users },
    { key: 'smtp', label: 'SMTP', icon: Send, group: 'Connections' },
    { key: 'integrations', label: 'Integrations', icon: Plug },
    { key: 'documents', label: 'Documents', icon: FileText },
  ];
  const active = sections.find(section => section.key === SETTINGS_TABS[tab])!;
  return <ModalTransition><ModalDialog label="Settings" width="1024px" height="calc(100dvh - 8rem)" onClose={close} testId="settings-modal">
    <div className="settings-modal-layout">
      <aside className="settings-modal-sidebar"><div className="settings-modal-label">Settings</div><nav aria-label="Settings sections">{sections.map(section => { const Icon = section.icon; return <div key={section.key}>{section.group && <div className="settings-modal-group">{section.group}</div>}<button type="button" aria-current={active.key === section.key ? 'page' : undefined} onClick={() => setParams(previous => { const next = new URLSearchParams(previous); next.set('tab', section.key); return next; }, { replace: true })}><Icon size={16}/><span>{section.label}</span></button></div>; })}</nav></aside>
      <div className="settings-modal-main"><header className="settings-modal-header"><Heading as="h1" size="medium">{active.label}</Heading><IconButton icon={X} label="Close settings" appearance="subtle" onClick={close}/></header><div className="settings-modal-content" key={active.key}>
      {tab === 0 && <><UsageSettings manage={manage} /></>}
      {tab === 1 && <><BillingSettings /></>}
      {tab === 2 && <><div className="settings-panel">
        <section className="settings-card" aria-labelledby="workspace-title">
          <header className="settings-card-header section-intro"><Heading size="small" as="h2" id="workspace-title">Team overview</Heading><Text as="p" color="color.text.subtle">The workspace name is shared with everyone in your organization.</Text></header>
          {manage ? <form onSubmit={save}>
            <div className="settings-card-body"><div className="settings-fields"><div className="settings-name-field"><Label htmlFor="team-name">Workspace name</Label><Textfield id="team-name" value={name} onChange={event => setName(event.currentTarget.value)} maxLength={128} isDisabled={busy} isRequired /></div>{nameError != null && <ErrorBlock title="Could not save workspace" error={nameError} />}</div></div>
            <footer className="settings-card-footer"><Button appearance="primary" type="submit" isDisabled={busy || !name.trim() || name.trim() === s?.organization.name} isLoading={busy}>Save workspace</Button></footer>
          </form> : <div className="settings-card-body"><Text>{s?.organization.name}</Text></div>}
        </section>
        {readMembers && <section className="settings-card" aria-labelledby="team-title"><header className="settings-card-header"><Heading size="small" as="h2" id="team-title">Members</Heading></header>
          <div className="settings-card-table">
          <Table label="Workspace members" isLoading={team.isLoading} error={team.error} onRetry={() => void team.refetch()} columns={[{ key: 'name', content: 'Name' }, { key: 'email', content: 'Email' }, { key: 'role', content: 'Role' }]} rows={team.data?.members.map(member => ({ key: member.id, cells: [{ content: member.name }, { content: member.email }, { content: <span className="capitalize">{member.role.replace(/_/g, ' ')}</span> }] }))} emptyView={<Text>No workspace members found.</Text>} />
          </div>
        </section>}
        {canExports && <SettingsSection title="Exports" description="Review and download email activity exports for your team."><LinkButton href="/exports">View exports</LinkButton></SettingsSection>}

      </div></>}
      {tab === 3 && <>{canSmtp ? <SmtpPage embedded /> : <div className="settings-panel"><Text as="p">Your role does not have access to SMTP credentials.</Text></div>}</>}
      {tab === 4 && <><IntegrationSettings /></>}
      {tab === 5 && <><DocumentSettings /></>}
      {tab === 6 && <><div className="settings-panel"><section className="settings-card" aria-labelledby="account-title"><header className="settings-card-header"><Heading size="small" as="h2" id="account-title">Your account</Heading></header><div className="settings-card-body"><dl className="definition-list"><dt>Name</dt><dd>{s?.user.name}</dd><dt>Email address</dt><dd>{s?.user.email}</dd><dt>Role</dt><dd className="capitalize">{s?.role.replace(/_/g, ' ')}</dd><dt>Project</dt><dd>{s?.project.name}</dd><dt>Workspace status</dt><dd className="capitalize">{s?.organization.status}</dd></dl></div></section></div></>}
      {tab === 7 && <PersonalSettings/>}
      </div></div>
    </div>
  </ModalDialog></ModalTransition>;
}
