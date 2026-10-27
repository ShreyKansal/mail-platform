import { RowActions } from '../components/RowActions';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../components/controls/Button';
import { EmptyState } from '../components/EmptyState';
import { Field } from '@atlaskit/form';
import Heading from '@atlaskit/heading';
import Lozenge from '../components/controls/Lozenge';
import { Text } from '@atlaskit/primitives';
import Textfield from '../components/controls/Textfield';
import { ConfirmDialog, FormDialog, SecretDialog } from '../components/dialogs';
import { useNotify } from '../components/feedback';
import { Page } from '../components/Page';
import { Table } from '../components/Table';
import { api, type SmtpCredential } from '../lib/api';
import { relativeTime, useCan } from '../lib/hooks';

function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (c: SmtpCredential & { password: string }) => void }) {
  const qc = useQueryClient();
  return (
    <FormDialog<{ name: string; allowed_cidrs: string }>
      title="Create SMTP credentials"
      submitLabel="Create credentials"
      fields={['name', 'allowed_cidrs']}
      onClose={onClose}
      onSubmit={async (v) => {
        const cidrs = (v.allowed_cidrs ?? '').split(/[\s,]+/).filter(Boolean);
        const c = await api.post<SmtpCredential & { password: string }>('/v1/smtp-credentials', { name: v.name.trim(), ...(cidrs.length ? { allowed_cidrs: cidrs } : {}) });
        await qc.invalidateQueries({ queryKey: ['smtp'] });
        onCreated(c);
      }}
    >
      <Field<string>
        name="name"
        label="Name"
        isRequired
        defaultValue=""
        helperMessage="For example, the app or server that will connect."
        validate={(v) => (!v?.trim() ? 'Enter a name' : undefined)}
        component={({ fieldProps }) => <Textfield {...fieldProps} autoFocus />}
      />
      <Field<string>
        name="allowed_cidrs"
        label="Allowed client networks"
        defaultValue=""
        helperMessage="Optional. IP addresses or CIDR ranges, separated by commas. Leave empty to allow any network."
        component={({ fieldProps }) => <Textfield {...fieldProps} placeholder="203.0.113.0/24, 198.51.100.7" />}
      />
    </FormDialog>
  );
}

export function SmtpPage({ embedded = false }: { embedded?: boolean }) {
  const qc = useQueryClient();
  const notify = useNotify();
  const canManage = useCan('smtp_credentials:manage');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<(SmtpCredential & { password: string }) | null>(null);
  const [revoking, setRevoking] = useState<SmtpCredential | null>(null);
  const q = useQuery({ queryKey: ['smtp'], queryFn: () => api.get<{ data: SmtpCredential[] }>('/v1/smtp-credentials') });
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/v1/smtp-credentials/${id}`),
    onSuccess: () => {
      notify.success(`Credentials “${revoking?.name}” revoked`);
      setRevoking(null);
      void qc.invalidateQueries({ queryKey: ['smtp'] });
    },
    onError: (err) => notify.failure('Could not revoke credentials', err),
  });
  const create = canManage ? (
    <Button appearance="primary" onClick={() => setCreating(true)}>
      Create credentials
    </Button>
  ) : undefined;

  const content = (
    <>
      <section className="settings-card smtp-connection" aria-labelledby="smtp-connection-title">
        <header className="settings-card-header">
          <Heading size="small" as="h2" id="smtp-connection-title">
            Connection settings
          </Heading>
        </header>
        <div className="settings-card-body">
          <dl className="definition-list">
            <dt>Server</dt>
            <dd>{import.meta.env.DEV ? 'localhost' : 'The SMTP host name of your deployment (ask your administrator)'}</dd>
            <dt>Port</dt>
            <dd>{import.meta.env.DEV ? '2587 with STARTTLS, or 2465 with TLS' : '587 with STARTTLS, or 465 with TLS'}</dd>
            <dt>Authentication</dt>
            <dd>PLAIN or LOGIN, using a username and password from this page</dd>
            <dt>From address</dt>
            <dd>Must be at one of your verified domains</dd>
          </dl>
        </div>
      </section>
      <Table
        label="SMTP credentials" searchable
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        columns={[
          { key: 'name', content: 'Name', isSortable: true },
          { key: 'username', content: 'Username' },
          { key: 'networks', content: 'Allowed networks' },
          { key: 'status', content: 'Status' },
          { key: 'used', content: 'Last used', isSortable: true },
          { key: 'actions', content: 'Actions' },
        ]}
        rows={q.data?.data.map((c) => ({
          key: c.id,
          cells: [
            { content: <span className="table-cell-text" title={c.name}>{c.name}</span>, sortValue: c.name },
            { content: <Text>{c.username}</Text> },
            { content: c.allowed_cidrs?.length ? c.allowed_cidrs.join(', ') : 'Any network' },
            { content: c.revoked_at ? <Lozenge appearance="removed">Revoked</Lozenge> : <Lozenge appearance="success">Active</Lozenge> },
            { content: relativeTime(c.last_used_at), sortValue: c.last_used_at ?? '' },
            {
              content:
                canManage && !c.revoked_at ? (
                  <RowActions label={`Actions for ${c.name}`} actions={[{ label: 'Revoke credentials', onClick: () => setRevoking(c) }]} />
                ) : null,
            },
          ],
        }))}
        emptyView={
          <EmptyState
            header="No SMTP credentials"
            description="Create credentials for applications that send over SMTP instead of the API."
            primaryAction={create}
          />
        }
      />
      {creating && (
        <CreateDialog
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setCreating(false);
            setCreated(c);
          }}
        />
      )}
      {created && (
        <SecretDialog
          title="SMTP credentials created"
          secrets={[
            { label: 'Username', value: created.username },
            { label: 'Password', value: created.password },
          ]}
          onClose={() => setCreated(null)}
        />
      )}
      {revoking && (
        <ConfirmDialog
          title={`Revoke “${revoking.name}”?`}
          confirmLabel="Revoke credentials"
          isLoading={revoke.isPending}
          onConfirm={() => revoke.mutate(revoking.id)}
          onClose={() => setRevoking(null)}
        >
          <Text as="p">Clients using these credentials can no longer sign in. This can’t be undone.</Text>
        </ConfirmDialog>
      )}
    </>
  );
  return embedded ? <div className="settings-panel"><header className="settings-section-heading"><div><Heading size="small" as="h2">SMTP</Heading><Text as="p" color="color.text.subtle">Send emails using authenticated SMTP instead of the REST API.</Text></div>{create}</header>{content}</div> : <Page title="SMTP credentials" route="/smtp" actions={create}>{content}</Page>;
}
