import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../components/controls/Button';
import LinkButton from '../components/controls/LinkButton';
import { EmptyState } from '../components/EmptyState';
import { Field, Label } from '@atlaskit/form';
import Select from '@atlaskit/select';
import { Send as SendIcon } from '../components/icons';
import { Filter as FilterIcon } from '../components/icons';
import { X, Mail, Code2 } from '../components/icons';
import { ApiExamples } from '../components/ApiExamples';
import { EmailFiltersDialog } from '../components/EmailFiltersDialog';
import { EMAIL_FILTER_KEYS, readEmailFilters, emailQuery, type EmailFilters } from '../lib/email-filters';
import DropdownMenu, { DropdownItem, DropdownItemGroup } from '../components/controls/DropdownMenu';
import { Inline, Stack, Text } from '@atlaskit/primitives';
import SectionMessage from '@atlaskit/section-message';
import Tabs, { Tab, TabList, TabPanel } from '../components/controls/Tabs';
import TextArea from '../components/controls/Textarea';
import Textfield from '../components/controls/Textfield';
import { ConfirmDialog, CopyButton, DetailsDialog, FormDialog } from '../components/dialogs';
import { ErrorBlock, LoadingBlock, useNotify } from '../components/feedback';
import { Page, TabBody } from '../components/Page';
import { StateLozenge, stateLabel } from '../components/status';
import { Table } from '../components/Table';
import { api, downloadCsv, saveBlob, type Domain, type EmailDetail, type EmailSummary, type Page as ApiPage } from '../lib/api';
import { formatDate, relativeTime, useCan, useCursorPages } from '../lib/hooks';

const FILTERABLE = ['QUEUED', 'SCHEDULED', 'MTA_ACCEPTED', 'DEFERRED', 'REMOTE_ACCEPTED', 'BOUNCED', 'FAILED', 'SUPPRESSED', 'CANCELLED', 'DELIVERY_UNKNOWN'];

interface SendValues {
  from: string;
  to: string;
  subject: string;
  text: string;
}

function SendTestDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState('live');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const notify = useNotify();
  const domains = useQuery({ queryKey: ['domains'], queryFn: () => api.get<{ data: Domain[] }>('/v1/domains') });
  const verified = domains.data?.data.filter((d) => d.sending_enabled) ?? [];
  if (domains.isLoading || domains.error) {
    return <DetailsDialog title="Send test email" onClose={onClose}>
      {domains.error ? <ErrorBlock error={domains.error} onRetry={() => void domains.refetch()} /> : <LoadingBlock label="Loading sending domains" />}
    </DetailsDialog>;
  }
  if (verified.length === 0) {
    return (
      <ConfirmDialog title="Verify a domain first" confirmLabel="Go to Domains" appearance="warning" onClose={onClose} onConfirm={() => navigate('/domains')}>
        <Text as="p">Mail can only be sent from a domain you have verified with DNS. Add and verify a domain, then come back to send a test.</Text>
      </ConfirmDialog>
    );
  }
  return (
    <FormDialog<SendValues>
      title="Send or simulate an email"
      submitLabel={mode === 'live' ? 'Send real email' : 'Run simulation'}
      fields={['from', 'to', 'subject', 'text']}
      onClose={onClose}
      onSubmit={async (v) => {
        const r = await api.post<{ id: string }>('/v1/emails', { from: v.from.trim(), to: mode === 'live' ? v.to.trim() : `${mode}@simulate.mail-platform.invalid`, subject: v.subject, text: v.text, test_mode: mode !== 'live' });
        await qc.invalidateQueries({ queryKey: ['emails'] });
        notify.success('Email accepted', 'Follow its delivery on the next screen.');
        navigate(`/emails/${r.id}`);
      }}
    >
      <div><Label htmlFor="send-mode">Delivery mode</Label><Select inputId="send-mode" value={{ value: mode, label: ({ live: 'Live — sends real email', success: 'Simulate success', defer: 'Simulate deferral then success', bounce: 'Simulate hard bounce', suppress: 'Simulate suppression' } as Record<string, string>)[mode] }} options={[{ value: 'live', label: 'Live — sends real email' }, { value: 'success', label: 'Simulate success' }, { value: 'defer', label: 'Simulate deferral then success' }, { value: 'bounce', label: 'Simulate hard bounce' }, { value: 'suppress', label: 'Simulate suppression' }]} onChange={(option) => setMode(option?.value ?? 'live')} /></div>
      {mode !== 'live' && <SectionMessage appearance="information"><Text>No email will be sent. The simulator produces labelled delivery events for a reserved address.</Text></SectionMessage>}
      <Field<string>
        name="from"
        label="From"
        isRequired
        defaultValue={`noreply@${verified[0]!.name}`}
        helperMessage={`Any address at a verified domain: ${verified.map((d) => d.name).join(', ')}.`}
        validate={(v) => (!v || !v.includes('@') ? 'Enter a sender address' : undefined)}
        component={({ fieldProps }) => <Textfield {...fieldProps} />}
      />
      {mode === 'live' && <Field<string>
        name="to"
        label="To"
        isRequired
        defaultValue=""
        helperMessage="One address. Mail is really sent, so use an address you own."
        validate={(v) => (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? 'Enter one valid email address' : undefined)}
        component={({ fieldProps }) => <Textfield {...fieldProps} type="email" autoFocus />}
      />}
      <Field<string>
        name="subject"
        label="Subject"
        isRequired
        defaultValue="Test from mymorphix Mailer"
        validate={(v) => (!v?.trim() ? 'Enter a subject' : undefined)}
        component={({ fieldProps }) => <Textfield {...fieldProps} />}
      />
      <Field<string, HTMLTextAreaElement>
        name="text"
        label="Message"
        isRequired
        defaultValue="This is a test message."
        validate={(v) => (!v?.trim() ? 'Enter a message' : undefined)}
        component={({ fieldProps }) => <TextArea {...fieldProps} minimumRows={4} />}
      />
    </FormDialog>
  );
}



