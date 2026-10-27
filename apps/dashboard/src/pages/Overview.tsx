import { EmptyResource } from '../components/EmptyResource';
import { Link, useSearchParams } from 'react-router-dom';
import { useMemo } from 'react';
import { FilterSelect } from '../components/FilterSelect';
import { UsageChart } from '../components/UsageChart';
import { useQuery } from '@tanstack/react-query';
import LinkButton from '../components/controls/LinkButton';
import Heading from '@atlaskit/heading';
import { CheckCircle as CheckCircleIcon } from '../components/icons';
import { CheckCircleUnchecked as CheckCircleUncheckedIcon } from '../components/icons';
import Lozenge from '../components/controls/Lozenge';
import { Inline, Stack, Text } from '@atlaskit/primitives';
import { Stat } from '../components/Stat';
import { StateLozenge } from '../components/status';
import { token } from '@atlaskit/tokens';
import { ErrorBlock, LoadingBlock } from '../components/feedback';
import { Page } from '../components/Page';
import { Table } from '../components/Table';
import { api, type ApiKey, type Domain, type EmailSummary, type Overview, type Page as ApiPage, type Webhook } from '../lib/api';
import { formatDate, relativeTime, useCan } from '../lib/hooks';

const STATE_ORDER = ['QUEUED', 'SCHEDULED', 'DISPATCHING', 'MTA_ACCEPTED', 'DEFERRED', 'RETRYING', 'DELIVERY_UNKNOWN', 'REMOTE_ACCEPTED', 'BOUNCED', 'FAILED', 'SUPPRESSED', 'CANCELLED'];

interface Step {
  id: string;
  title: string;
  description: string;
  done: boolean;
  action: { label: string; href: string };
}

function GetStarted({ steps }: { steps: Step[] }) {
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  return (
    <section className="card" aria-labelledby="get-started">
      <Stack space="space.150">
        <Inline spread="space-between" alignBlock="center">
          <Heading size="small" as="h2" id="get-started">
            Workspace setup
          </Heading>
          <Lozenge appearance={done === steps.length ? 'success' : 'inprogress'}>
            {done} of {steps.length} done
          </Lozenge>
        </Inline>
        <ol className="checklist">
          {steps.map((s) => (
            <li key={s.id}>
              {s.done ? (
                <CheckCircleIcon label="Done" color={token('color.icon.success')} />
              ) : (
                <CheckCircleUncheckedIcon label="Not done yet" color={token('color.icon.subtle')} />
              )}
              <Stack space="space.050" grow="fill">
                <Text weight="semibold" color={s.done ? 'color.text.subtle' : 'color.text'}>
                  {s.title}
                </Text>
                <Text size="small" color="color.text.subtle">
                  {s.description}
                </Text>
              </Stack>
              {next?.id === s.id && (
                <LinkButton href={s.action.href} appearance="primary" spacing="compact">
                  {s.action.label}
                </LinkButton>
              )}
            </li>
          ))}
        </ol>
      </Stack>
    </section>
  );
}

