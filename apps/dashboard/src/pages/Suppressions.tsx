import DropdownMenu, { DropdownItem, DropdownItemGroup } from '../components/controls/DropdownMenu';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../components/controls/Button';
import LinkButton from '../components/controls/LinkButton';
import { EmptyState } from '../components/EmptyState';
import { Field, Label } from '@atlaskit/form';
import { Search as SearchIcon } from '../components/icons';
import { Box, Inline, Text, xcss } from '@atlaskit/primitives';
import Textfield from '../components/controls/Textfield';
import Select from '@atlaskit/select';
import TextArea from '../components/controls/Textarea';
import { ConfirmDialog, FormDialog } from '../components/dialogs';
import { useNotify } from '../components/feedback';
import { Page } from '../components/Page';
import { HelpLozenge } from '../components/status';
import { Table } from '../components/Table';
import { api, type Page as ApiPage, type Suppression } from '../lib/api';
import { relativeTime, useCan, useCursorPages } from '../lib/hooks';

const REASON: Record<Suppression['reason'], { label: string; appearance: 'removed' | 'default' | 'moved'; help: string }> = {
  hard_bounce: { label: 'Hard bounce', appearance: 'removed', help: 'The recipient’s server said this mailbox or domain does not exist.' },
  complaint: { label: 'Complaint', appearance: 'moved', help: 'The recipient reported a message as spam.' },
  manual: { label: 'Manual', appearance: 'default', help: 'Added by your team.' },
  unsubscribe: { label: 'Unsubscribed', appearance: 'default', help: 'The recipient unsubscribed.' },
};

const searchStyles = xcss({ width: '320px' });