export function EmailsPage() {
  const navigate = useNavigate();
  const [urlParams, setUrlParams] = useSearchParams();
  const headerSearch = urlParams.get('search') ?? '';
  const filters = readEmailFilters(urlParams);
  const {status, after, before, api_key_id: apiKey, source, test_mode: testModeFilter} = filters;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const search = headerSearch;
  const activeFilters = [status, search.trim(), after, before, apiKey, source, testModeFilter].filter(Boolean).length;
  const clearFilters = () => { pages.reset();setUrlParams(previous=>{const next=new URLSearchParams(previous);for(const key of [...EMAIL_FILTER_KEYS,'search'])next.delete(key);return next;}); };
  const applyFilters = (value: EmailFilters) => {pages.reset();setUrlParams(previous=>{const next=new URLSearchParams(previous);for(const key of EMAIL_FILTER_KEYS){if(value[key])next.set(key,value[key]);else next.delete(key);}return next;});};
  const removeFilter = (key: string) => {pages.reset();setUrlParams(previous=>{const next=new URLSearchParams(previous);next.delete(key);return next;});};
  const canExport = useCan('org:manage');
  const notify = useNotify();
  const [exporting, setExporting] = useState(false);
  const canReadKeys = useCan('api_keys:read');
  const keys = useQuery({ queryKey: ['api-keys'], queryFn: () => api.get<{ data: Array<{ id: string; name: string }> }>('/v1/api-keys'), enabled: canReadKeys });
  const [sending, setSending] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const pages = useCursorPages(urlParams.toString());
  const canSend = useCan('emails:send');
  const params = emailQuery(filters, search);
  if (pages.cursor) params.set('cursor', pages.cursor);
  const q = useQuery({ queryKey: ['emails', params.toString()], queryFn: () => api.get<ApiPage<EmailSummary>>(`/v1/emails?${params}`), refetchInterval: 10_000 });
  const options = [{ label: 'Any status', value: '' }, ...FILTERABLE.map((s) => ({ label: stateLabel(s), value: s }))];
  const send = canSend ? (
    <Button appearance="primary" iconBefore={SendIcon} onClick={() => setSending(true)}>
      Send test email
    </Button>
  ) : undefined;

  return (
    <Page title="Emails" route="/emails" actions={<Inline space="space.100" shouldWrap><Button spacing="compact" aria-label="Open sending API examples" aria-haspopup="dialog" onClick={()=>setCodeOpen(true)}><Code2 size={18} aria-hidden />API</Button><Button spacing="compact" iconBefore={FilterIcon} aria-haspopup="dialog" onClick={()=>setFiltersOpen(true)}>Filters{activeFilters ? ' ('+activeFilters+')' : ''}</Button>{canExport && <DropdownMenu trigger={exporting ? 'Exporting…' : 'Export'}><DropdownItemGroup><DropdownItem isDisabled={exporting} onClick={async () => {
      setExporting(true);
      const filters = new URLSearchParams(params); filters.delete('limit'); filters.delete('cursor');
      try { await downloadCsv(`/v1/emails/export?${filters}`, 'emails.csv'); } catch (error) { notify.failure('Could not export emails', error); } finally { setExporting(false); }
    }}>Download CSV (first 1,000)</DropdownItem><DropdownItem onClick={async () => {
      const filters = new URLSearchParams(params); filters.delete('limit'); filters.delete('cursor');
      try { await api.post('/v1/exports', { filters: Object.fromEntries(filters) }); navigate('/exports'); } catch (error) { notify.failure('Could not queue export', error); }
    }}>Create export</DropdownItem></DropdownItemGroup></DropdownMenu>}{send}</Inline>}>
      <section className="email-panel" aria-label="Email activity">
      {activeFilters > 0 && <div className="filter-toolbar">
        <div className="filter-chips">
          {[
            {key:'status',value:status,label:'Status: '+stateLabel(status)},
            {key:'after',value:after,label:'From: '+after},{key:'before',value:before,label:'To: '+before},
            {key:'source',value:source,label:'Source: '+source.toUpperCase()},
            {key:'api_key_id',value:apiKey,label:'Key: '+(keys.data?.data.find(key=>key.id===apiKey)?.name ?? 'Selected key')},
            {key:'test_mode',value:testModeFilter,label:testModeFilter==='true'?'Simulated only':'Live only'},
            {key:'search',value:search.trim(),label:'Search: '+search.trim()},
          ].filter(item=>item.value).map(item=><button type="button" className="filter-chip" key={item.key} aria-label={'Remove '+item.key+' filter'} title={item.label} onClick={()=>removeFilter(item.key)}><span>{item.label}</span><X size={14} aria-hidden /></button>)}
        </div>
        <div className="filter-toolbar-actions"><Button appearance="subtle" spacing="compact" onClick={clearFilters}>Clear filters</Button></div>
      </div>}
      <div className="email-results">
      <Table
        label="Emails"
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        columns={[
          { key: 'subject', content: 'Email', isSortable: true, width: 34 },
          { key: 'to', content: 'Recipient', isSortable: true, width: 25 },
          { key: 'status', content: 'Status', isSortable: true, width: 22 },
          { key: 'created', content: 'Submitted', isSortable: true, width: 19 },
        ]}
        rows={q.data?.data.map((e) => ({
          key: e.id,
          cells: [
            { content: <div className="email-list-primary"><Mail size={18} aria-hidden /><div className="email-subject"><Link to={`/emails/${e.id}`} title={e.subject || '(no subject)'}>{e.subject || '(no subject)'}</Link><span className="email-list-meta" title={e.from}>{e.from}</span></div></div>, sortValue: e.subject },
            { content: <span className="email-address" title={e.to.join(', ')}>{e.to.join(', ') || '(BCC only)'}</span>, sortValue: e.to.join(',') },
            { content: <div><StateLozenge state={e.status} compact /><span className="email-list-meta">{e.test_mode ? 'Simulation · ' : ''}{e.source.toUpperCase()}</span></div>, sortValue: e.status },
            { content: <span title={formatDate(e.created_at)}>{relativeTime(e.created_at)}</span>, sortValue: e.created_at },
          ],
        }))}
        pagination={{ hasPrevious: pages.hasPrevious, hasNext: !!q.data?.next_cursor, onPrevious: pages.previous, onNext: () => pages.next(q.data?.next_cursor ?? null) }}
        emptyView={
          activeFilters > 0 ? (
            <EmptyState headingLevel={2} header="No matching emails" description="Try a different search or clear your filters to see all emails." />
          ) : (
            <EmptyState
              headingLevel={2}
              header="No emails yet"
              description="Emails you send through the API or SMTP appear here with their delivery status."
            />
          )
        }
      />
      </div>
      </section>
      {filtersOpen && <EmailFiltersDialog value={filters} statuses={options} keys={canReadKeys ? keys.data?.data ?? [] : undefined} onApply={applyFilters} onClose={()=>setFiltersOpen(false)} />}
      {sending && <SendTestDialog onClose={() => setSending(false)} />}
      {codeOpen && <ApiExamples onClose={()=>setCodeOpen(false)} />}
    </Page>
  );
}

