import Tabs, { Tab, TabList, TabPanel } from '../components/controls/Tabs';
import Heading from '@atlaskit/heading';
import { EmptyResource } from '../components/EmptyResource';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../components/controls/Button';
import { Field } from '@atlaskit/form';
import Textfield from '../components/controls/Textfield';
import TextArea from '../components/controls/Textarea';
import Checkbox from '@atlaskit/checkbox';
import { Stack, Text } from '@atlaskit/primitives';
import { Page } from '../components/Page';
import { Table } from '../components/Table';
import { DetailsDialog, FormDialog } from '../components/dialogs';
import { ErrorBlock, LoadingBlock, useNotify } from '../components/feedback';
import { api, type Page as ApiPage } from '../lib/api';
import { formatDate, useCan, useCursorPages } from '../lib/hooks';
interface Content {
    subject: string;
    html?: string;
    text?: string;
    variables: Record<string, {
        type: 'string' | 'number';
        required: boolean;
        default?: string | number;
    }>;
}
interface Template {
    id: string;
    name: string;
    content: Content;
    revision: number;
    published_version: number | null;
    archived_at: string | null;
    created_at: string;
}
const initial: Content = { subject: 'Welcome, {{name}}', html: '<p>Hello {{name}},</p><p>Welcome!</p>', variables: { name: { type: 'string', required: true } } };
export function TemplatesPage() {
    const [creating, setCreating] = useState(false), [archived, setArchived] = useState(false);
    const pages = useCursorPages(), navigate = useNavigate(), canManage = useCan('templates:manage');
    const params = new URLSearchParams({ limit: '25', archived: String(archived), ...(pages.cursor ? { cursor: pages.cursor } : {}) });
    const q = useQuery({ queryKey: ['templates', params.toString()], queryFn: () => api.get<ApiPage<Template>>(`/v1/templates?${params}`) });
    return <Page title="Templates" route="/templates" actions={canManage && <Button appearance="primary" onClick={() => setCreating(true)}>Create template</Button>}>
    <Table toolbar={<div className="resource-toolbar"><Checkbox label="Include archived templates" isChecked={archived} onChange={e => { setArchived(e.target.checked); pages.reset(); }} /></div>} label="Templates" isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} columns={[{ key: 'name', content: 'Name' }, { key: 'revision', content: 'Draft revision' }, { key: 'version', content: 'Published version' }, { key: 'created', content: 'Created' }]} rows={q.data?.data.map(t => ({ key: t.id, cells: [{ content: <Link to={`/templates/${t.id}`}>{t.name}{t.archived_at ? ' (archived)' : ''}</Link> }, { content: t.revision }, { content: t.published_version ?? 'Unpublished' }, { content: formatDate(t.created_at) }] }))} pagination={{ hasPrevious: pages.hasPrevious, hasNext: !!q.data?.next_cursor, onPrevious: pages.previous, onNext: () => pages.next(q.data?.next_cursor ?? null) }} emptyView={<EmptyResource title={archived ? "No matching templates" : "No templates yet"} description="Create a template to reuse its subject and content." action={canManage && !archived ? <Button appearance="primary" onClick={() => setCreating(true)}>Create template</Button> : undefined} />}/>
    {creating && <FormDialog<{
        name: string;
    }> title="Create template" submitLabel="Create draft" fields={['name']} onClose={() => setCreating(false)} onSubmit={async (v) => { const t = await api.post<Template>('/v1/templates', { name: v.name, content: initial }); navigate(`/templates/${t.id}`); }}><Field<string> name="name" label="Name" isRequired validate={v => v?.trim() ? undefined : 'Enter a name'} component={({ fieldProps }) => <Textfield {...fieldProps}/>}/></FormDialog>}
  </Page>;
}
export function TemplateDetailPage() {
    const { id } = useParams();
    const q = useQuery({ queryKey: ['template', id], queryFn: () => api.get<Template>(`/v1/templates/${id}`) });
    if (q.isLoading)
        return <LoadingBlock />;
    if (q.error || !q.data)
        return <ErrorBlock error={q.error} onRetry={() => void q.refetch()}/>;
    return <TemplateEditor key={`${q.data.id}:${q.data.revision}:${q.data.archived_at}`} template={q.data}/>;
}
function TemplateEditor({ template: t }: {
    template: Template;
}) {
    const qc = useQueryClient(), notify = useNotify(), manage = useCan('templates:manage'), canSend = useCan('emails:send'), navigate = useNavigate();
    const [name, setName] = useState(t.name), [subject, setSubject] = useState(t.content.subject), [html, setHtml] = useState(t.content.html ?? ''), [text, setText] = useState(t.content.text ?? ''), [variables, setVariables] = useState(JSON.stringify(t.content.variables, null, 2)), [values, setValues] = useState('{}'), [busy, setBusy] = useState(false), [preview, setPreview] = useState<{
        subject: string;
        html?: string;
        text?: string;
    } | null>(null), [history, setHistory] = useState(false);
    const [actionError, setActionError] = useState<unknown>(null);
    const [sender, setSender] = useState(''), [versionBefore, setVersionBefore] = useState<number | undefined>();
    const versions = useQuery({ queryKey: ['template-versions', t.id, versionBefore], queryFn: () => api.get<{
            data: Array<{
                version: number;
                content: Content;
                created_at: string;
            }>;
            next_before: number | null;
        }>(`/v1/templates/${t.id}/versions${versionBefore ? '?before=' + versionBefore : ''}`), enabled: history });
    const dirty = name !== t.name || subject !== t.content.subject || html !== (t.content.html ?? '') || text !== (t.content.text ?? '') || variables !== JSON.stringify(t.content.variables, null, 2);
    const refresh = async () => { await qc.invalidateQueries({ queryKey: ['template', t.id] }); await qc.invalidateQueries({ queryKey: ['templates'] }); await qc.invalidateQueries({ queryKey: ['template-versions', t.id] }); };
    const run = async (fn: () => Promise<unknown>) => { if (busy) return; setActionError(null); setBusy(true); try {
        await fn();
    }
    catch (e) {
        setActionError(e);
    }
    finally {
        setBusy(false);
    } };
    return <Page title={t.name} route="/templates/:id" crumbs={[{ text: 'Templates', href: '/templates' }, { text: t.name }]} description={`Draft revision ${t.revision}. Published version: ${t.published_version ?? 'none'}. ${t.archived_at ? 'Archived.' : ''}`}>
    {actionError != null && <ErrorBlock title="Could not complete this action" error={actionError} />}
    <div className="template-editor-layout"><section className="card template-editor-main"><Heading size="small" as="h2">Draft content</Heading><Stack space="space.200">
      <label>Name<Textfield value={name} onChange={e => setName(e.currentTarget.value)} isDisabled={!manage || !!t.archived_at || busy}/></label>
      <label>Subject<Textfield value={subject} onChange={e => setSubject(e.currentTarget.value)} isDisabled={!manage || !!t.archived_at || busy}/></label>
      <Tabs id="template-body-format"><TabList><Tab>HTML</Tab><Tab>Plain text</Tab></TabList><TabPanel><div className="editor-field"><label>HTML<TextArea value={html} onChange={e => setHtml(e.currentTarget.value)} minimumRows={8} isDisabled={!manage || !!t.archived_at || busy}/></label></div></TabPanel><TabPanel><div className="editor-field"><label>Plain text (optional when HTML is provided)<TextArea value={text} onChange={e => setText(e.currentTarget.value)} minimumRows={4} isDisabled={!manage || !!t.archived_at || busy}/></label></div></TabPanel></Tabs>
      <details className="advanced-options"><summary>Template variables</summary><label>Variable definitions (JSON)<TextArea value={variables} onChange={e => setVariables(e.currentTarget.value)} minimumRows={5} isDisabled={!manage || !!t.archived_at || busy}/></label>
      <Text>Use {'{{name}}'} in the subject, plain text or HTML text content. Definitions use type, required and optional default. HTML attribute interpolation is not supported.</Text></details>
      {manage && !t.archived_at && <div className="template-actions"><Button isDisabled={busy || !dirty} onClick={() => void run(async () => { await api.patch(`/v1/templates/${t.id}`, { name, content: { subject, ...(html ? { html } : {}), ...(text ? { text } : {}), variables: JSON.parse(variables) }, expected_revision: t.revision }); await refresh(); notify.success('Draft saved'); })}>Save draft</Button>{' '}<Button appearance="primary" isDisabled={busy || dirty} onClick={() => void run(async () => { await api.post(`/v1/templates/${t.id}/publish`, { expected_revision: t.revision }); await refresh(); notify.success('Version published'); })}>Publish saved draft</Button></div>}
    </Stack></section><section className="card template-editor-tools"><Heading size="small" as="h2">Review & test</Heading><Stack space="space.200">
      <details className="advanced-options"><summary>Preview variables</summary><label>Preview variable values (JSON)<TextArea value={values} onChange={e => setValues(e.currentTarget.value)} minimumRows={3}/></label></details>
      <div className="template-actions"><Button isDisabled={busy || dirty} onClick={() => void run(async () => setPreview(await api.post(`/v1/templates/${t.id}/preview`, { variables: JSON.parse(values) })))}>Preview saved draft</Button>{' '}<Button onClick={() => setHistory(true)}>Published versions</Button>{' '}{manage && <Button isDisabled={busy} onClick={() => void run(async () => { await api.post(`/v1/templates/${t.id}/${t.archived_at ? 'restore' : 'archive'}`); await refresh(); })}>{t.archived_at ? 'Restore' : 'Archive'}</Button>}</div>
      {canSend && !!t.published_version && !t.archived_at && <div className="template-simulation"><label>Verified sender for simulation<Textfield value={sender} onChange={e => setSender(e.currentTarget.value)} placeholder="sender@your-verified-domain.com"/></label><Button isDisabled={busy || !sender.trim()} onClick={() => void run(async () => { const sent = await api.post<{
        id: string;
    }>('/v1/emails', { from: sender.trim(), to: 'success@simulate.mail-platform.invalid', test_mode: true, template: { id: t.id, version: t.published_version, variables: JSON.parse(values) } }); navigate(`/emails/${sent.id}`); })}>Simulate published version {t.published_version}</Button><Text as="p" size="small" color="color.text.subtle">Uses the published content and preview variable values. No real email is sent.</Text></div>}
      <details className="advanced-options"><summary>Use with the email API</summary><Text as="p">Send with the email API using template: {'{ id: "' + t.id + '", variables: { name: "Sam" } }'}. Add a version number to pin an older published version. Omit subject, html and text.</Text></details>
    </Stack></section></div>
    {preview && <DetailsDialog title="Template preview" onClose={() => setPreview(null)}><Stack space="space.150"><Text weight="bold">{preview.subject}</Text>{preview.html !== undefined && <iframe title="Rendered template" sandbox="" referrerPolicy="no-referrer" style={{ width: '100%', minHeight: 300, border: 0 }} srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">${preview.html}`}/>}<pre className="text-preview">{preview.text ?? 'Plain text will be generated from HTML when sent.'}</pre></Stack></DetailsDialog>}
    {history && <DetailsDialog title="Published versions" onClose={() => setHistory(false)}>{versions.error ? <ErrorBlock error={versions.error} onRetry={() => void versions.refetch()}/> : versions.isLoading ? <LoadingBlock /> : <Stack space="space.150">{versions.data?.data.map(v => <div key={v.version}><Text weight="bold">Version {v.version} · {formatDate(v.created_at)}</Text><pre className="text-preview">{JSON.stringify(v.content, null, 2)}</pre></div>)}{!versions.data?.data.length && <Text>No published versions.</Text>}<div>{versionBefore && <Button onClick={() => setVersionBefore(undefined)}>Newest versions</Button>}{versions.data?.next_before && <Button onClick={() => setVersionBefore(versions.data!.next_before!)}>Older versions</Button>}</div></Stack>}</DetailsDialog>}
  </Page>;
}
