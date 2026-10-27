import Lozenge from '../components/controls/Lozenge';
import { EmptyResource } from '../components/EmptyResource';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useContext } from 'react';
import { SettingsReturnContext } from '../lib/settings-modal';
import { SideSheet } from '../components/SideSheet';
import { ErrorBlock, LoadingBlock } from '../components/feedback';
import LinkButton from '../components/controls/LinkButton';
import Button from '../components/controls/Button';
import { Text } from '@atlaskit/primitives';
import { Page } from '../components/Page';
import { Table } from '../components/Table';
import { useNotify } from '../components/feedback';
import { api, downloadCsv, type Page as ApiPage } from '../lib/api';
import { formatDate, useCursorPages } from '../lib/hooks';

interface ExportJob { id: string; status: 'queued' | 'running' | 'ready' | 'failed'; row_count: number; error: string | null; created_at: string; expires_at: string }
export function ExportsPage() {
  const pages = useCursorPages(); const notify = useNotify();
  const params = new URLSearchParams({ limit: '25', ...(pages.cursor ? { cursor: pages.cursor } : {}) });
  const q = useQuery({ queryKey: ['exports', params.toString()], queryFn: () => api.get<ApiPage<ExportJob>>(`/v1/exports?${params}`), refetchInterval: 2000 });
  return <Page title="Exports" route="/exports" description="Download email activity exports. Files remain available for seven days.">
    <Table label="Background exports" isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()}
      columns={[{ key: 'created', content: 'Created' }, { key: 'status', content: 'Status' }, { key: 'rows', content: 'Rows processed' }, { key: 'expiry', content: 'Expires' }, { key: 'actions', content: 'Download' }]}
      rows={q.data?.data.map((job) => { const expired = new Date(job.expires_at) <= new Date(); return { key: job.id, cells: [{ content: formatDate(job.created_at) }, { content: <span title={job.error ?? undefined}><Lozenge appearance={expired ? 'default' : job.status === 'failed' ? 'removed' : job.status === 'ready' ? 'success' : 'inprogress'}>{expired ? 'Expired' : ({ queued: 'Queued', running: 'Processing', ready: 'Ready', failed: 'Failed' })[job.status]}</Lozenge></span> }, { content: job.row_count }, { content: formatDate(job.expires_at) }, { content: job.status === 'ready' && !expired ? <Button onClick={async () => { try { await downloadCsv(`/v1/exports/${job.id}/download`, `emails-${job.id}.csv`); } catch (error) { notify.failure('Download failed', error); } }}>Download CSV</Button> : null }] }; })}
      pagination={{ hasPrevious: pages.hasPrevious, hasNext: !!q.data?.next_cursor, onPrevious: pages.previous, onNext: () => pages.next(q.data?.next_cursor ?? null) }} emptyView={<EmptyResource title="No exports yet" description="Choose filters on the Emails page, then select Export to create a download." action={<LinkButton href="/emails">View emails</LinkButton>} />} />
  </Page>;
}

interface Notification { id: string; type: string; message: string; resource_id: string | null; created_at: string }
export function NotificationsPage() {
  const returnTo = useContext(SettingsReturnContext), navigate = useNavigate();
  const pages = useCursorPages();
  const params = new URLSearchParams({ limit: '25', ...(pages.cursor ? { cursor: pages.cursor } : {}) });
  const q = useQuery({ queryKey: ['notifications', params.toString()], queryFn: () => api.get<ApiPage<Notification>>(`/v1/notifications?${params}`), refetchInterval: 10_000 });
  return <SideSheet title="Notifications" placement="floating" onClose={() => navigate(returnTo, { replace: true })}>
    {q.isLoading && <LoadingBlock label="Loading Notifications"/>}
    {q.error && <ErrorBlock error={q.error} onRetry={() => void q.refetch()}/>}
    {q.data && !q.data.data.length && <div className="notifications-empty"><Text weight="semibold">You're All Caught Up</Text><Text as="p" color="color.text.subtle">No workspace alerts to review.</Text></div>}
    {!!q.data?.data.length && <ul className="notifications-list">{q.data.data.map(notice => <li key={notice.id}><p>{notice.message}</p><time dateTime={notice.created_at}>{formatDate(notice.created_at)}</time>{notice.type === 'webhook.disabled' && notice.resource_id && <Link to={`/webhooks/${notice.resource_id}`}>Open Webhook</Link>}</li>)}</ul>}
    {(pages.hasPrevious || q.data?.next_cursor) && <nav className="notifications-pagination" aria-label="Notification Pages"><Button isDisabled={!pages.hasPrevious || q.isFetching} onClick={pages.previous}>Previous</Button><Button isDisabled={!q.data?.next_cursor || q.isFetching} onClick={() => pages.next(q.data?.next_cursor ?? null)}>Next</Button></nav>}
  </SideSheet>;
}
