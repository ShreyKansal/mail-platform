import { RowActions } from '../components/RowActions';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../components/controls/Button';
import LinkButton from '../components/controls/LinkButton';
import { CodeBlock } from '@atlaskit/code';
import { EmptyState } from '../components/EmptyState';
import { Field } from '@atlaskit/form';
import Lozenge from '../components/controls/Lozenge';
import { Stack, Text } from '@atlaskit/primitives';
import Select from '@atlaskit/select';
import Textfield from '../components/controls/Textfield';
import { ConfirmDialog, FormDialog, SecretDialog } from '../components/dialogs';
import { useNotify } from '../components/feedback';
import { Page } from '../components/Page';
import { Table } from '../components/Table';
import { api, type ApiKey, type Domain } from '../lib/api';
import { formatDate, relativeTime, useCan } from '../lib/hooks';

type Option = { label: string; value: string };

const SCOPES: Array<Option & { description: string }> = [
  { value: 'sending_access', label: 'Sending access', description: 'Can only send email. Best for application servers.' },
  { value: 'full_access', label: 'Full access', description: 'Send, read logs, manage domains, webhooks and suppressions.' },
];

interface KeyValues {
  name: string;
  scope: Option | null;
  domain: Option | null;
}

function CreateKeyDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (key: ApiKey & { token: string }) => void }) {
  const qc = useQueryClient();
  const domains = useQuery({ queryKey: ['domains'], queryFn: () => api.get<{ data: Domain[] }>('/v1/domains') });
  const domainOptions: Option[] = [{ label: 'All domains in this project', value: '' }, ...(domains.data?.data ?? []).map((d) => ({ label: d.name, value: d.id }))];
  return (
    <FormDialog<KeyValues>
      title="Create API key"
      submitLabel="Create key"
      fields={['name', 'scope', 'domain']}
      onClose={onClose}
      onSubmit={async (v) => {
        const key = await api.post<ApiKey & { token: string }>('/v1/api-keys', {
          name: v.name.trim(),
          scope: v.scope?.value ?? 'sending_access',
          ...(v.domain?.value ? { domain_id: v.domain.value } : {}),
        });
        await qc.invalidateQueries({ queryKey: ['api-keys'] });
        onCreated(key);
      }}
    >
      <Field<string>
        name="name"
        label="Name"
        isRequired
        defaultValue=""
        helperMessage="Name it after the system that will use it, such as “production-backend”."
        validate={(v) => (!v?.trim() ? 'Enter a name' : undefined)}
        component={({ fieldProps }) => <Textfield {...fieldProps} autoFocus />}
      />
      <Field<Option | null> name="scope" label="Permission" defaultValue={SCOPES[0]!} helperMessage="Keys can never create other keys or manage your team.">
        {({ fieldProps: { id, ...rest } }) => (
          <Select<Option> inputId={id} {...rest} options={SCOPES} formatOptionLabel={(o) => {
            const s = SCOPES.find((x) => x.value === o.value);
            return (
              <Stack space="space.0">
                <Text>{o.label}</Text>
                {s && <Text size="small" color="color.text.subtle">{s.description}</Text>}
              </Stack>
            );
          }} />
        )}
      </Field>
      <Field<Option | null> name="domain" label="Restrict to domain" defaultValue={domainOptions[0]!} helperMessage="Optional. A restricted key can only send from that domain.">
        {({ fieldProps: { id, ...rest } }) => <Select<Option> inputId={id} {...rest} options={domainOptions} isLoading={domains.isLoading} />}
      </Field>
    </FormDialog>
  );
}

