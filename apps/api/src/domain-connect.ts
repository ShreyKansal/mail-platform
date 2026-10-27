import { createPrivateKey, randomBytes, sign } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { AppError } from '@mp/shared';
import type { DomainWithRecords } from '@mp/core';

export interface DomainConnectConfig { DOMAIN_CONNECT_PROVIDER_ID?:string; DOMAIN_CONNECT_SERVICE_ID?:string; DOMAIN_CONNECT_PRIVATE_KEY?:string; DOMAIN_CONNECT_KEY_LABEL?:string; DOMAIN_CONNECT_APPROVED?:boolean; DASHBOARD_ORIGIN:string; }
export function domainConnectReady(config:DomainConnectConfig) {
  if(!config.DOMAIN_CONNECT_APPROVED||!config.DOMAIN_CONNECT_PROVIDER_ID||!config.DOMAIN_CONNECT_SERVICE_ID||!config.DOMAIN_CONNECT_PRIVATE_KEY||!config.DOMAIN_CONNECT_KEY_LABEL)return false;
  const url=new URL(config.DASHBOARD_ORIGIN);
  return url.protocol==='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname);
}
export async function goDaddyZone(domain:string,lookup?: (name:string)=>Promise<string[]>) {
  const resolver=new Resolver({timeout:2500,tries:1});
  const read=lookup??((name:string)=>resolver.resolveNs(name));
  const labels=domain.split('.');
  for(let index=0;index<Math.min(6,labels.length-1);index++){
    const zone=labels.slice(index).join('.');
    let names:string[];try{names=await read(zone);}catch{continue;}
    if(names.length&&names.every(name=>name.toLowerCase().replace(/\.$/,'').endsWith('.domaincontrol.com')))return zone;
    if(names.length)throw new AppError('invalid_state','This domain uses another DNS provider. Use manual DNS setup or connect its DNS provider.');
  }
  throw new AppError('invalid_state','GoDaddy DNS could not be detected for this domain. Use manual DNS setup.');
}
export async function assertGoDaddyTemplate(config:DomainConnectConfig,fetcher:typeof fetch=fetch){
  let response:Response;
  try{response=await fetcher(`https://api.domainconnect.godaddy.com/v2/domainTemplates/providers/${encodeURIComponent(config.DOMAIN_CONNECT_PROVIDER_ID!)}/services/${encodeURIComponent(config.DOMAIN_CONNECT_SERVICE_ID!)}`,{redirect:'error',signal:AbortSignal.timeout(5000)});}catch{throw new AppError('invalid_state','GoDaddy could not confirm Domain Connect support. Try again or use manual setup.');}
  if(!response.ok)throw new AppError('invalid_state','GoDaddy has not enabled this service template. Use manual setup until provider onboarding is complete.');
}
export function domainConnectUrl(domain:DomainWithRecords,zone:string,config:DomainConnectConfig,state:string) {
  if(!domainConnectReady(config))throw new AppError('invalid_state','GoDaddy Domain Connect is not enabled for this workspace yet. Use manual DNS setup.');
  if(domain.domain.status==='disabled')throw new AppError('invalid_state','This domain is disabled.');
  const relative=(name:string)=>{
    const host=name.toLowerCase().replace(/\.$/,'');
    if(host===zone)return '@';
    if(!host.endsWith('.'+zone))throw new AppError('invalid_state','DNS records do not belong to this zone.');
    return host.slice(0,-zone.length-1);
  };
  const callback=new URL(`/domains/${domain.domain.id}`,config.DASHBOARD_ORIGIN);
  callback.searchParams.set('domain_connect','returned');
  const query=new URLSearchParams({domain:zone,redirect_uri:callback.href,state});
  const variables={ownership:['ownershipHost','ownershipValue'],dkim:['dkimHost','dkimValue'],return_path_mx:['returnMxHost','returnMxValue'],return_path_spf:['returnSpfHost','returnSpfValue']} as const;
  for(const [purpose,[hostKey,valueKey]] of Object.entries(variables)){
    const record=domain.records.find(record=>record.purpose===purpose);
    if(!record)throw new AppError('invalid_state','Expected DNS records are missing. Use manual setup.');
    query.set(hostKey,relative(record.host));query.set(valueKey,record.value);
    if(purpose==='return_path_mx')query.set('returnMxPriority',String(record.priority??10));
  }
  let signature:string;
  try{const key=createPrivateKey(config.DOMAIN_CONNECT_PRIVATE_KEY!.replace(/\\n/g,'\n'));if(key.asymmetricKeyType!=='rsa'||(key.asymmetricKeyDetails?.modulusLength??0)<2048)throw Error();signature=sign('RSA-SHA256',Buffer.from(query.toString()),key).toString('base64');}
  catch{throw new AppError('invalid_state','Domain Connect signing is not configured correctly. Use manual DNS setup.');}
  query.set('key',config.DOMAIN_CONNECT_KEY_LABEL!);query.set('sig',signature);
  return `https://domainconnect.godaddy.com/v2/domainTemplates/providers/${encodeURIComponent(config.DOMAIN_CONNECT_PROVIDER_ID!)}/services/${encodeURIComponent(config.DOMAIN_CONNECT_SERVICE_ID!)}/apply?${query}`;
}
export const newDomainConnectState=()=>randomBytes(32).toString('base64url');
