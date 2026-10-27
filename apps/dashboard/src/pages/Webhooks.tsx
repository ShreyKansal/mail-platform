import { RowActions } from '../components/RowActions';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../components/controls/Button';
import LinkButton from '../components/controls/LinkButton';
import { Checkbox } from '@atlaskit/checkbox';
import { EmptyState } from '../components/EmptyState';
import { CheckboxField, Field, Fieldset } from '@atlaskit/form';
import Lozenge from '../components/controls/Lozenge';
import { Inline, Stack, Text } from '@atlaskit/primitives';
import SectionMessage from '@atlaskit/section-message';
import Textfield from '../components/controls/Textfield';
import { EVENT_TYPES } from '@mp/contracts';
import { ConfirmDialog, DetailsDialog, FormDialog, SecretDialog } from '../components/dialogs';
import { ErrorBlock, LoadingBlock, useNotify } from '../components/feedback';
import { Page } from '../components/Page';
import { HelpLozenge } from '../components/status';
import { Table } from '../components/Table';
import { api, type Page as ApiPage, type Webhook, type WebhookDelivery } from '../lib/api';
import { formatDate, relativeTime, useCan, useCursorPages } from '../lib/hooks';

const EVENT_HELP: Record<(typeof EVENT_TYPES)[number], string> = {
  'email.accepted': 'The email was accepted for processing and queued for delivery.',
  'email.rescheduled': 'The scheduled send time changed.',
  'webhook.test': 'A signed test event was requested.',
  'email.scheduled': 'The email is scheduled for later.',
  'email.suppressed': 'A recipient was skipped because it is suppressed.',
  'email.mta_accepted': 'Handed to our mail server.',
  'email.deferred': 'The recipient’s server asked us to retry later.',
  'email.remote_accepted': 'The recipient’s server accepted the message.',
  'email.bounced': 'The recipient’s server permanently refused it.',
  'email.failed': 'Delivery failed (for example, retries expired).',
  'email.cancelled': 'A recipient was cancelled before sending.',
  'email.delivery_unknown': 'Hand-off outcome is being reconciled.',
  'domain.verified': 'A domain became verified.',
  'domain.verification_lost': 'A verified domain lost its DNS records.',
};

const DEFAULT_EVENTS = ['email.remote_accepted', 'email.bounced', 'email.failed'];

interface HookValues {
  url: string;
  description: string;
  event_types: string[];
}

function CreateWebhookDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (w: Webhook & { secret: string }) => void }) {
  const qc = useQueryClient();
  return (
    <FormDialog<HookValues>
      title="Add webhook endpoint"
      submitLabel="Add endpoint"
      fields={['url', 'description', 'event_types']}
      width="large"
      onClose={onClose}
      onSubmit={async (v) => {
        const w = await api.post<Webhook & { secret: string }>('/v1/webhooks', {
          url: v.url.trim(),
          event_types: v.event_types,
          ...(v.description?.trim() ? { description: v.description.trim() } : {}),
        });
        await qc.invalidateQueries({ queryKey: ['webhooks'] });
        onCreated(w);
      }}
    >
      <Field<string>
        name="url"
        label="Endpoint URL"
        isRequired
        defaultValue=""
        helperMessage="A public https:// URL that accepts POST requests with a JSON body."
        validate={(v) => {
          try {
            new URL(v ?? '');
            return undefined;
          } catch {
            return 'Enter a full URL, such as https://example.com/webhooks/mail';
          }
        }}
        component={({ fieldProps }) => <Textfield {...fieldProps} placeholder="https://example.com/webhooks/mail" autoFocus />}
      />
      <Field<string> name="description" label="Description" defaultValue="" component={({ fieldProps }) => <Textfield {...fieldProps} />} />
      <Fieldset legend="Events to send">
        {EVENT_TYPES.map((t) => (
          <CheckboxField key={t} name="event_types" value={t} defaultIsChecked={DEFAULT_EVENTS.includes(t)}>
            {({ fieldProps }) => <Checkbox {...fieldProps} label={`${t} — ${EVENT_HELP[t] ?? ''}`} />}
          </CheckboxField>
        ))}
      </Fieldset>
    </FormDialog>
  );
}