export function ApiKeysPage() {
  const qc = useQueryClient();
  const notify = useNotify();
  const canManage = useCan('api_keys:manage');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<(ApiKey & { token: string }) | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [renaming, setRenaming] = useState<ApiKey | null>(null);
  const q = useQuery({ queryKey: ['api-keys'], queryFn: () => api.get<{ data: ApiKey[] }>('/v1/api-keys') });
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/v1/api-keys/${id}`),
    onSuccess: () => {
      notify.success(`API key “${revoking?.name}” revoked`, 'Requests using it are rejected from now on.');
      setRevoking(null);
      void qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (err) => notify.failure('Could not revoke the key', err),
  });
  const create = canManage ? (
    <Button appearance="primary" onClick={() => setCreating(true)}>
      Create API key
    </Button>
  ) : undefined;

  return (
    <Page title="API keys" route="/api-keys" actions={create}>
      <Table
        label="API keys" searchable
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        columns={[
          { key: 'name', content: 'Name', isSortable: true },
          { key: 'key', content: 'Key' },
          { key: 'scope', content: 'Permission' },
          { key: 'status', content: 'Status', isSortable: true },
          { key: 'used', content: 'Last used', isSortable: true },
          { key: 'created', content: 'Created', isSortable: true },
          { key: 'actions', content: 'Actions', width: 8, align: 'end' },
        ]}
        rows={q.data?.data.map((k) => ({
          key: k.id,
          cells: [
            { content: <span className="table-cell-text" title={k.name}>{k.name}</span>, sortValue: k.name },
            { content: <Text>{k.prefix}…</Text> },
            { content: k.scopes.map((s) => SCOPES.find((x) => x.value === s)?.label ?? s).join(', ') },
            { content: k.revoked_at ? <Lozenge appearance="removed">Revoked</Lozenge> : <Lozenge appearance="success">Active</Lozenge>, sortValue: k.revoked_at ? 1 : 0 },
            { content: relativeTime(k.last_used_at), sortValue: k.last_used_at ?? '' },
            { content: <span title={formatDate(k.created_at)}>{relativeTime(k.created_at)}</span>, sortValue: k.created_at },
            {
              content:
                canManage && !k.revoked_at ? (
                  <RowActions label={`Actions for ${k.name}`} actions={[{ label: 'Rename key', onClick: () => setRenaming(k) }, { label: 'Revoke key', onClick: () => setRevoking(k) }]} />
                ) : null,
            },
          ],
        }))}
        emptyView={
          <EmptyState
            header="No API keys yet"
            description="Create a key so your application can send email."
            primaryAction={create}
          />
        }
      />
      {creating && (
        <CreateKeyDialog
          onClose={() => setCreating(false)}
          onCreated={(k) => {
            setCreating(false);
            setCreated(k);
          }}
        />
      )}
      {created && (
        <SecretDialog title={`API key “${created.name}” created`} secrets={[{ label: 'API key', value: created.token }]} onClose={() => setCreated(null)}>
          <Stack space="space.050">
            <Text weight="semibold">Try it</Text>
            <CodeBlock
              language="bash"
              showLineNumbers={false}
              shouldWrapLongLines
              text={`curl -X POST ${window.location.origin}/v1/emails \\
  -H "Authorization: Bearer ${created.token}" \\
  -H "Content-Type: application/json" \\
  -d '{"from":"noreply@yourdomain.com","to":"you@example.com","subject":"Hello","text":"Hi"}'`}
            />
          </Stack>
        </SecretDialog>
      )}
      {renaming && <FormDialog<{ name: string }> title="Rename API key" submitLabel="Save" fields={['name']} onClose={() => setRenaming(null)} onSubmit={async (values) => {
        await api.patch(`/v1/api-keys/${renaming.id}`, { name: values.name.trim() });
        await qc.invalidateQueries({ queryKey: ['api-keys'] }); setRenaming(null); notify.success('API key renamed');
      }}><Field<string> name="name" label="Name" isRequired defaultValue={renaming.name} validate={(value) => !value?.trim() || value.trim().length > 100 ? 'Use 1–100 characters' : undefined} component={({ fieldProps }) => <Textfield {...fieldProps} />} /></FormDialog>}
      {revoking && (
        <ConfirmDialog
          title={`Revoke “${revoking.name}”?`}
          confirmLabel="Revoke key"
          isLoading={revoke.isPending}
          onConfirm={() => revoke.mutate(revoking.id)}
          onClose={() => setRevoking(null)}
        >
          <Text as="p">Requests using this key will be rejected immediately. This can’t be undone.</Text>
        </ConfirmDialog>
      )}
    </Page>
  );
}
