import Lozenge from '../components/controls/Lozenge';
import { EmptyResource } from '../components/EmptyResource';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../components/controls/Button';
import { Field } from '@atlaskit/form';
import Textfield from '../components/controls/Textfield';
import TextArea from '../components/controls/Textarea';
import Checkbox from '@atlaskit/checkbox';
import { Label } from '@atlaskit/form';
import { Text } from '@atlaskit/primitives';
import { Page } from '../components/Page';
import { Table } from '../components/Table';
import { FormDialog } from '../components/dialogs';
import { useNotify } from '../components/feedback';
import { api, type Page as ApiPage } from '../lib/api';
import { useCan, useCursorPages } from '../lib/hooks';
interface Contact {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    unsubscribed: boolean;
    properties: Record<string, unknown>;
    revision: number;
    archived_at: string | null;
}
interface ContactValues {
    email: string;
    first_name: string;
    last_name: string;
    properties: string;
}
export function AudiencePage() {
    const pages = useCursorPages(), qc = useQueryClient(), notify = useNotify(), manage = useCan('contacts:manage');
    const [searchParams, setSearchParams] = useSearchParams();
    const search = searchParams.get('search') ?? '';
    const setSearch = (value: string) => setSearchParams(previous => { const next = new URLSearchParams(previous); if (value) next.set('search', value); else next.delete('search'); next.delete('cursor'); return next; }, { replace: true });
    const [archived, setArchived] = useState(false), [editing, setEditing] = useState<Contact | 'new' | null>(null), [importing, setImporting] = useState(false), [busy, setBusy] = useState(false);
    const params = new URLSearchParams({ limit: '25', search, archived: String(archived), ...(pages.cursor ? { cursor: pages.cursor } : {}) });
    const q = useQuery({ queryKey: ['contacts', params.toString()], queryFn: () => api.get<ApiPage<Contact>>(`/v1/contacts?${params}`) });
    const refresh = () => qc.invalidateQueries({ queryKey: ['contacts'] });
    return <Page title="Contacts" route="/audience" actions={manage && <><Button onClick={() => setImporting(true)}>Import contacts</Button>{' '}<Button appearance="primary" onClick={() => setEditing('new')}>Add contact</Button></>}>
    <Table toolbar={<div className="resource-toolbar"><div className="resource-search"><Label htmlFor="contact-search">Search contacts</Label><Textfield id="contact-search" placeholder="Search by email or name…" value={search} onChange={e => { setSearch(e.currentTarget.value); pages.reset(); }}/></div><Checkbox label="Include archived" isChecked={archived} onChange={e => { setArchived(e.target.checked); pages.reset(); }} /></div>} label="Contacts" isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} columns={[{ key: 'email', content: 'Email' }, { key: 'name', content: 'Name' }, { key: 'status', content: 'Subscription' }, { key: 'actions', content: 'Actions' }]} rows={q.data?.data.map(c => ({ key: c.id, cells: [{ content: c.email }, { content: `${c.first_name} ${c.last_name}`.trim() || '?' }, { content: <Lozenge appearance={c.archived_at ? 'default' : c.unsubscribed ? 'removed' : 'success'}>{c.archived_at ? 'Archived' : c.unsubscribed ? 'Unsubscribed' : 'Subscribed'}</Lozenge> }, { content: <>{manage && <><Button spacing="compact" appearance="subtle" isDisabled={!!c.archived_at} onClick={() => setEditing(c)}>Edit</Button>{' '}<Button spacing="compact" appearance="subtle" isDisabled={busy} onClick={async () => { setBusy(true); try {
                    await api.post(`/v1/contacts/${c.id}/${c.archived_at ? 'restore' : 'archive'}`);
                    await refresh();
                }
                catch (e) {
                    notify.failure('Contact action failed', e);
                }
                finally {
                    setBusy(false);
                } }}>{c.archived_at ? 'Restore' : 'Archive'}</Button></>}</> }] }))} pagination={{ hasPrevious: pages.hasPrevious, hasNext: !!q.data?.next_cursor, onPrevious: pages.previous, onNext: () => pages.next(q.data?.next_cursor ?? null) }} emptyView={<EmptyResource title={search || archived ? "No matching contacts" : "No contacts yet"} description={search || archived ? "Try a different search or exclude archived contacts." : "Add a contact or import contacts."} action={manage && !search && !archived ? <Button appearance="primary" onClick={() => setEditing('new')}>Add contact</Button> : undefined} />}/>
    {editing && <ContactEditor contact={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await refresh(); }}/>}
    {importing && <FormDialog<{
        json: string;
    }> title="Import contacts" submitLabel="Import contacts" fields={['json']} onClose={() => setImporting(false)} onSubmit={async (v) => { const result = await api.post<{
        created: number;
        updated: number;
        skipped_archived: number;
    }>('/v1/contacts/import', { contacts: JSON.parse(v.json) }); await refresh(); setImporting(false); notify.success('Import complete', `${result.created} created, ${result.updated} updated, ${result.skipped_archived} archived contacts skipped.`); }}><Text>Paste a JSON array with up to 500 contacts. Each row requires email and may include first_name, last_name, unsubscribed and properties. Duplicate emails in the same import are rejected. All rows validate before any are saved.</Text><Field<string, HTMLTextAreaElement> name="json" label="Contact JSON" defaultValue={'[\n  {"email":"reader@example.org","first_name":"Sam","properties":{"plan":"pro"}}\n]'} isRequired component={({ fieldProps }) => <TextArea {...fieldProps} minimumRows={10}/>}/></FormDialog>}
  </Page>;
}
function ContactEditor({ contact: c, onClose, onSaved }: {
    contact: Contact | null;
    onClose: () => void;
    onSaved: () => Promise<void>;
}) {
    const [unsubscribed, setUnsubscribed] = useState(c?.unsubscribed ?? false);
    return <FormDialog<ContactValues> title={c ? 'Edit contact' : 'Add contact'} submitLabel="Save contact" fields={['email', 'first_name', 'last_name', 'properties']} onClose={onClose} onSubmit={async (v) => {
            const contact = { email: c?.email ?? v.email, first_name: v.first_name ?? '', last_name: v.last_name ?? '', properties: JSON.parse(v.properties), unsubscribed };
            if (c)
                await api.patch(`/v1/contacts/${c.id}`, { expected_revision: c.revision, contact });
            else
                await api.post('/v1/contacts', contact);
            await onSaved();
        }}>
    <Field<string> name="email" label="Email" defaultValue={c?.email ?? ''} isRequired component={({ fieldProps }) => <Textfield {...fieldProps} type="email" isDisabled={!!c}/>}/>
    <Field<string> name="first_name" label="First name" defaultValue={c?.first_name ?? ''} component={({ fieldProps }) => <Textfield {...fieldProps}/>}/>
    <Field<string> name="last_name" label="Last name" defaultValue={c?.last_name ?? ''} component={({ fieldProps }) => <Textfield {...fieldProps}/>}/>
    <details className="advanced-options"><summary>Custom properties</summary><Field<string, HTMLTextAreaElement> name="properties" label="Custom properties (JSON object)" defaultValue={JSON.stringify(c?.properties ?? {}, null, 2)} component={({ fieldProps }) => <TextArea {...fieldProps} minimumRows={4}/>}/></details>
    <Checkbox label="Unsubscribed from marketing" isChecked={unsubscribed} onChange={event => setUnsubscribed(event.currentTarget.checked)} />
    <Text>Only subscribe contacts with their permission. Subscription status does not block transactional messages.</Text>
  </FormDialog>;
}
