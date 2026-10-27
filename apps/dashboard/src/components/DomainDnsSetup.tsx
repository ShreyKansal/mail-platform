import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import Heading from '@atlaskit/heading';
import Checkbox from '@atlaskit/checkbox';
import { Text } from '@atlaskit/primitives';
import Button from './controls/Button';
import Textfield from './controls/Textfield';
import { SideSheet } from './SideSheet';
import { Table } from './Table';
import { ErrorBlock } from './feedback';
import Lozenge from './controls/Lozenge';
import { FilterSelect } from './FilterSelect';
import { CopyButton } from './dialogs';
import { api, type Domain } from '../lib/api';

interface PlanRecord { purpose:string; type:string; host:string; value:string; priority:number|null; required:boolean; status:'create'|'existing'|'conflict'; detail:string; }
interface DnsPlan { provider:'cloudflare'|'godaddy'; domain_id:string; zone:{id:string;name:string}; plan_token:string; expires_at:string; records:PlanRecord[]; }
interface DnsResult { zone:{id:string;name:string}; records:Array<PlanRecord & {outcome:'created'|'existing'|'conflict'|'failed'}>; created:number; existing:number; conflicts:number; failed:number; }

/** Credentials live only in this mounted editor, never in query cache or storage. */
export function DomainDnsSetup({domain,onClose,onCheck,onManualSetup,initialProvider='godaddy'}:{domain:Domain;onClose:()=>void;onCheck:()=>void;onManualSetup?:()=>void;initialProvider?:'godaddy'|'cloudflare'}) {
  const [token,setToken]=useState(''),[includeDmarc,setIncludeDmarc]=useState(false),[plan,setPlan]=useState<DnsPlan|null>(null),[result,setResult]=useState<DnsResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null);
  const [zoneId,setZoneId]=useState('');
  const [provider,setProvider]=useState<'godaddy'|'cloudflare'>(initialProvider),[apiKey,setApiKey]=useState(''),[apiSecret,setApiSecret]=useState('');
  const providerName=provider==='godaddy'?'GoDaddy':'Cloudflare';
  const connection=useQuery({queryKey:['domain-connect',domain.id],queryFn:()=>api.get<{available:boolean;reason:string|null}>(`/v1/domains/${domain.id}/domain-connect`),enabled:provider==='godaddy'});
  const connect=async()=>{if(busy)return;setBusy(true);setError(null);try{const result=await api.post<{url:string}>(`/v1/domains/${domain.id}/domain-connect/start`);const url=new URL(result.url);if(url.protocol!=='https:'||url.hostname!=='domainconnect.godaddy.com')throw new Error('Invalid provider authorization address.');window.location.assign(url.href);}catch(e){setError(e);setBusy(false);}};
  const credentials=()=>provider==='cloudflare'?{provider,api_token:token.trim()}:{provider,api_key:apiKey.trim(),api_secret:apiSecret.trim()};
  const preview=async(event:FormEvent)=>{
    event.preventDefault();if(busy)return;
    if(provider==='cloudflare'?!token.trim():!apiKey.trim()||!apiSecret.trim()){setError(new Error(provider==='cloudflare'?'Enter your Cloudflare API token.':'Enter your GoDaddy API key and secret.'));return;}
    if(provider==='cloudflare'&&zoneId.trim()&&!/^[a-f0-9]{32}$/i.test(zoneId.trim())){setError(new Error('Enter a valid 32-character Cloudflare Zone ID, or leave it blank for automatic discovery.'));return;}
    setBusy(true);setError(null);setPlan(null);setResult(null);
    try {setPlan(await api.post<DnsPlan>(`/v1/domains/${domain.id}/dns-setup/preview`,{...credentials(),include_dmarc:includeDmarc,...(zoneId.trim()?{zone_id:zoneId.trim()}:{})}));}
    catch(e){setError(e);}finally{setBusy(false);}
  };
  const apply=async()=>{
    if(busy||!plan)return;setBusy(true);setError(null);
    try {
      const applied=await api.post<DnsResult>(`/v1/domains/${domain.id}/dns-setup/apply`,{...credentials(),zone_id:plan.zone.id,include_dmarc:includeDmarc,plan_token:plan.plan_token});
      setResult(applied);setToken('');setApiKey('');setApiSecret('');setPlan(null);
    }catch(e){setError(e);setPlan(null);}finally{setBusy(false);}
  };
  const rows=result?.records??plan?.records;
  return <SideSheet title="Automatic DNS setup" onClose={()=>{if(!busy)onClose();}}><div className="domain-dns-setup">
    <Text as="p" color="color.text.subtle">Set up DNS records for {domain.name}.</Text>
    {error!=null&&<ErrorBlock title="DNS setup could not complete" error={error}/>}
    {provider==='godaddy'&&!result&&<section className="domain-dns-plan"><Heading as="h3" size="small">Connect GoDaddy</Heading>{connection.isLoading?<Text>Checking connection availability…</Text>:connection.error?<ErrorBlock error={connection.error} onRetry={()=>void connection.refetch()}/>:connection.data?.available?<><Text as="p">Sign in at GoDaddy and approve the DNS changes.</Text><div><Button appearance="primary" isLoading={busy} onClick={()=>void connect()}>Continue to GoDaddy</Button></div></>:<><Text as="p" color="color.text.subtle">Automatic setup is not available yet. You can add the records manually.</Text><div><Button onClick={onManualSetup??onClose}>Use manual setup</Button></div></>}</section>}
    {!result&&<details className="domain-advanced" open={provider==='cloudflare'}><summary>API credentials (advanced)</summary><form onSubmit={preview} className="domain-dns-form">
      <label className="domain-dns-field">DNS provider<FilterSelect aria-label="DNS provider" fullWidth value={provider} isDisabled={busy} onChange={event=>{setProvider(event.target.value as 'godaddy'|'cloudflare');setToken('');setApiKey('');setApiSecret('');setZoneId('');setPlan(null);setError(null);}} options={[{label:'GoDaddy',value:'godaddy'},{label:'Cloudflare',value:'cloudflare'}]}/></label>
      {provider==='cloudflare'?<>
      <label className="domain-dns-field" htmlFor="cloudflare-api-token">Cloudflare API token<Textfield id="cloudflare-api-token" type="password" autoComplete="off" spellCheck={false} value={token} isDisabled={busy} onChange={event=>{setToken(event.target.value);setPlan(null);setError(null);}} aria-describedby="cloudflare-token-help"/></label>
      <Text as="p" id="cloudflare-token-help" size="small" color="color.text.subtle">Use a token with Zone Read and DNS Edit access for this domain’s zone. The token is used for this setup only and is not saved. <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer">Create a Cloudflare API token</a></Text>
      </>:<><label className="domain-dns-field" htmlFor="godaddy-api-key">GoDaddy API key<Textfield id="godaddy-api-key" type="password" autoComplete="off" value={apiKey} isDisabled={busy} onChange={event=>{setApiKey(event.target.value);setPlan(null);setError(null);}}/></label><label className="domain-dns-field" htmlFor="godaddy-api-secret">GoDaddy API secret<Textfield id="godaddy-api-secret" type="password" autoComplete="off" value={apiSecret} isDisabled={busy} onChange={event=>{setApiSecret(event.target.value);setPlan(null);setError(null);}}/></label><Text as="p" size="small" color="color.text.subtle">Use production credentials for an account with GoDaddy DNS API access. Credentials are used for this setup only and are not saved. <a href="https://developer.godaddy.com/keys" target="_blank" rel="noreferrer">Manage GoDaddy API keys</a>. If API access is unavailable, use manual setup.</Text></>}
      <Checkbox label="Add the recommended DMARC record" isChecked={includeDmarc} isDisabled={busy} onChange={event=>{setIncludeDmarc(event.target.checked);setPlan(null);}} />
      <details className="domain-advanced"><summary>Advanced options</summary><label className="domain-dns-field" htmlFor="dns-zone-id">{provider==='cloudflare'?'Cloudflare Zone ID':'GoDaddy zone domain'} (optional)<Textfield id="dns-zone-id" value={zoneId} maxLength={provider==='cloudflare'?32:253} isDisabled={busy} onChange={event=>{setZoneId(event.target.value);setPlan(null);}} /></label><Text as="p" size="small" color="color.text.subtle">Leave blank to find the closest DNS zone automatically.</Text></details>
      <div><Button type="submit" isLoading={busy&&!plan} isDisabled={busy}>{plan?'Refresh preview':'Preview DNS changes'}</Button></div>
    </form></details>}
    {plan&&<section className="domain-dns-plan" aria-labelledby="dns-plan-title"><Heading as="h3" size="small" id="dns-plan-title">Review DNS changes</Heading><Text as="p">{providerName} zone: <strong>{plan.zone.name}</strong></Text><Text as="p" size="small" color="color.text.subtle">Only missing records will be added. Existing records stay in place. Resolve any conflicts at your DNS provider, then refresh this preview.</Text></section>}
    {result&&<section className="domain-dns-plan" role="status"><Heading as="h3" size="small">{result.failed||result.conflicts?'DNS setup needs attention':'DNS records ready'}</Heading><Text as="p">{result.created} added · {result.existing} already present · {result.conflicts} conflicts · {result.failed} failed</Text><Text as="p" size="small" color="color.text.subtle">DNS publication does not verify the domain immediately. Check DNS after the records propagate.</Text></section>}
    {rows&&<Table label="Automatic DNS changes" isLoading={false} emptyView={<Text>No DNS changes needed.</Text>} columns={[{key:'record',content:'Record',width:66},{key:'change',content:'Change',width:34}]} rows={rows.map(record=>{
      const outcome='outcome' in record?String(record.outcome):record.status;
      return {key:record.purpose,cells:[{content:<div className="domain-dns-record"><strong>{record.type}{record.priority!=null?` ${record.priority}`:''} · {record.host}</strong><span className="domain-dns-value" title={record.value}>{record.value}</span><CopyButton value={record.value} label={`Copy ${record.purpose} value`}/></div>},{content:<div className="domain-dns-record"><Lozenge appearance={outcome==='created'||outcome==='existing'?'success':outcome==='conflict'||outcome==='failed'?'removed':'inprogress'}>{({create:'Will add',created:'Added',existing:'Already present',conflict:'Conflict',failed:'Failed'} as Record<string,string>)[outcome]}</Lozenge><span>{record.detail}</span></div>} ]};
    })}/>}
    <div className="domain-dns-actions">{result?<><Button onClick={()=>{setResult(null);setError(null);}}>Connect again</Button><Button appearance="primary" onClick={()=>{onClose();onCheck();}}>Check DNS now</Button></>:<><Button onClick={onClose} isDisabled={busy}>Cancel</Button>{plan&&<Button appearance="primary" isLoading={busy} isDisabled={busy||!plan.records.some(record=>record.status==='create')} onClick={()=>void apply()}>Add {plan.records.filter(record=>record.status==='create').length} DNS records</Button>}</>}</div>
  </div></SideSheet>;
}
