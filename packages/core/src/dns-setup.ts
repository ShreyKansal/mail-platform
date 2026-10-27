import {createHmac,timingSafeEqual,createHash} from 'node:crypto';
import {z} from 'zod';
import {AppError,isAppError} from '@mp/shared';
import {dnsSetupRequest,dnsSetupPreview,dnsSetupResult,type dnsSetupRecord} from '@mp/contracts';
import type {DomainWithRecords} from './domains';

type Input=z.infer<typeof dnsSetupRequest>;
type RecordPlan=z.infer<typeof dnsSetupRecord>;
const zoneSchema=z.object({id:z.string().regex(/^[a-fA-F0-9]{32}$/),name:z.string(),status:z.string().optional()});
const recordSchema=z.object({id:z.string(),type:z.string(),name:z.string(),content:z.string(),priority:z.number().optional(),proxied:z.boolean().optional()});
type ProviderRecord=z.infer<typeof recordSchema>;
const host=(s:string)=>s.toLowerCase().replace(/\.$/,'');
const text=(s:string)=>{const value=s.trim(),pattern=/"((?:[^"\\]|\\.)*)"/g,chunks=[...value.matchAll(pattern)];return chunks.length&&value.replace(pattern,'').trim()===''?chunks.map(c=>c[1]!.replace(/\\(["\\])/g,'$1')).join(''):value;};
const belongs=(name:string,zone:string)=>host(name)===host(zone)||host(name).endsWith('.'+host(zone));

/** Fixed provider origin; never accepts URLs from requests or redirects bearing credentials. */
class Cloudflare {
 private readonly deadline=Date.now()+90000;
 constructor(private token:string,private fetcher:typeof fetch){}
 async call(path:string,method:'GET'|'POST'='GET',body?:unknown):Promise<{result:unknown;result_info?:{total_pages?:number}}>{
  const remaining=this.deadline-Date.now();if(remaining<=0)throw new AppError('invalid_state','Cloudflare setup timed out. Preview the records again to check which records were added.');
  let response:Response;try{response=await this.fetcher('https://api.cloudflare.com/client/v4'+path,{method,headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(Math.min(10000,remaining)),...(body?{body:JSON.stringify(body)}:{})});}catch{throw new AppError('invalid_state','Could not reach Cloudflare. Check your connection and preview the records again.');}
  if(response.status===401||response.status===403)throw new AppError('forbidden','Cloudflare rejected the token. Check Zone Read and DNS Edit permissions for this zone.');
  if(response.status===429)throw new AppError('rate_limited','Cloudflare is rate limiting requests. Wait and preview the records again.');
  let payload:unknown;try{payload=await response.json();}catch{throw new AppError('invalid_state','Cloudflare returned an invalid response. Preview the records again.');}
  const parsed=z.object({success:z.boolean(),result:z.unknown(),result_info:z.object({total_pages:z.number().optional()}).optional()}).safeParse(payload);
  // Provider error messages can echo submitted data; never surface them or log credentials.
  if(!response.ok||!parsed.success||!parsed.data.success)throw new AppError('invalid_state','Cloudflare could not complete this request. Check zone permissions and preview the records again.');
  return {result:parsed.data.result,...(parsed.data.result_info?{result_info:parsed.data.result_info}:{})};
 }
 async zone(domain:string,id?:string){
  if(id){const parsed=zoneSchema.safeParse((await this.call('/zones/'+id)).result);if(!parsed.success)throw new AppError('invalid_state','Cloudflare returned invalid zone data.');if(!belongs(domain,parsed.data.name))throw new AppError('validation_error','That Cloudflare zone does not contain this domain.');if(parsed.data.status&&parsed.data.status!=='active')throw new AppError('invalid_state','This Cloudflare zone is not active. Complete its nameserver setup first.');return {id:parsed.data.id,name:parsed.data.name};}
  // Prefer the closest managed zone, including delegated subdomains.
  const labels=host(domain).split('.');for(let i=0;i<labels.length-1;i++){const name=labels.slice(i).join('.');const parsed=z.array(zoneSchema).safeParse((await this.call('/zones?name='+encodeURIComponent(name)+'&status=active&per_page=50')).result);if(!parsed.success)throw new AppError('invalid_state','Cloudflare returned invalid zone data.');const exact=parsed.data.filter(z=>host(z.name)===name);if(exact.length>1)throw new AppError('conflict','Multiple zones match this domain. Enter the intended Cloudflare Zone ID.');if(exact[0])return {id:exact[0].id,name:exact[0].name};}
  throw new AppError('not_found','No active Cloudflare zone matches this domain. Check the token zone access or enter its Zone ID.');
 }
 async records(zoneId:string,name:string){
  const result:ProviderRecord[]=[];for(let page=1;page<=10;page++){const response=await this.call(`/zones/${zoneId}/dns_records?name=${encodeURIComponent(name)}&per_page=100&page=${page}`);const parsed=z.array(recordSchema).safeParse(response.result);if(!parsed.success)throw new AppError('invalid_state','Cloudflare returned invalid DNS record data.');result.push(...parsed.data.filter(r=>host(r.name)===host(name)));const pages=response.result_info?.total_pages??1;if(page>=pages)return result;if(page===10)throw new AppError('invalid_state','This hostname has too many DNS records for automatic setup. Use manual setup.');}return result;
 }
 async create(zoneId:string,record:RecordPlan){await this.call(`/zones/${zoneId}/dns_records`,'POST',{type:record.type,name:record.host,content:record.value,ttl:1,...(record.type==='MX'?{priority:record.priority??10}:{}),comment:'Morphmailer '+record.purpose});}
}

