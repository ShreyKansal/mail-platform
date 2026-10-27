import Heading from '@atlaskit/heading';
import { Stat } from '../components/Stat';
import { UsageChart } from '../components/UsageChart';
import { EmptyResource } from '../components/EmptyResource';
import { useSearchParams } from 'react-router-dom';
import { FilterSelect } from '../components/FilterSelect';
import { useQuery } from '@tanstack/react-query';
import { Text } from '@atlaskit/primitives';
import { Page } from '../components/Page';
import { Table } from '../components/Table';
import { ErrorBlock, LoadingBlock } from '../components/feedback';
import { api, type Page as ApiPage } from '../lib/api';
import { formatDate, useCursorPages } from '../lib/hooks';
import Lozenge from '../components/controls/Lozenge';
import { CopyButton } from '../components/dialogs';

const eventLabels: Record<string, string> = {
  'email.accepted': 'Accepted for processing', 'email.scheduled': 'Scheduled', 'email.rescheduled': 'Rescheduled',
  'email.suppressed': 'Suppressed', 'email.mta_accepted': 'Handed to mail server', 'email.deferred': 'Deferred',
  'email.remote_accepted': 'Server accepted', 'email.bounced': 'Bounced', 'email.failed': 'Failed',
  'email.cancelled': 'Cancelled', 'email.delivery_unknown': 'Delivery status unknown',
};
interface RequestLog { id: string; request_id: string; method: string; route: string; status_code: number; duration_ms: number; created_at: string }
export function LogsPage() {
  const pages = useCursorPages();
  const query = new URLSearchParams({ limit: '25', ...(pages.cursor ? { cursor: pages.cursor } : {}) });
  const q = useQuery({ queryKey: ['logs', query.toString()], queryFn: () => api.get<ApiPage<RequestLog>>(`/v1/logs?${query}`), refetchInterval: 10_000 });
  return <Page title="API logs" route="/logs">
    <Table label="API request logs" isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()}
      columns={[{ key: 'time', content: 'Time', width:20 }, { key: 'route', content: 'Request', width:30 }, { key: 'status', content: 'Status', width:12 }, { key: 'duration', content: 'Duration', width:12 }, { key: 'request', content: 'Request ID', width:26 }]}
      rows={q.data?.data.map((log) => ({ key: log.id, cells: [{ content: formatDate(log.created_at) }, { content: <div><strong>{log.method}</strong><span className="email-list-meta" title={log.route}>{log.route}</span></div> }, { content: <Lozenge appearance={log.status_code >= 500 ? 'removed' : log.status_code >= 400 ? 'moved' : 'success'}>{log.status_code}</Lozenge> }, { content: `${log.duration_ms} ms` }, { content: <div className="log-request-id"><span title={log.request_id}>{log.request_id}</span><CopyButton value={log.request_id} label="Copy request ID" /></div> }] }))}
      pagination={{ hasPrevious: pages.hasPrevious, hasNext: !!q.data?.next_cursor, onPrevious: pages.previous, onNext: () => pages.next(q.data?.next_cursor ?? null) }} emptyView={<EmptyResource title="No API requests yet" description="Requests from your applications appear here with their response codes and duration." />} />
    <Text size="small" color="color.text.subtle">Request logs exclude credentials and message content.</Text>
  </Page>;
}

export function MetricsPage() {
  const [filters, setFilters] = useSearchParams();
  const days = [7,30,90].includes(Number(filters.get('days'))) ? Number(filters.get('days')) : 30;
  const testMode = filters.get('test_mode') === 'true' ? 'true' : 'false';
  const update = (key: string, value: string) => setFilters(previous=>{const next=new URLSearchParams(previous);next.set(key,value);return next;});
  const usage = useQuery({ queryKey: ['usage', days, testMode], queryFn: () => api.get<{ data: Array<{ date: string; emails: number; recipients: number }> }>(`/v1/usage?days=${days}&test_mode=${testMode}`) });
  const events = useQuery({ queryKey: ['analytics', days, testMode], queryFn: () => api.get<{ data: Array<{ date: string; type: string; count: number }> }>(`/v1/analytics?days=${days}&test_mode=${testMode}`) });
  return <Page title="Analytics" route="/metrics" actions={<div className="page-filter-actions"><FilterSelect aria-label="Analytics period" calendar value={days} options={[7,30,90].map(value=>({label:'Past '+value+' days',value}))} onChange={event=>update('days',event.currentTarget.value)} /><FilterSelect aria-label="Delivery mode" value={testMode} options={[{value:'false',label:'Live emails'},{value:'true',label:'Simulated emails'}]} onChange={event=>update('test_mode',event.currentTarget.value)} /></div>}>
    {usage.error || events.error ? <ErrorBlock error={usage.error ?? events.error} onRetry={() => { void usage.refetch(); void events.refetch(); }} /> : usage.isLoading || events.isLoading ? <LoadingBlock /> : <>
      <div className="stat-grid analytics-stats">
        <Stat label="Emails accepted" value={(usage.data?.data ?? []).reduce((sum, day) => sum + day.emails, 0).toLocaleString()} />
        <Stat label="Recipients accepted" value={(usage.data?.data ?? []).reduce((sum, day) => sum + day.recipients, 0).toLocaleString()} hint={testMode === 'true' ? 'Simulated emails' : 'Live emails'} />
        <Stat label="Delivery events" value={(events.data?.data ?? []).reduce((sum, day) => sum + day.count, 0).toLocaleString()} hint="An email can generate multiple events" />
      </div>
      {(usage.data?.data.length || events.data?.data.length) ? <><UsageChart days={usage.data?.data ?? []} />
      <section className="analytics-section"><Heading size="small" as="h2">Daily usage</Heading>
      <Table label="Daily usage" isLoading={false} columns={[{ key: 'date', content: 'Date (UTC)' }, { key: 'emails', align: 'end', content: 'Emails accepted' }, { key: 'recipients', align: 'end', content: 'Recipients accepted' }]} rows={usage.data?.data.map((day) => ({ key: day.date, cells: [{ content: day.date }, { content: day.emails }, { content: day.recipients }] }))} emptyView={<Text>No usage recorded in this period.</Text>} />
      </section><section className="analytics-section"><Heading size="small" as="h2">Delivery events</Heading>
      <Table label="Daily events" isLoading={false} columns={[{ key: 'date', content: 'Date (UTC)' }, { key: 'event', content: 'Event' }, { key: 'count', align: 'end', content: 'Count' }]} rows={events.data?.data.map((day) => ({ key: `${day.date}:${day.type}`, cells: [{ content: day.date }, { content: eventLabels[day.type] ?? day.type }, { content: day.count }] }))} emptyView={<Text>No delivery events recorded in this period.</Text>} />
      </section>
      </> : <section className="card"><EmptyResource title="No activity in this period" description="Choose another period or delivery mode to review email activity." /></section>}
    </>}
  </Page>;
}
