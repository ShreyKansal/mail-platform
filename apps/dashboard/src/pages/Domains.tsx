import { RowActions } from '../components/RowActions';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../components/controls/Button';
import LinkButton from '../components/controls/LinkButton';
import { EmptyState } from '../components/EmptyState';
import { Field, Label } from '@atlaskit/form';
import Select from '@atlaskit/select';
import Heading from '@atlaskit/heading';
import { RotateCw as RefreshIcon, Check, Globe, Mail } from '../components/icons';
import { Inline, Stack, Text } from '@atlaskit/primitives';
import Tabs, { Tab, TabList, TabPanel } from '../components/controls/Tabs';
import Textfield from '../components/controls/Textfield';
import { ConfirmDialog, CopyButton, DetailsDialog } from '../components/dialogs';
import Form from '@atlaskit/form';
import { ErrorBlock, LoadingBlock, useNotify } from '../components/feedback';
import { Page, TabBody } from '../components/Page';
import { HelpLozenge } from '../components/status';
import { Table } from '../components/Table';
import { api, type DnsRecord, type Domain, type RecordStatus } from '../lib/api';
import { formatDate, relativeTime, useCan } from '../lib/hooks';
import { DomainDnsSetup } from '../components/DomainDnsSetup';
import { DomainRecordGroups } from '../components/DomainRecordGroups';

type Appearance = 'default' | 'inprogress' | 'moved' | 'new' | 'removed' | 'success';
interface DkimKey { id: string; selector: string; status: string; retire_after: string | null; record: { host: string; value: string } }

const DOMAIN_STATUS: Record<Domain['status'], { label: string; appearance: Appearance; help: string }> = {
  pending: { label: 'Pending', appearance: 'inprogress', help: 'Waiting for the required DNS records. We check automatically every few minutes.' },
  verified: { label: 'Verified', appearance: 'success', help: 'Ownership and DKIM are confirmed. You can send from this domain.' },
  failed: { label: 'Failed', appearance: 'removed', help: 'Required records were not found within 72 hours, or were removed later. Fix the records and check again.' },
  disabled: { label: 'Disabled', appearance: 'default', help: 'Removed by your team. Kept only so past delivery records stay complete.' },
};

const RECORD_STATUS: Record<RecordStatus, { label: string; appearance: Appearance; help: string }> = {
  valid: { label: 'Valid', appearance: 'success', help: 'Found in DNS with the expected value.' },
  pending: { label: 'Propagating', appearance: 'inprogress', help: 'Published at your DNS provider; waiting for cached answers to expire.' },
  missing: { label: 'Missing', appearance: 'default', help: 'Not found in DNS yet.' },
  invalid: { label: 'Invalid', appearance: 'removed', help: 'Found, but the value is not what we expect. See the details below the record.' },
  partial: { label: 'Partial', appearance: 'moved', help: 'Works, but not fully: for example DMARC in monitoring-only mode.' },
  conflict: { label: 'Conflict', appearance: 'removed', help: 'More than one competing record exists. Keep exactly one.' },
  temp_error: { label: 'DNS timeout', appearance: 'moved', help: 'DNS did not answer in time. We will retry automatically.' },
  resolution_failed: { label: 'Lookup failed', appearance: 'removed', help: 'The DNS lookup failed. Check that the domain resolves.' },
};

const PURPOSE: Record<DnsRecord['purpose'], { title: string; why: string }> = {
  ownership: { title: 'Ownership', why: 'Proves your organization controls this domain.' },
  dkim: { title: 'DKIM', why: 'Lets receivers verify our signature on your mail. Gives DMARC alignment.' },
  return_path_mx: { title: 'Return-Path MX', why: 'Routes bounce notifications for your custom Return-Path to us.' },
  return_path_spf: { title: 'Return-Path SPF', why: 'Authorizes our servers for your bounce domain. Gives SPF alignment.' },
  dmarc: { title: 'DMARC', why: 'Tells receivers how to treat mail that fails authentication.' },
};