export function WebhooksPage() {
  const canManage = useCan('webhooks:manage');
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<(Webhook & { secret: string }) | null>(null);
  const q = useQuery({ queryKey: ['webhooks'], queryFn: () => api.get<{ data: Webhook[] }>('/v1/webhooks') });
  const add = canManage ? (
    <Button appearance="primary" onClick={() => setCreating(true)}>
      Add endpoint
    </Button>
  ) : undefined;
  return (
    <Page
      title="Webhooks"
      route="/webhooks"
      description="Send delivery events to your applications."
      actions={add}
    >
      <Table
        label="Webhook endpoints" searchable
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        columns={[
          { key: 'url', content: 'Endpoint', isSortable: true },
          { key: 'events', content: 'Events' },
          { key: 'status', content: 'Status', isSortable: true },
          { key: 'created', content: 'Created', isSortable: true },
        ]}
        rows={q.data?.data.map((w) => ({
          key: w.id,
          cells: [
            {
              content: (
                <Stack space="space.025">
                  <Link to={`/webhooks/${w.id}`}>
                    <span className="break-all">{w.url}</span>
                  </Link>
                  {w.description && (
                    <Text size="small" color="color.text.subtle">
                      {w.description}
                    </Text>
                  )}
                </Stack>
              ),
              sortValue: w.url,
            },
            { content: `${w.event_types.length} event type${w.event_types.length === 1 ? '' : 's'}` },
            { content: w.enabled ? <Lozenge appearance="success">Enabled</Lozenge> : <Lozenge>Disabled</Lozenge>, sortValue: w.enabled ? 0 : 1 },
            { content: relativeTime(w.created_at), sortValue: w.created_at },
          ],
        }))}
        emptyView={
          <EmptyState
            header="No webhook endpoints"
            description="Add an endpoint to be notified when mail is accepted, bounces or fails."
            primaryAction={add}
          />
        }
      />
      {creating && (
        <CreateWebhookDialog
          onClose={() => setCreating(false)}
          onCreated={(w) => {
            setCreating(false);
            setCreated(w);
          }}
        />
      )}
      {created && (
        <SecretDialog
          title="Webhook endpoint added"
          secrets={[{ label: 'Signing secret', value: created.secret }]}
          onClose={() => {
            const id = created.id;
            setCreated(null);
            navigate(`/webhooks/${id}`);
          }}
        >
          <Text as="p">
            Use this secret to verify the <Text weight="semibold">webhook-signature</Text> header on every request.{' '}
            <Link to="/guides/webhook-verification">See verification examples</Link>.
          </Text>
        </SecretDialog>
      )}
    </Page>
  );
}

const DELIVERY_STATUS: Record<WebhookDelivery['status'], { label: string; appearance: 'default' | 'inprogress' | 'moved' | 'removed' | 'success'; help: string }> = {
  pending: { label: 'Pending', appearance: 'inprogress', help: 'Waiting to be sent.' },
  delivering: { label: 'Sending', appearance: 'inprogress', help: 'Being sent now.' },
  retrying: { label: 'Retrying', appearance: 'moved', help: 'The last attempt failed. It will be retried at the time shown.' },
  succeeded: { label: 'Delivered', appearance: 'success', help: 'Your endpoint responded with a 2xx status.' },
  dead: { label: 'Gave up', appearance: 'removed', help: 'All retries failed (about 24 hours), or the endpoint was disabled.' },
};