/** GoDaddy v1 PATCH appends records; PUT would replace records and is deliberately unused. */
class GoDaddy {
 private readonly deadline=Date.now()+90000;
 constructor(private key:string,private secret:string,private fetcher:typeof fetch){}
 async call(path:string,method:'GET'|'PATCH'='GET',body?:unknown):Promise<unknown>{
  const remaining=this.deadline-Date.now();if(remaining<=0)throw new AppError('invalid_state','GoDaddy setup timed out. Preview the records again to check which records were added.');
  let response:Response;try{response=await this.fetcher('https://api.godaddy.com/v1'+path,{method,headers:{Authorization:`sso-key ${this.key}:${this.secret}`,'Content-Type':'application/json',Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(Math.min(10000,remaining)),...(body?{body:JSON.stringify(body)}:{})});}catch{throw new AppError('invalid_state','Could not reach GoDaddy. Preview the records again before retrying.');}
  if(response.status===401||response.status===403)throw new AppError('forbidden','GoDaddy denied access. Check your production API key and secret, domain ownership and account API eligibility. Use manual DNS setup if API access is unavailable.');
  if(response.status===404)throw new AppError('not_found','Domain not found in this GoDaddy account.');
  if(response.status===429)throw new AppError('rate_limited','GoDaddy is rate limiting requests. Wait and preview the records again.');
  if(!response.ok)throw new AppError('invalid_state','GoDaddy could not complete this request. Preview the records again or use manual setup.');
  if(method==='PATCH')return null;
  try{return await response.json();}catch{throw new AppError('invalid_state','GoDaddy returned an invalid response. Use manual setup or try again.');}
 }
 async zone(domain:string,id?:string){
  let candidates=id?[host(id)]:[];
  if(!id){let marker:string|undefined;const names:string[]=[];for(let page=0;page<10;page++){const response=await this.call('/domains?limit=1000'+(marker?'&marker='+encodeURIComponent(marker):''));const parsed=z.array(z.object({domain:z.string()})).safeParse(response);if(!parsed.success)throw new AppError('invalid_state','GoDaddy returned invalid domain data.');names.push(...parsed.data.map(d=>host(d.domain)));if(parsed.data.length<1000)break;if(page===9)throw new AppError('invalid_state','This account has too many domains for automatic discovery. Enter the root domain.');marker=parsed.data.at(-1)!.domain;}candidates=names.filter(name=>belongs(domain,name)).sort((a,b)=>b.length-a.length);}
  for(const name of candidates){if(!belongs(domain,name))throw new AppError('validation_error','That GoDaddy domain does not contain this sending domain.');
   let response:unknown;try{response=await this.call('/domains/'+encodeURIComponent(name));}catch(error){if(isAppError(error)&&error.code==='not_found'&&!id)continue;throw error;}
   const parsed=z.object({domain:z.string(),status:z.string().optional(),nameServers:z.array(z.string()).optional()}).safeParse(response);if(!parsed.success||host(parsed.data.domain)!==name)throw new AppError('invalid_state','GoDaddy returned invalid domain data.');
   if(parsed.data.status&&parsed.data.status!=='ACTIVE')throw new AppError('invalid_state','This GoDaddy domain is not active. Complete domain setup first.');
   if(parsed.data.nameServers?.length&&parsed.data.nameServers.some(n=>!host(n).endsWith('.domaincontrol.com')))throw new AppError('invalid_state','This domain uses another DNS provider. Add records with the provider hosting its nameservers.');
   return {id:name,name};
  }throw new AppError('not_found','No matching domain was found in this GoDaddy account. Enter the root domain or use manual setup.');
 }
 async records(zoneId:string,name:string){
  const found:ProviderRecord[]=[];for(let offset=0;offset<10000;offset+=1000){const response=await this.call(`/domains/${encodeURIComponent(zoneId)}/records?limit=1000&offset=${offset}`),parsed=z.array(z.object({type:z.string(),name:z.string(),data:z.string(),priority:z.number().optional()})).safeParse(response);if(!parsed.success)throw new AppError('invalid_state','GoDaddy returned invalid DNS records.');
   for(const record of parsed.data){const absolute=record.name==='@'?zoneId:host(record.name)+'.'+zoneId;if(host(absolute)===host(name))found.push({id:hash(record),type:record.type,name:absolute,content:record.data,...(record.priority!==undefined?{priority:record.priority}:{})});}
   if(parsed.data.length<1000)return found;
  }throw new AppError('invalid_state','This zone has too many records for automatic setup. Use manual setup.');
 }
 async create(zoneId:string,record:RecordPlan){if(!belongs(record.host,zoneId))throw new AppError('validation_error','Record is outside the selected GoDaddy domain.');const relative=host(record.host)===host(zoneId)?'@':host(record.host).slice(0,-(zoneId.length+1));await this.call('/domains/'+encodeURIComponent(zoneId)+'/records','PATCH',[{type:record.type,name:relative,data:record.value,ttl:600,...(record.type==='MX'?{priority:record.priority??10}:{})}]);}
}
function provider(input:Input,fetcher:typeof fetch){return input.provider==='cloudflare'?new Cloudflare(input.api_token,fetcher):new GoDaddy(input.api_key,input.api_secret,fetcher);}

export function classifyDnsRecord(record:Omit<RecordPlan,'status'|'detail'>,existing:ProviderRecord[]):RecordPlan{
 const others=existing.filter(r=>host(r.name)===host(record.host));
 if(others.some(r=>r.type==='CNAME'||r.type==='NS'))return {...record,status:'conflict',detail:'A CNAME or delegated NS record occupies this hostname. Resolve it with your DNS provider.'};
 const sameType=others.filter(r=>r.type===record.type),matches=sameType.filter(r=>record.type==='MX'?host(r.content)===host(record.value)&&(r.priority??0)===(record.priority??0):text(r.content)===text(record.value));
 const relevant=record.purpose==='return_path_spf'?sameType.filter(r=>/^v=spf1(?:\s|$)/i.test(text(r.content))):record.purpose==='dmarc'?sameType.filter(r=>/^v=DMARC1(?:;|\s|$)/i.test(text(r.content))):sameType;
 if(matches.length===1&&relevant.length===1)return {...record,status:'existing',detail:'This record is already present.'};
 if(relevant.length)return {...record,status:'conflict',detail:record.purpose==='dmarc'?'An existing DMARC policy is present. It will not be changed.':'Different or duplicate records are present. They will not be changed.'};
 return {...record,status:'create',detail:'This missing record can be added.'};
}
function desired(domain:DomainWithRecords,input:Input):Array<Omit<RecordPlan,'status'|'detail'>>{return domain.records.filter(r=>r.purpose!=='dmarc'||input.include_dmarc).map(r=>{if(r.type!=='TXT'&&r.type!=='MX')throw new AppError('validation_error','This DNS record type requires manual setup.');return {purpose:r.purpose,type:r.type,host:r.host,value:r.value,priority:r.priority,required:r.required};});}
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const planBody=z.object({provider:z.enum(['cloudflare','godaddy']),domain:z.string(),org:z.string(),project:z.string(),zone:z.string(),dmarc:z.boolean(),fingerprint:z.string(),expires:z.number()}).strict();
const sign=(body:string,secret:string)=>createHmac('sha256',secret).update('dns-setup-plan:v1:'+body).digest();
function verify(token:string,secret:string){const [body,sig,extra]=token.split('.');if(!body||!sig||extra||!/^[A-Za-z0-9_-]+$/.test(body)||!/^[A-Za-z0-9_-]{43}$/.test(sig))throw new AppError('conflict','DNS preview is invalid. Preview the records again.');const supplied=Buffer.from(sig,'base64url'),expected=sign(body,secret);if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw new AppError('conflict','DNS preview is invalid. Preview the records again.');try{return planBody.parse(JSON.parse(Buffer.from(body,'base64url').toString('utf8')));}catch{throw new AppError('conflict','DNS preview is invalid. Preview the records again.');}}
async function plan(domain:DomainWithRecords,input:Input,client:Cloudflare|GoDaddy){if(domain.domain.status==='disabled')throw new AppError('invalid_state','This domain is disabled. Use an active domain for automatic DNS setup.');const zone=await client.zone(domain.domain.name,input.zone_id),records:RecordPlan[]=[];for(const record of desired(domain,input)){if(!belongs(record.host,zone.name))throw new AppError('validation_error','A required record is outside this DNS zone. Use manual setup.');records.push(classifyDnsRecord(record,await client.records(zone.id,record.host)));}return {zone,records};}
export async function previewDnsSetup(domain:DomainWithRecords,input:Input,secret:string,fetcher:typeof fetch=fetch):Promise<z.infer<typeof dnsSetupPreview>>{
 const {zone,records}=await plan(domain,input,provider(input,fetcher)),expires=Date.now()+10*60000;
 const body=Buffer.from(JSON.stringify({provider:input.provider,domain:domain.domain.id,org:domain.domain.orgId,project:domain.domain.projectId,zone:zone.id,dmarc:input.include_dmarc,fingerprint:hash(records),expires})).toString('base64url');
 return {provider:input.provider,domain_id:domain.domain.id,zone,records,plan_token:body+'.'+sign(body,secret).toString('base64url'),expires_at:new Date(expires).toISOString()};
}
export async function applyDnsSetup(domain:DomainWithRecords,input:Input&{plan_token:string},secret:string,fetcher:typeof fetch=fetch):Promise<z.infer<typeof dnsSetupResult>>{
 const token=verify(input.plan_token,secret);if(token.provider!==input.provider||token.expires<Date.now()||token.domain!==domain.domain.id||token.org!==domain.domain.orgId||token.project!==domain.domain.projectId||token.dmarc!==input.include_dmarc)throw new AppError('conflict','DNS preview expired or changed. Preview the records again.');
 const client=provider(input,fetcher),current=await plan(domain,input,client);if(token.zone!==current.zone.id||token.fingerprint!==hash(current.records))throw new AppError('conflict','DNS records changed after the preview. Preview them again before applying.');
 const records:z.infer<typeof dnsSetupResult>['records']=[];for(const record of current.records){if(record.status!=='create'){records.push({...record,outcome:record.status});continue;}
  try{const latest=classifyDnsRecord(record,await client.records(current.zone.id,record.host));if(latest.status!=='create'){records.push({...latest,outcome:latest.status});continue;}await client.create(current.zone.id,record);records.push({...record,outcome:'created',detail:'Record added to your DNS provider. DNS propagation may take a few minutes.'});}
  catch(error){records.push({...record,outcome:'failed',detail:isAppError(error)?error.message:'Record could not be added. Preview the records again.'});}
 }
 return {zone:current.zone,records,created:records.filter(r=>r.outcome==='created').length,existing:records.filter(r=>r.outcome==='existing').length,conflicts:records.filter(r=>r.outcome==='conflict').length,failed:records.filter(r=>r.outcome==='failed').length};
}