export function DomainStatusLozenge({ status }: { status: Domain['status'] }) {
  const s = DOMAIN_STATUS[status];
  return <HelpLozenge label={s.label} appearance={s.appearance} help={s.help} />;
}

export function AddDomainPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const notify = useNotify();
  const canManage=useCan('domains:manage');
  const [previewName,setPreviewName]=useState('');
  const [error,setError]=useState<unknown>(null);
  return (
    <div className="domain-onboarding-page"><span className="domain-page-symbol" aria-hidden><Globe size={36}/></span><Page title="Add domain" route="/domains/new" crumbs={[{text:'Domains',href:'/domains'},{text:'Add domain'}]} description="Use a domain you own to send emails.">
    {!canManage?<Text>You need permission to manage domains.</Text>:<div className="domain-onboarding domain-timeline"><section className="domain-setup-step" aria-labelledby="domain-step-title"><span className="domain-step-index" aria-hidden/><div className="domain-step-body"><Heading as="h2" size="medium" id="domain-step-title">Domain</Heading><Text as="p" color="color.text.subtle">The domain or subdomain you will send from.</Text>
    <Form<{ name: string; return_path_label: string }> onSubmit={async (v) => {
        setError(null);
        try{const d = await api.post<Domain>('/v1/domains', { name: v.name.trim(), return_path_label: v.return_path_label?.trim() || 'bounce' });
        await qc.invalidateQueries({ queryKey: ['domains'] });
        notify.success(`${d.name} added`);
        navigate(`/domains/${d.id}?onboarding=1`);}catch(e){setError(e);}
      }}>{({formProps,submitting})=><form {...formProps} className="domain-entry-form" noValidate>{error!=null&&<ErrorBlock error={error}/>}
      <Field<string>
        name="name"
        label="Name"
        isRequired
        defaultValue=""
        validate={(v) => (!v || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v.trim()) ? 'Enter a domain such as example.com' : undefined)}
        component={({ fieldProps }) => <Textfield {...fieldProps} placeholder="updates.example.com" autoFocus isDisabled={submitting} onChange={event=>{fieldProps.onChange(event);setPreviewName(event.currentTarget.value);}} />}
      />
      <details className="domain-advanced"><summary>Advanced options</summary><Field<string>
        name="return_path_label"
        label="Return-Path label"
        defaultValue="bounce"
        helperMessage="Bounces return to <label>.<domain>, for example bounce.notify.example.com."
        validate={(v) => (v && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(v.trim()) ? 'Use one lowercase DNS label, such as bounce' : undefined)}
        component={({ fieldProps }) => <Textfield {...fieldProps} isDisabled={submitting} />}
      /></details>
      <div><Button type="submit" appearance="primary" isLoading={submitting}>Add domain</Button></div></form>}</Form>
    </div></section><aside className="domain-sender-preview" aria-label="Sender address preview"><span className="domain-preview-mark"><Mail size={20} aria-hidden/></span><div><strong>Your name <span title={`notifications@${previewName||'updates.example.com'}`}>&lt;notifications@{previewName||'updates.example.com'}&gt;</span></strong><small>to your customer</small></div><div className="domain-preview-lines" aria-hidden><span/><span/><span/></div></aside><section className="domain-setup-step domain-step-upcoming" aria-label="DNS records, next step"><span className="domain-step-index" aria-hidden/><div className="domain-step-body"><Heading as="h2" size="medium">DNS records</Heading></div></section></div>}
    </Page></div>
  );
}