export function OverviewPage() {
  const canAnalytics = useCan('analytics:read');
  const canDomains = useCan('domains:read');
  const canKeys = useCan('api_keys:read');
  const canEmails = useCan('emails:read');
  const canHooks = useCan('webhooks:read');
  const [periodParams, setPeriodParams] = useSearchParams();
  const requestedHours = Number(periodParams.get('hours') ?? 24);
  const hours = [24,168,720].includes(requestedHours) ? requestedHours : 24;
  const usageDays = Math.max(1,Math.ceil(hours / 24));
  const volume = useQuery({queryKey:['usage',usageDays,'false'],queryFn:()=>api.get<{data:Array<{date:string;emails:number}>}>(`/v1/usage?days=${usageDays}&test_mode=false`),enabled:canAnalytics});
  const after = useMemo(() => new Date(Date.now() - hours * 3600000).toISOString(), [hours]);
  const overview = useQuery({ queryKey: ['overview', hours], queryFn: () => api.get<Overview>('/v1/overview?hours=' + hours), refetchInterval: 15_000 });
  const recent = useQuery({ queryKey: ['emails', 'overview', after], queryFn: () => api.get<ApiPage<EmailSummary>>('/v1/emails?limit=5&created_after=' + encodeURIComponent(after)), enabled: canEmails, refetchInterval: 15_000 });
  const domains = useQuery({ queryKey: ['domains'], queryFn: () => api.get<{ data: Domain[] }>('/v1/domains'), enabled: canDomains });
  const keys = useQuery({ queryKey: ['api-keys'], queryFn: () => api.get<{ data: ApiKey[] }>('/v1/api-keys'), enabled: canKeys });
  const emails = useQuery({ queryKey: ['emails', 'latest'], queryFn: () => api.get<ApiPage<EmailSummary>>('/v1/emails?limit=5'), enabled: canEmails });
  const hooks = useQuery({ queryKey: ['webhooks'], queryFn: () => api.get<{ data: Webhook[] }>('/v1/webhooks'), enabled: canHooks });

  const firstDomain = domains.data?.data[0];
  const allSteps: Array<Step & { visible: boolean; ready: boolean }> = [
    {
      id: 'domain',
      title: 'Add a sending domain',
      description: 'Use a domain or subdomain you control, such as notify.example.com.',
      done: (domains.data?.data.length ?? 0) > 0,
      action: { label: 'Add domain', href: '/domains' },
      visible: canDomains,
      ready: !domains.isLoading && !domains.isError,
    },
    {
      id: 'verify',
      title: 'Verify it with DNS',
      description: 'Publish the generated records at your DNS provider so we can sign and send your mail.',
      done: !!domains.data?.data.some((d) => d.sending_enabled),
      action: { label: 'Verify domain', href: firstDomain ? `/domains/${firstDomain.id}` : '/domains' },
      visible: canDomains,
      ready: !domains.isLoading && !domains.isError,
    },
    {
      id: 'key',
      title: 'Create an API key',
      description: 'Create a sending key for your application.',
      done: !!keys.data?.data.some((k) => !k.revoked_at),
      action: { label: 'Create API key', href: '/api-keys' },
      visible: canKeys,
      ready: !keys.isLoading && !keys.isError,
    },
    {
      id: 'email',
      title: 'Send your first email',
      description: 'Use the API, SMTP, or Send test email on the Emails page.',
      done: (emails.data?.data.length ?? 0) > 0,
      action: { label: 'Go to Emails', href: '/emails' },
      visible: canEmails,
      ready: !emails.isLoading && !emails.isError,
    },
    {
      id: 'webhook',
      title: 'Add a webhook (optional)',
      description: 'Get notified when mail is accepted, bounces or fails.',
      done: (hooks.data?.data.length ?? 0) > 0,
      action: { label: 'Add webhook', href: '/webhooks' },
      visible: canHooks,
      ready: !hooks.isLoading && !hooks.isError,
    },
  ];
  const steps = allSteps.filter((s) => s.visible);
  const stepsReady = steps.every((s) => s.ready);
  const allDone = steps.filter(step => step.id !== 'webhook').every(step => step.done);
  const recipientStates = STATE_ORDER.filter(state => (overview.data?.recipients_by_state[state] ?? 0) > 0);
  const recipientTotal = Object.values(overview.data?.recipients_by_state ?? {}).reduce((sum, count) => sum + count, 0);
  const hasRecipientActivity = recipientStates.length > 0;
  const showVolume = canAnalytics && (volume.isLoading || volume.isError || !!volume.data?.data.some(day => day.emails > 0) || hasRecipientActivity);
  const hasPreviousEmails = (emails.data?.data.length ?? 0) > 0;

  return (
    <Page title="Overview" route="/" crumbs={[]} actions={<FilterSelect aria-label="Overview period" calendar value={hours} options={[{label:'Past day',value:24},{label:'Past 7 days',value:168},{label:'Past 30 days',value:720}]} onChange={event=>setPeriodParams(previous=>{const next=new URLSearchParams(previous);next.set('hours',event.currentTarget.value);return next;})} />} >
      {overview.isLoading && <LoadingBlock />}
      {overview.error && <ErrorBlock error={overview.error} onRetry={() => void overview.refetch()} />}
      {overview.data && (
        <Stack space="space.200">
          {stepsReady && steps.length > 0 && !allDone && <GetStarted steps={steps} />}
          <div className="stat-grid">
                <Stat label="Recipients submitted" value={overview.data.submitted_in_window ?? Object.values(overview.data.recipients_by_state).reduce((sum,count)=>sum+count,0)} />
                <Stat
                  label="Server accepted"
                  value={overview.data.recipients_by_state.REMOTE_ACCEPTED ?? 0}
                  hint="Accepted by recipient servers"
                />
                <Stat label="Bounced" value={overview.data.recipients_by_state.BOUNCED ?? 0} />
                <Stat label="Verified domains" value={`${overview.data.verified_domains} of ${overview.data.total_domains}`} />
              </div>
          {(showVolume || hasRecipientActivity) && <div className={`overview-analytics${showVolume && hasRecipientActivity ? ' overview-analytics-split' : ''}`}>
            {showVolume && <div className="overview-volume">{volume.isLoading ? <LoadingBlock label="Loading sending volume" /> : volume.error ? <ErrorBlock title="Unable to load sending volume" error={volume.error} onRetry={()=>void volume.refetch()} /> : <UsageChart days={volume.data?.data ?? []} showEmpty description="Emails accepted for processing, by day (UTC)." />}</div>}
            {hasRecipientActivity && <section className="overview-recipient-status" aria-labelledby="recipient-status-title">
              <div className="recipient-status-heading"><Heading size="small" as="h2" id="recipient-status-title">Recipient status</Heading><Text size="small" color="color.text.subtle">{recipientTotal.toLocaleString()} total</Text></div>
              <div className="recipient-status-scroll" role="region" aria-label="Recipient status breakdown" tabIndex={0}><dl className="recipient-status-list">{recipientStates.map(state => {
                const count = overview.data!.recipients_by_state[state] ?? 0;
                return <div className="recipient-status-row" key={state}><dt><StateLozenge state={state} compact /></dt><dd><strong>{count.toLocaleString()}</strong><span className="recipient-percentage">{Math.round(count / recipientTotal * 100)}%</span></dd><dd className="recipient-status-track" aria-hidden="true"><span style={{width: `${count / recipientTotal * 100}%`}} /></dd></div>;
              })}</dl></div>
              <Text as="p" size="small" color="color.text.subtle">Accepted means the recipient server accepted the email, not confirmed inbox placement.</Text>
            </section>}
          </div>}
          {canEmails && <section className="overview-section" aria-labelledby="recent-activity-title">
            <div className="section-heading-row"><Heading size="small" as="h2" id="recent-activity-title">Recent email activity</Heading><LinkButton href="/emails" appearance="subtle" spacing="compact">View all emails</LinkButton></div>
            <Table compact label="Recent emails" isLoading={recent.isLoading} error={recent.error} onRetry={() => void recent.refetch()}
              columns={[{ key: 'email', content: 'Email', width: 56 }, { key: 'status', content: 'Status', width: 24 }, { key: 'time', content: 'Submitted', width: 20 }]}
              rows={recent.data?.data.map(email => ({ key: email.id, cells: [{ content: <div className="recent-email"><Link to={`/emails/${email.id}`} title={email.subject || '(no subject)'}>{email.subject || '(no subject)'}</Link><span className="recent-email-recipient" title={email.to.join(', ')}>{email.to.join(', ') || 'BCC recipients'}</span></div> }, { content: <StateLozenge state={email.status} compact /> }, { content: <span title={formatDate(email.created_at)}>{relativeTime(email.created_at)}</span> }] }))}
              emptyView={<EmptyResource title={hasPreviousEmails ? 'No emails in this period' : 'No email activity yet'} description={hasPreviousEmails ? 'Choose a longer period to see earlier emails.' : 'Your recent emails and recipient statuses will appear here after you send an email.'} />} />
          </section>}
        </Stack>
      )}
    </Page>
  );
}