function EventTimeline({ email }: { email: EmailDetail }) {
  const byRecipient = new Map(email.recipients.map((r) => [r.id, r.address]));
  return (
    <ol className="timeline">
      {email.events.map((ev) => {
        const smtp = ev.data.smtp as { response?: string } | undefined;
        const who = ev.recipient_id ? byRecipient.get(ev.recipient_id) : null;
        return (
          <li key={ev.id}>
            <Stack space="space.025">
              <Text weight="semibold">
                {ev.type}
                {who && <Text color="color.text.subtle"> · {who}</Text>}
              </Text>
              <Text size="small" color="color.text.subtle">
                {formatDate(ev.occurred_at)}
                {smtp?.response ? ` · ${smtp.response}` : ''}
              </Text>
            </Stack>
          </li>
        );
      })}
    </ol>
  );
}

export function EmailDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const notify = useNotify();
  const canSend = useCan('emails:send');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [shared, setShared] = useState<{ id: string; url: string; expires_at: string } | null>(null);
  const canReadContent = useCan('emails:read_content');
  const share = useMutation({ mutationFn: () => api.post<{ id: string; url: string; expires_at: string }>(`/v1/emails/${id}/shares`), onSuccess: setShared, onError: (error) => notify.failure('Could not share email', error) });
  const q = useQuery({ queryKey: ['emails', id], queryFn: () => api.get<EmailDetail>(`/v1/emails/${id}`), refetchInterval: 5_000 });
  const cancel = useMutation({
    mutationFn: () => api.post<{ cancelled: number }>(`/v1/emails/${id}/cancel`),
    onSuccess: (r) => {
      setConfirmCancel(false);
      void qc.invalidateQueries({ queryKey: ['emails'] });
      notify.success(`${r.cancelled} recipient${r.cancelled === 1 ? '' : 's'} cancelled`);
    },
    onError: (err) => {
      setConfirmCancel(false);
      notify.failure('Could not cancel', err);
    },
  });

  if (q.isLoading) return <Page title="Email details" crumbs={[{text:'Emails',href:'/emails'},{text:'Email details'}]}><LoadingBlock label="Loading email" /></Page>;
  if (q.error || !q.data) return <Page title="Email details" crumbs={[{text:'Emails',href:'/emails'},{text:'Email details'}]}><ErrorBlock error={q.error} onRetry={() => void q.refetch()} /></Page>;
  const e = q.data;
  const cancellable = e.recipients.some((r) => ['QUEUED', 'SCHEDULED', 'RETRYING'].includes(r.state));

  return (
    <Page
      title={e.subject || '(no subject)'}
      route="/emails/:id"
      crumbs={[{ text: 'Emails', href: '/emails' }, { text: e.subject }]}
      description={
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <StateLozenge state={e.status} />
          <Text color="color.text.subtle">
            From {e.from} · {formatDate(e.created_at)}
          </Text>
        </Inline>
      }
      actions={
          <Inline space="space.100" shouldWrap>
          {canReadContent && <Button isLoading={share.isPending} onClick={() => share.mutate()}>Share for 48 hours</Button>}
          {canSend && e.recipients.some((r) => r.state === 'SCHEDULED') && e.recipients.every((r) => ['SCHEDULED', 'SUPPRESSED'].includes(r.state)) && <Button onClick={() => setRescheduling(true)}>Reschedule</Button>}
          {canSend && cancellable &&
          <Button onClick={() => setConfirmCancel(true)} appearance="warning">
            Cancel unsent recipients
          </Button>}
          </Inline>
      }
    >
      {e.test_mode && <SectionMessage appearance="information" title="Test mode"><Text>This delivery is simulated. No message was handed to Postfix or sent to a recipient.</Text></SectionMessage>}
      <div className="email-detail-layout"><div className="email-detail-main">
      <Tabs id="email-tabs">
        <TabList>
          <Tab>Content</Tab>
          <Tab>Recipients</Tab>
          <Tab>Timeline</Tab>
          <Tab>Details</Tab>
        </TabList>
        <TabPanel><TabBody><EmailContent email={e} /></TabBody></TabPanel>
        <TabPanel>
          <TabBody>
            <Table
              label="Recipients"
              isLoading={false}
              columns={[
                { key: 'address', content: 'Address', isSortable: true },
                { key: 'kind', content: 'Type' },
                { key: 'state', content: 'State', isSortable: true },
                { key: 'response', content: 'Last SMTP response' },
                { key: 'updated', content: 'Updated' },
              ]}
              rows={e.recipients.map((r) => ({
                key: r.id,
                cells: [
                  { content: <Text weight="medium">{r.address}</Text>, sortValue: r.address },
                  { content: r.kind.toUpperCase() },
                  {
                    content: (
                      <Stack space="space.050">
                        <StateLozenge state={r.state} />
                        {r.bounce_class && (
                          <Text size="small" color="color.text.subtle">
                            {r.bounce_class.replace(/_/g, ' ')}
                          </Text>
                        )}
                      </Stack>
                    ),
                    sortValue: r.state,
                  },
                  {
                    content: r.last_response ? (
                      <Text size="small">
                        <span className="break-all">{r.last_response}</span>
                      </Text>
                    ) : (
                      '—'
                    ),
                  },
                  { content: relativeTime(r.state_changed_at) },
                ],
              }))}
              emptyView={<Text>No recipients.</Text>}
            />
          </TabBody>
        </TabPanel>
        <TabPanel>
          <TabBody>
            <EventTimeline email={e} />
          </TabBody>
        </TabPanel>
        <TabPanel>
          <TabBody>
            <dl className="definition-list">
              <dt>Email ID</dt>
              <dd>
                <Inline space="space.100" alignBlock="center">
                  <span className="break-all">{e.id}</span>
                  <CopyButton value={e.id} label="Copy ID" />
                </Inline>
              </dd>
              <dt>Message-ID</dt>
              <dd className="break-all">&lt;{e.message_id}&gt;</dd>
              <dt>Source</dt>
              <dd>{e.source === 'smtp' ? 'SMTP' : 'API'}</dd>
              {e.reply_to.length > 0 && (
                <>
                  <dt>Reply-To</dt>
                  <dd>{e.reply_to.join(', ')}</dd>
                </>
              )}
              {e.scheduled_at && (
                <>
                  <dt>Scheduled for</dt>
                  <dd>{formatDate(e.scheduled_at)}</dd>
                </>
              )}
              <dt>Tags</dt>
              <dd>{e.tags.length ? e.tags.map((t) => `${t.name}=${t.value}`).join(', ') : '—'}</dd>
              <dt>Metadata</dt>
              <dd>{Object.keys(e.metadata).length ? Object.entries(e.metadata).map(([k, v]) => `${k}=${v}`).join(', ') : '—'}</dd>
            </dl>
          </TabBody>
        </TabPanel>
      </Tabs>
      </div><aside className="card email-detail-summary" aria-labelledby="message-summary-title">
        <h2 id="message-summary-title">Message details</h2>
        <dl>
          <div><dt>Status</dt><dd><StateLozenge state={e.status} /></dd></div>
          <div><dt>From</dt><dd>{e.from}</dd></div>
          <div><dt>To</dt><dd>{e.to.join(', ') || 'BCC recipients'}</dd></div>
          <div><dt>Submitted</dt><dd>{formatDate(e.created_at)}</dd></div>
          <div><dt>Source</dt><dd>{e.source.toUpperCase()}{e.test_mode ? ' · Simulation' : ''}</dd></div>
          <div><dt>Email ID</dt><dd className="summary-id"><span title={e.id}>{e.id}</span><CopyButton value={e.id} label="Copy email ID" /></dd></div>
          {e.scheduled_at && <div><dt>Scheduled for</dt><dd>{formatDate(e.scheduled_at)}</dd></div>}
        </dl>
        {e.status === 'REMOTE_ACCEPTED' && !e.test_mode && <p className="email-detail-notice">The recipient server accepted this email. This does not confirm inbox placement.</p>}
      </aside></div>
      {shared && <DetailsDialog title="Shared email link" onClose={() => setShared(null)}>
        <Stack space="space.150"><Text>Anyone with this link can view the email until {formatDate(shared.expires_at)}.</Text><a href={shared.url} target="_blank" rel="noreferrer">Open shared email</a><CopyButton value={shared.url} label="Copy share link" /><Button onClick={async () => {
          try { await api.delete(`/v1/emails/${id}/shares/${shared.id}`); setShared(null); notify.success('Share link revoked'); } catch (error) { notify.failure('Could not revoke link', error); }
        }}>Revoke link</Button></Stack>
      </DetailsDialog>}
      {rescheduling && <FormDialog<{ scheduled_at: string }> title="Reschedule email" submitLabel="Reschedule" fields={['scheduled_at']} onClose={() => setRescheduling(false)} onSubmit={async (values) => {
        await api.patch(`/v1/emails/${id}`, { scheduled_at: new Date(values.scheduled_at).toISOString() });
        await qc.invalidateQueries({ queryKey: ['emails'] });
        setRescheduling(false);
        notify.success('Email rescheduled');
      }}>
        <Field<string> name="scheduled_at" label="New sending time (your local time)" isRequired defaultValue="" helperMessage="Choose a future time within 30 days." validate={(value) => !value || !Number.isFinite(new Date(value).getTime()) ? 'Choose a valid date and time' : undefined} component={({ fieldProps }) => <Textfield {...fieldProps} type="datetime-local" />} />
      </FormDialog>}
      {confirmCancel && (
        <ConfirmDialog
          title="Cancel unsent recipients?"
          confirmLabel="Cancel recipients"
          appearance="warning"
          isLoading={cancel.isPending}
          onConfirm={() => cancel.mutate()}
          onClose={() => setConfirmCancel(false)}
        >
          <Text as="p">
            Recipients that are still queued or scheduled won’t be sent. Recipients already handed to the mail server can’t be recalled.
          </Text>
        </ConfirmDialog>
      )}
    </Page>
  );
}