export function DomainsPage() {
  const canManage = useCan('domains:manage');
  const q = useQuery({ queryKey: ['domains'], queryFn: () => api.get<{ data: Domain[] }>('/v1/domains') });
  const add = canManage ? (
    <LinkButton appearance="primary" href="/domains/new">
      Add domain
    </LinkButton>
  ) : undefined;
  return (
    <Page
      title="Domains"
      route="/domains"
      description="Verify and manage the domains used to send email."
      actions={add}
    >
      <Table
        label="Domains" searchable
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        columns={[
          { key: 'name', content: 'Domain', isSortable: true },
          { key: 'status', content: 'Status', isSortable: true },
          { key: 'sending', content: 'Sending' },
          { key: 'return', content: 'Return-Path' },
          { key: 'checked', content: 'Last checked', isSortable: true },
        ]}
        rows={q.data?.data.map((d) => ({
          key: d.id,
          cells: [
            { content: <Link to={`/domains/${d.id}`}>{d.name}</Link>, sortValue: d.name },
            { content: <DomainStatusLozenge status={d.status} />, sortValue: d.status },
            { content: d.sending_enabled ? 'Enabled' : 'Not yet' },
            {
              content: (
                <Text color={d.custom_return_path_active ? 'color.text' : 'color.text.subtle'}>
                  {d.custom_return_path_active ? d.return_path_domain : 'Platform default'}
                </Text>
              ),
            },
            { content: relativeTime(d.last_checked_at), sortValue: d.last_checked_at ?? '' },
          ],
        }))}
        emptyView={
          <EmptyState
            header="Add your first domain"
            description="Add a domain to generate its verification and email authentication records."
            primaryAction={add}
          />
        }
      />
    </Page>
  );
}