export function WebhookDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const notify = useNotify();
  const canManage = useCan('webhooks:manage');
  const test = useMutation({ mutationFn: () => api.post(`/v1/webhooks/${id}/test`), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['webhook-deliveries'] }); notify.success('Test event queued'); }, onError: (error) => notify.failure('Could not send test event', error) });
  const pages = useCursorPages();
  const [rotated, setRotated] = useState<string | null>(null);
  const [attemptDelivery, setAttemptDelivery] = useState<string | null>(null);
  const attempts = useQuery({ queryKey: ['webhook-attempts', id, attemptDelivery], queryFn: () => api.get<ApiPage<{ id: string; attempt: number; status_code: number | null; error: string | null; duration_ms: number; created_at: string }>>(`/v1/webhooks/${id}/deliveries/${attemptDelivery}/attempts?limit=100`), enabled: !!attemptDelivery });
  const replay = useMutation({
    mutationFn: (deliveryId: string) => api.post(`/v1/webhooks/${id}/deliveries/${deliveryId}/replay`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['webhook-deliveries'] }); void qc.invalidateQueries({ queryKey: ['webhook-attempts'] }); notify.success('Webhook queued for replay'); },
    onError: (error) => notify.failure('Could not replay webhook', error),
  });
  const [confirm, setConfirm] = useState<'rotate' | 'delete' | null>(null);
  const hooks = useQuery({ queryKey: ['webhooks'], queryFn: () => api.get<{ data: Webhook[] }>('/v1/webhooks') });
  const hook = hooks.data?.data.find((w) => w.id === id);
  const params = new URLSearchParams({ limit: '25', ...(pages.cursor ? { cursor: pages.cursor } : {}) });
  const deliveries = useQuery({
    queryKey: ['webhook-deliveries', id, params.toString()],
    queryFn: () => api.get<ApiPage<WebhookDelivery>>(`/v1/webhooks/${id}/deliveries?${params}`),
    refetchInterval: 10_000,
    enabled: !!hook,
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => api.patch<Webhook>(`/v1/webhooks/${id}`, { enabled }),
    onSuccess: (w) => {
      void qc.invalidateQueries({ queryKey: ['webhooks'] });
      notify.success(w.enabled ? 'Endpoint enabled' : 'Endpoint disabled', w.enabled ? undefined : 'No events are sent until you enable it again.');
    },
    onError: (err) => notify.failure('Could not update the endpoint', err),
  });
  const rotate = useMutation({
    mutationFn: () => api.post<{ secret: string }>(`/v1/webhooks/${id}/rotate-secret`),
    onSuccess: (r) => {
      setConfirm(null);
      setRotated(r.secret);
    },
    onError: (err) => notify.failure('Could not rotate the secret', err),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/v1/webhooks/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['webhooks'] });
      notify.success('Endpoint deleted');
      navigate('/webhooks');
    },
    onError: (err) => notify.failure('Could not delete the endpoint', err),
  });

  if (hooks.isLoading) return <LoadingBlock />;
  if (hooks.error) return <ErrorBlock error={hooks.error} onRetry={() => void hooks.refetch()} />;
  if (!hook) {
    return (
      <EmptyState
        header="Webhook endpoint not found"
        description="It may have been deleted."
        primaryAction={<LinkButton href="/webhooks">Back to webhooks</LinkButton>}
      />
    );
  }

  return (
    <Page
      title="Webhook endpoint"
      route="/webhooks/:id"
      crumbs={[{ text: 'Webhooks', href: '/webhooks' }, { text: 'Endpoint' }]}
      description={
        <Inline space="space.100" alignBlock="center" shouldWrap>
          {hook.enabled ? <Lozenge appearance="success">Enabled</Lozenge> : <Lozenge>Disabled</Lozenge>}
          <span className="break-all">{hook.url}</span>
        </Inline>
      }
      actions={
        canManage ? (
          <>
            <Button isLoading={toggle.isPending} onClick={() => toggle.mutate(!hook.enabled)}>
              {hook.enabled ? 'Disable' : 'Enable'}
            </Button>
            <RowActions label="Endpoint actions" actions={[{label: 'Rotate secret', onClick: () => setConfirm('rotate')}, {label: 'Delete endpoint', onClick: () => setConfirm('delete')}]} />
          </>
        ) : undefined
      }
    >
      <dl className="definition-list">
        <dt>Consecutive failures</dt><dd>{hook.consecutive_failures}</dd>
        <dt>Last success</dt><dd>{hook.last_success_at ? formatDate(hook.last_success_at) : 'No success recorded'}</dd>
        <dt>Last failure</dt><dd>{hook.last_failure_at ? formatDate(hook.last_failure_at) : 'No failure recorded'}</dd>
        <dt>Events</dt>
        <dd>{hook.event_types.join(', ')}</dd>
        {hook.description && (
          <>
            <dt>Description</dt>
            <dd>{hook.description}</dd>
          </>
        )}
        <dt>Created</dt>
        <dd>{formatDate(hook.created_at)}</dd>
      </dl>
      {canManage && <Button isDisabled={!hook.enabled} isLoading={test.isPending} onClick={() => test.mutate()}>Send signed test event</Button>}
      {!hook.enabled && (
        <SectionMessage appearance="warning" title="This endpoint is disabled">
          <Text as="p">{hook.disabled_reason ?? 'No events are being sent to it.'}</Text>
        </SectionMessage>
      )}
      <Table
        label="Deliveries"
        caption="Deliveries"
        isLoading={deliveries.isLoading}
        error={deliveries.error}
        onRetry={() => void deliveries.refetch()}
        columns={[
          { key: 'event', content: 'Event', isSortable: true },
          { key: 'status', content: 'Status', isSortable: true },
          { key: 'attempts', content: 'Attempts', isSortable: true },
          { key: 'result', content: 'Last result' },
          { key: 'next', content: 'Next attempt' },
          { key: 'created', content: 'Created', isSortable: true },
          { key: 'actions', content: 'Actions' },
        ]}
        rows={deliveries.data?.data.map((d) => {
          const st = DELIVERY_STATUS[d.status];
          return {
            key: d.id,
            cells: [
              { content: <Text>{d.event_type}</Text>, sortValue: d.event_type },
              { content: <HelpLozenge label={st.label} appearance={st.appearance} help={st.help} />, sortValue: d.status },
              { content: d.attempts, sortValue: d.attempts },
              { content: d.last_error ?? (d.last_status_code ? `HTTP ${d.last_status_code}` : '—') },
              { content: d.status === 'retrying' ? formatDate(d.next_attempt_at) : '—' },
              { content: relativeTime(d.created_at), sortValue: d.created_at },
              { content: <Inline space="space.100" shouldWrap><Button spacing="compact" onClick={() => setAttemptDelivery(d.id)}>Attempts</Button>{canManage && hook.enabled && ['succeeded', 'dead'].includes(d.status) && <Button spacing="compact" isLoading={replay.isPending && replay.variables === d.id} onClick={() => replay.mutate(d.id)}>Replay</Button>}</Inline> },
            ],
          };
        })}
        pagination={{ hasPrevious: pages.hasPrevious, hasNext: !!deliveries.data?.next_cursor, onPrevious: pages.previous, onNext: () => pages.next(deliveries.data?.next_cursor ?? null) }}
        emptyView={<EmptyState header="No deliveries yet" description="Events appear here as they are sent to this endpoint." />}
      />
      {attemptDelivery && <DetailsDialog title="Delivery attempts" onClose={() => setAttemptDelivery(null)}>
        {attempts.isLoading ? <LoadingBlock /> : attempts.error ? <ErrorBlock error={attempts.error} onRetry={() => void attempts.refetch()} /> : <Stack space="space.100">{attempts.data?.data.length ? attempts.data.data.map((attempt) => <Text as="p" key={attempt.id}>Attempt {attempt.attempt}: {attempt.status_code ? `HTTP ${attempt.status_code}` : 'Transport error'} · {attempt.duration_ms} ms · {formatDate(attempt.created_at)}{attempt.error ? ` · ${attempt.error}` : ''}</Text>) : <Text>No attempts recorded.</Text>}{attempts.data?.next_cursor && <Text>Showing the latest 100 attempts. Use the attempts API for older history.</Text>}</Stack>}
      </DetailsDialog>}
      {confirm === 'rotate' && (
        <ConfirmDialog
          title="Rotate the signing secret?"
          confirmLabel="Rotate secret"
          appearance="warning"
          isLoading={rotate.isPending}
          onConfirm={() => rotate.mutate()}
          onClose={() => setConfirm(null)}
        >
          <Text as="p">
            You’ll get a new secret. For the next 24 hours every request is signed with both the new and the old secret, so you can update your receiver
            without missing events.
          </Text>
        </ConfirmDialog>
      )}
      {confirm === 'delete' && (
        <ConfirmDialog title="Delete this endpoint?" confirmLabel="Delete endpoint" isLoading={remove.isPending} onConfirm={() => remove.mutate()} onClose={() => setConfirm(null)}>
          <Text as="p">No more events will be sent to it, and its delivery history is removed. This can’t be undone.</Text>
        </ConfirmDialog>
      )}
      {rotated && <SecretDialog title="New signing secret" secrets={[{ label: 'Signing secret', value: rotated }]} onClose={() => setRotated(null)} />}
    </Page>
  );
}