export function SuppressionsPage() {
  const qc = useQueryClient();
  const notify = useNotify();
  const canManage = useCan('suppressions:manage');
  const pages = useCursorPages();
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [batch, setBatch] = useState<'add' | 'remove' | null>(null);
  const [reason, setReason] = useState('');
  const [removing, setRemoving] = useState<Suppression | null>(null);
  const params = new URLSearchParams({ limit: '25' });
  if (pages.cursor) params.set('cursor', pages.cursor);
  if (search) params.set('email', search);
  if (reason) params.set('reason', reason);
  const q = useQuery({ queryKey: ['suppressions', params.toString()], queryFn: () => api.get<ApiPage<Suppression>>(`/v1/suppressions?${params}`) });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/v1/suppressions/${id}`),
    onSuccess: () => {
      notify.success(`${removing?.email} removed`, 'Mail to this address will be sent again.');
      setRemoving(null);
      void qc.invalidateQueries({ queryKey: ['suppressions'] });
    },
    onError: (err) => notify.failure('Could not remove the suppression', err),
  });
  const add = canManage ? (
    <Button appearance="primary" onClick={() => setAdding(true)}>
      Add address
    </Button>
  ) : undefined;

  return (
    <Page
      title="Suppressions"
      route="/suppressions"
      description="Mail to these addresses is blocked. Hard bounces are added automatically."
      actions={<Inline space="space.100" shouldWrap>{canManage && <DropdownMenu trigger="Bulk actions"><DropdownItemGroup><DropdownItem onClick={() => setBatch('add')}>Add addresses</DropdownItem><DropdownItem onClick={() => setBatch('remove')}>Remove addresses</DropdownItem></DropdownItemGroup></DropdownMenu>}{add}</Inline>}
    >
      <Table toolbar={<div className="resource-toolbar"><form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(draft.trim().toLowerCase());
          pages.reset();
        }}
      >
        <Inline space="space.100" alignBlock="end">
          <Box xcss={searchStyles}>
            <Label htmlFor="suppression-search">Find address</Label>
            <Textfield id="suppression-search" type="search" value={draft} onChange={(e) => setDraft(e.currentTarget.value)} placeholder="name@example.com" />
          </Box>
          <Button type="submit" iconBefore={SearchIcon}>
            Search
          </Button>
          {search && (
            <Button
              appearance="subtle"
              onClick={() => {
                setDraft('');
                setSearch('');
                pages.reset();
              }}
            >
              Clear
            </Button>
          )}
        </Inline>
      </form>
      <div className="resource-control"><Label htmlFor="suppression-reason">Reason</Label><Select inputId="suppression-reason" value={{ value: reason, label: REASON[reason as keyof typeof REASON]?.label ?? 'All reasons' }} options={[{ value: '', label: 'All reasons' }, ...Object.entries(REASON).map(([value, item]) => ({ value, label: item.label }))]} onChange={option => { setReason(option?.value ?? ''); pages.reset(); }} /></div>
      </div>}
        label="Suppressed addresses"
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        columns={[
          { key: 'email', content: 'Address', isSortable: true },
          { key: 'reason', content: 'Reason', isSortable: true },
          { key: 'detail', content: 'Detail' },
          { key: 'added', content: 'Added', isSortable: true },
          { key: 'actions', content: 'Actions' },
        ]}
        rows={q.data?.data.map((s) => {
          const r = REASON[s.reason];
          return {
            key: s.id,
            cells: [
              { content: <Text weight="medium">{s.email}</Text>, sortValue: s.email },
              { content: <HelpLozenge label={r.label} appearance={r.appearance} help={r.help} />, sortValue: s.reason },
              { content: <Text size="small" color="color.text.subtle">{s.detail ?? '—'}</Text> },
              { content: relativeTime(s.created_at), sortValue: s.created_at },
              {
                content: canManage ? (
                  <Button spacing="compact" appearance="subtle" onClick={() => setRemoving(s)}>
                    Remove
                  </Button>
                ) : null,
              },
            ],
          };
        })}
        pagination={{ hasPrevious: pages.hasPrevious, hasNext: !!q.data?.next_cursor, onPrevious: pages.previous, onNext: () => pages.next(q.data?.next_cursor ?? null) }}
        emptyView={
          search ? (
            <EmptyState header="Not suppressed" description={`${search} is not on your suppression list, so mail to it is sent normally.`} />
          ) : (
            <EmptyState
              header="No suppressed addresses"
              description="Addresses that hard-bounce, or that you add yourself, appear here."
              primaryAction={add}
            />
          )
        }
      />
      {batch && <FormDialog<{ emails: string }> title={batch === 'add' ? 'Suppress multiple addresses' : 'Remove multiple suppressions'} submitLabel={batch === 'add' ? 'Suppress addresses' : 'Remove suppressions'} fields={['emails']} onClose={() => setBatch(null)} onSubmit={async (values) => {
        const emails = values.emails.trim().split(/[\s,;]+/).filter(Boolean);
        await api.post(batch === 'add' ? '/v1/suppressions/batch' : '/v1/suppressions/batch/remove', { emails });
        await qc.invalidateQueries({ queryKey: ['suppressions'] }); setBatch(null); notify.success('Suppression list updated');
      }}><Field<string, HTMLTextAreaElement> name="emails" label="Email addresses" isRequired defaultValue="" helperMessage={batch === 'add' ? 'Up to 100 addresses, separated by commas or new lines. Future mail to them is skipped.' : 'Up to 100 addresses. Removing suppressions allows mail to these addresses again.'} validate={(value) => !value?.trim() || value.trim().split(/[\s,;]+/).length > 100 ? 'Enter 1–100 email addresses' : undefined} component={({ fieldProps }) => <TextArea {...fieldProps} minimumRows={5} />} /></FormDialog>}
      {adding && (
        <FormDialog<{ email: string }>
          title="Suppress an address"
          submitLabel="Suppress"
          fields={['email']}
          width="small"
          onClose={() => setAdding(false)}
          onSubmit={async (v) => {
            await api.post('/v1/suppressions', { email: v.email.trim() });
            await qc.invalidateQueries({ queryKey: ['suppressions'] });
            notify.success(`${v.email.trim()} suppressed`);
            setAdding(false);
          }}
        >
          <Field<string>
            name="email"
            label="Email address"
            isRequired
            defaultValue=""
            helperMessage="We’ll skip this address in every future email from your organization."
            validate={(v) => (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? 'Enter a valid email address' : undefined)}
            component={({ fieldProps }) => <Textfield {...fieldProps} type="email" autoFocus />}
          />
        </FormDialog>
      )}
      {removing && (
        <ConfirmDialog
          title="Remove this suppression?"
          confirmLabel="Remove"
          appearance={removing.reason === 'hard_bounce' ? 'warning' : 'danger'}
          isLoading={remove.isPending}
          onConfirm={() => remove.mutate(removing.id)}
          onClose={() => setRemoving(null)}
        >
          <Text as="p">
            Mail to {removing.email} will be sent again.
            {removing.reason === 'hard_bounce' && ' This address bounced before. Sending to it again hurts your reputation unless the mailbox has been fixed.'}
          </Text>
        </ConfirmDialog>
      )}
    </Page>
  );
}