export function DomainDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const notify = useNotify();
  const canManage = useCan('domains:manage');
  const [setupParams,setSetupParams] = useSearchParams();
  const automaticSetup = canManage && ['cloudflare','godaddy'].includes(setupParams.get('setup')??'');
  const callbackStarted=useRef(false);
  useEffect(()=>{
    if(!canManage||setupParams.get('domain_connect')!=='returned'||callbackStarted.current)return;
    callbackStarted.current=true;
    const state=setupParams.get('state'),error=setupParams.get('error');
    void (async()=>{try{if(!state)throw new Error('GoDaddy did not return a valid connection session. Start again.');const response=await api.post<{status:'returned'|'cancelled'}>(`/v1/domains/${id}/domain-connect/complete`,{state,...(error?{error}: {})});if(response.status==='cancelled')notify.failure('GoDaddy connection was cancelled');else{notify.success('Returned from GoDaddy','Check DNS to confirm the records have propagated.');void qc.invalidateQueries({queryKey:['domains',id]});}}catch(e){notify.failure('Could not confirm GoDaddy connection',e);}finally{setSetupParams(previous=>{const next=new URLSearchParams(previous);for(const key of ['domain_connect','state','error','error_description'])next.delete(key);return next;},{replace:true});}})();
  },[canManage,id,setupParams,notify,qc,setSetupParams]);
  const [connecting,setConnecting]=useState(false);
  const autoConfigure=async()=>{if(connecting)return;setConnecting(true);try{const status=await api.get<{available:boolean}>(`/v1/domains/${id}/domain-connect`);if(!status.available){setSetupParams(previous=>{const next=new URLSearchParams(previous);next.set('setup','godaddy');return next;});return;}const result=await api.post<{url:string}>(`/v1/domains/${id}/domain-connect/start`);const url=new URL(result.url);if(url.protocol!=='https:'||url.hostname!=='domainconnect.godaddy.com')throw new Error('Invalid provider authorization address.');window.location.assign(url.href);}catch(e){notify.failure('Could not connect to GoDaddy',e);}finally{setConnecting(false);}};
  const closeSetup = () => setSetupParams(previous=>{const next=new URLSearchParams(previous);next.delete('setup');return next;},{replace:true});
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [rotationRecord, setRotationRecord] = useState<DkimKey | null>(null);
  const keys = useQuery({ queryKey: ['dkim-keys', id], queryFn: () => api.get<{ data: DkimKey[] }>(`/v1/domains/${id}/dkim-keys`) });
  const rotate = useMutation({ mutationFn: () => api.post<DkimKey>(`/v1/domains/${id}/dkim-keys`), onSuccess: (key) => { setRotationRecord(key); void qc.invalidateQueries({ queryKey: ['dkim-keys', id] }); }, onError: (error) => notify.failure('Could not start DKIM rotation', error) });
  const checkKey = useMutation({ mutationFn: (keyId: string) => api.post<{ activated: boolean; detail: string }>(`/v1/domains/${id}/dkim-keys/${keyId}/verify`), onSuccess: (result) => {
    void qc.invalidateQueries({ queryKey: ['dkim-keys', id] }); void qc.invalidateQueries({ queryKey: ['domains'] }); notify.success(result.activated ? 'New DKIM selector active' : 'DNS is not ready', result.detail);
  }, onError: (error) => notify.failure('Could not verify DKIM selector', error) });
  const tls = useMutation({ mutationFn: (tls_policy: 'opportunistic' | 'enforced') => api.patch<Domain>(`/v1/domains/${id}`, { tls_policy }),
    onSuccess: (domain) => { qc.setQueryData(['domains', id], domain); void qc.invalidateQueries({ queryKey: ['domains'], exact: true }); notify.success('TLS policy updated'); },
    onError: (error) => notify.failure('Could not update TLS policy', error),
  });
  const q = useQuery({ queryKey: ['domains', id], queryFn: () => api.get<Domain>(`/v1/domains/${id}`) });
  const verify = useMutation({
    mutationFn: () => api.post<Domain>(`/v1/domains/${id}/verify`),
    onSuccess: (d) => {
      qc.setQueryData(['domains', id], d);
      void qc.invalidateQueries({ queryKey: ['domains'], exact: true });
      if (d.sending_enabled) notify.success('Domain verified', `You can send from ${d.name}.`);
      else notify.success('DNS checked', 'Some required records are not valid yet. See the Status column.');
    },
    onError: (err) => notify.failure('Could not check DNS', err),
  });
  const remove = useMutation({
    mutationFn: () => api.delete<{ result: 'deleted' | 'disabled' }>(`/v1/domains/${id}`),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['domains'] });
      notify.success(r.result === 'deleted' ? 'Domain removed' : 'Domain disabled', r.result === 'disabled' ? 'Its delivery history is kept.' : undefined);
      navigate('/domains');
    },
    onError: (err) => notify.failure('Could not remove domain', err),
  });

  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;
  const instructions = [`DNS setup for ${d.name}`, '', 'Add these records at your DNS provider. Keep unrelated records in place.', 'Return to Domains and select Check DNS now after publishing.', '', ...d.records.flatMap(record=>[`${PURPOSE[record.purpose].title} (${record.required?'Required':'Recommended'})`, `Type: ${record.type}`, `Name: ${record.host}`, `Value: ${record.value}`, ...(record.priority!=null?[`Priority: ${record.priority}`]:[]), 'TTL: Auto', ''])].join('\n');
  const downloadInstructions=()=>{const url=URL.createObjectURL(new Blob([instructions],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`${d.name}-dns-instructions.txt`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const required = d.records.filter((r) => r.required);
  const requiredValid = required.filter((r) => r.status === 'valid').length;
  const onboarding=setupParams.get('onboarding')==='1'&&!d.sending_enabled;
  const manualRecords=!onboarding||setupParams.get('view')==='records';
  const showManualRecords=()=>setSetupParams(previous=>{const next=new URLSearchParams(previous);next.set('view','records');return next;});
  const dnsContent=(<section className={"domain-dns-workspace"+(onboarding?' domain-timeline-dns':'')} aria-labelledby="dns-setup-title">
            {onboarding&&<span className="domain-step-index" aria-hidden/>}
            <div className="domain-dns-heading"><div><Heading as="h2" size="medium" id="dns-setup-title">{manualRecords?'Fill in your DNS records':'DNS records'}</Heading><Text as="p" color="color.text.subtle">{manualRecords?'Add the following DNS records at your domain provider.':'Sign in to your domain host to authorize DNS changes, or add the records manually.'}</Text></div>{manualRecords&&<div className="domain-record-actions">{canManage&&d.status!=='disabled'&&<Button isLoading={connecting} onClick={()=>void autoConfigure()}>Auto configure</Button>}<RowActions label="DNS record options" actions={[{label:'Copy instructions',onClick:async()=>{try{await navigator.clipboard.writeText(instructions);notify.success('Copied to clipboard');}catch(error){notify.failure('Could not copy instructions',error);}}},{label:'Download instructions',onClick:downloadInstructions}]}/></div>}</div>
            {!manualRecords?<div className="domain-provider-choice">{canManage&&d.status!=='disabled'&&<Button appearance="primary" isLoading={connecting} onClick={()=>void autoConfigure()}>Auto configure</Button>}<Button onClick={showManualRecords}>Manual setup</Button></div>:<><DomainRecordGroups records={d.records} status={record=>{const status=RECORD_STATUS[record.status];return <div className="domain-record-status"><HelpLozenge label={status.label} appearance={status.appearance} help={status.help}/>{record.status!=='valid'&&(record.detail||record.observed.length>0)&&<details><summary>Details</summary><Text as="p" size="small">{record.detail}</Text>{record.observed.length>0&&<Text as="p" size="small">Found: {record.observed.join(' | ')}</Text>}</details>}</div>;}}/><div className="domain-verify-footer"><div className="domain-verify-copy"><Text as="p" size="small">{requiredValid} of {required.length} required records verified</Text><Text as="p" size="small" color="color.text.subtle">We check DNS automatically. Changes can take up to 48 hours to propagate.</Text></div>{canManage&&<Button appearance="primary" iconBefore={RefreshIcon} isLoading={verify.isPending} isDisabled={d.status==='disabled'} onClick={()=>verify.mutate()}>Check DNS now</Button>}</div></>}
            </section>);

  return (
    <div className={onboarding?"domain-onboarding-page":"domain-detail-page"}>{onboarding&&<span className="domain-page-symbol" aria-hidden><Globe size={36}/></span>}<Page
      title={onboarding?'Add domain':d.name}
      route="/domains/:id"
      crumbs={[{ text: 'Domains', href: '/domains' }, { text: d.name }]}
      description={onboarding?'Use a domain you own to send emails.':
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <DomainStatusLozenge status={d.status} />
          <Text color="color.text.subtle">Last checked {relativeTime(d.last_checked_at)}</Text>
        </Inline>
      }
      actions={
        canManage && !onboarding ? (
          <>
            <RowActions label="Domain actions" actions={[{label: 'Remove domain', onClick: () => setConfirmRemove(true)}]} />
          </>
        ) : undefined
      }
    >
      {rotationRecord && <DetailsDialog title="Publish DKIM DNS record" onClose={() => setRotationRecord(null)}><Stack space="space.150"><Text>Type: TXT</Text><Text>Host: {rotationRecord.record.host}</Text><CopyButton value={rotationRecord.record.host} label="Copy DKIM host" /><pre className="text-preview">{rotationRecord.record.value}</pre><CopyButton value={rotationRecord.record.value} label="Copy DKIM value" /><Text>Keep existing DKIM DNS records in place during overlap.</Text></Stack></DetailsDialog>}
      {onboarding&&<section className="domain-identity-step"><span className="domain-step-index domain-step-complete" aria-hidden/><div className="domain-completed-panel"><div className="domain-completed-title"><Heading as="h2" size="medium">Domain</Heading><Check size={18} aria-label="Added"/></div><Text as="p" color="color.text.subtle">The domain or subdomain you will send from.</Text><div className="domain-completed-name"><Globe size={16} aria-hidden/><span>{d.name}</span></div></div></section>}
      {onboarding?dnsContent:<Tabs id="domain-tabs">
        {!onboarding&&<TabList>
          <Tab>DNS records</Tab>
          <Tab>Security</Tab>
          <Tab>Domain details</Tab>
        </TabList>}
        <TabPanel>
          <TabBody>
            {dnsContent}
          </TabBody>
        </TabPanel>
        <TabPanel><TabBody>      <section className="card"><Stack space="space.100"><Text weight="semibold">Outbound TLS</Text><Text>Opportunistic TLS can deliver without encryption when the recipient server has no TLS. Enforced TLS keeps retrying instead of sending unencrypted.</Text>
        <div className="resource-control"><Label htmlFor="outbound-tls-policy">Outbound TLS policy</Label><Select inputId="outbound-tls-policy" value={{ value: d.tls_policy, label: d.tls_policy === 'enforced' ? 'Require TLS' : 'Use TLS when available' }} isDisabled={!canManage || tls.isPending} options={[{ value: 'opportunistic', label: 'Use TLS when available' }, { value: 'enforced', label: 'Require TLS' }]} onChange={option => { if (option) tls.mutate(option.value as 'opportunistic' | 'enforced'); }} /></div>
      </Stack></section>
      <section className="card"><Stack space="space.150"><Heading size="small">DKIM rotation</Heading>
        <Text>Publish the new selector before switching. Keep the old DNS record throughout the seven-day overlap so mail already queued can still verify.</Text>
        {canManage && <Button isLoading={rotate.isPending} isDisabled={!d.sending_enabled || keys.isLoading || !!keys.error || keys.data?.data.some((key) => ['pending', 'retiring'].includes(key.status))} onClick={() => rotate.mutate()}>Generate new DKIM selector</Button>}
        {keys.error && <ErrorBlock error={keys.error} onRetry={() => void keys.refetch()} />}
        {keys.data?.data.map((key) => <Stack key={key.id} space="space.050"><Text weight="semibold">{key.selector} · {key.status}{key.retire_after ? ` · overlap ends ${formatDate(key.retire_after)}` : ''}</Text><Inline space="space.100"><Button onClick={() => setRotationRecord(key)}>DNS record</Button>{canManage && key.status === 'pending' && d.sending_enabled && <><Button isLoading={checkKey.isPending} onClick={() => checkKey.mutate(key.id)}>Verify and activate</Button><Button onClick={async () => { try { await api.delete(`/v1/domains/${id}/dkim-keys/${key.id}`); await qc.invalidateQueries({ queryKey: ['dkim-keys', id] }); notify.success('Pending rotation cancelled'); } catch (error) { notify.failure('Could not cancel rotation', error); } }}>Cancel rotation</Button></>}</Inline></Stack>)}
      </Stack></section>
</TabBody></TabPanel>
        <TabPanel>
          <TabBody>
            <dl className="definition-list">
              <dt>Domain</dt>
              <dd>{d.name}</dd>
              <dt>Status</dt>
              <dd>
                <DomainStatusLozenge status={d.status} />
              </dd>
              <dt>DKIM selector</dt>
              <dd>{d.dkim_selector ?? '—'}</dd>
              <dt>Return-Path</dt>
              <dd>
                {d.return_path_domain} {d.custom_return_path_active ? '(active)' : '(not active yet)'}
              </dd>
              <dt>Added</dt>
              <dd>{formatDate(d.created_at)}</dd>
              <dt>Last checked</dt>
              <dd>{formatDate(d.last_checked_at)}</dd>
            </dl>
            <Stack space="space.100">
              <Heading size="xsmall" as="h3">
                What each record does
              </Heading>
              <ul>
                {d.records.map((r) => (
                  <li key={r.purpose}>
                    <Text>
                      <Text weight="semibold">{PURPOSE[r.purpose].title}:</Text> {PURPOSE[r.purpose].why}
                    </Text>
                  </li>
                ))}
              </ul>
            </Stack>
          </TabBody>
        </TabPanel>
      </Tabs>}
      {automaticSetup&&d.status!=='disabled'&&<DomainDnsSetup domain={d} initialProvider={setupParams.get('setup')==='cloudflare'?'cloudflare':'godaddy'} onClose={closeSetup} onManualSetup={()=>setSetupParams(previous=>{const next=new URLSearchParams(previous);next.delete('setup');next.set('view','records');return next;},{replace:true})} onCheck={()=>verify.mutate()}/>}
      {confirmRemove && (
        <ConfirmDialog
          title={`Remove ${d.name}?`}
          confirmLabel="Remove domain"
          isLoading={remove.isPending}
          onConfirm={() => remove.mutate()}
          onClose={() => setConfirmRemove(false)}
        >
          <Text as="p">
            Sending from this domain stops immediately. If mail was already sent from it, the domain is disabled instead of deleted so delivery records
            stay complete.
          </Text>
        </ConfirmDialog>
      )}
    </Page></div>
  );
}