function EmailContent({ email }: { email: EmailDetail }) {
  const [view, setView] = useState<'html' | 'text'>(email.content?.html ? 'html' : 'text');
  const notify = useNotify();
  const attachments = useQuery({ queryKey: ['email-attachments', email.id], queryFn: () => api.get<{ data: Array<{ id: string; filename: string; content_id: string | null; size_bytes: number }> }>(`/v1/emails/${email.id}/attachments`), enabled: !!email.content });
  if (!email.content) {
    return (
      <SectionMessage appearance="information" title="Content hidden">
        <Text as="p">Your role can see delivery details but not message content.</Text>
      </SectionMessage>
    );
  }
  return (
    <Stack space="space.150">
      {attachments.error && <ErrorBlock error={attachments.error} onRetry={() => void attachments.refetch()} />}
      {attachments.data?.data.map((attachment) => <Button key={attachment.id} onClick={async () => {
        try {
          const file = await api.get<{ content: string; content_type: string; filename: string }>(`/v1/emails/${email.id}/attachments/${attachment.id}`);
          const bytes = Uint8Array.from(atob(file.content), (character) => character.charCodeAt(0));
          saveBlob(new Blob([bytes], { type: file.content_type }), file.filename);
        } catch (error) { notify.failure('Could not download attachment', error); }
      }}>Download {attachment.filename} ({attachment.size_bytes} bytes){attachment.content_id ? ' · inline' : ''}</Button>)}
      <Inline space="space.100">
        <Button isSelected={view === 'html'} isDisabled={!email.content.html} onClick={() => setView('html')}>
          HTML
        </Button>
        <Button isSelected={view === 'text'} isDisabled={!email.content.text} onClick={() => setView('text')}>
          Plain text
        </Button>
      </Inline>
      {view === 'html' && email.content.html ? (
        // Untrusted customer HTML: a fully sandboxed iframe (no scripts, no same-origin access).
        <div className="email-content-preview"><iframe title="HTML preview" sandbox="" referrerPolicy="no-referrer" srcDoc={email.content.html} className="preview-frame" /></div>
      ) : (
        <pre className="text-preview">{email.content.text ?? '(no plain-text part)'}</pre>
      )}
    </Stack>
  );
}

