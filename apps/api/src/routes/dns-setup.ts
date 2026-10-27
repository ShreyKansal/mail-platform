import {randomUUID} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import type {ZodTypeProvider} from 'fastify-type-provider-zod';
import {dnsSetupRequest,dnsSetupApplyRequest,dnsSetupPreview,dnsSetupResult,uuidParam} from '@mp/contracts';
import {loadDomain,previewDnsSetup,applyDnsSetup,writeAudit} from '@mp/core';
import {AppError} from '@mp/shared';
import {actorOf,principalOf,type AppDeps,type Principal} from '../context';

function authorizeDomain(p:Principal,id:string){if(p.kind==='api_key'&&p.restrictDomainId&&p.restrictDomainId!==id)throw new AppError('sender_not_authorized','This API key is restricted to a different domain.');}
export function dnsSetupRoutes(app:FastifyInstance,deps:AppDeps){
 const r=app.withTypeProvider<ZodTypeProvider>(),config={permission:'domains:manage' as const},tags=['Domains'];
 r.post('/v1/domains/:id/dns-setup/preview',{config,bodyLimit:8192,schema:{tags,summary:'Preview automatic provider DNS setup',params:uuidParam,body:dnsSetupRequest,response:{200:dnsSetupPreview}}},async req=>{
  const p=principalOf(req.principal);authorizeDomain(p,req.params.id);
  const domain=await req.tenant(tx=>loadDomain(tx,p.orgId,req.params.id));if(domain.domain.projectId!==p.projectId)throw new AppError('not_found','Domain not found');
  return previewDnsSetup(domain,req.body,deps.core.verpSecret);
 });
 r.post('/v1/domains/:id/dns-setup/apply',{config,bodyLimit:8192,schema:{tags,summary:'Apply a reviewed provider DNS setup plan',params:uuidParam,body:dnsSetupApplyRequest,response:{200:dnsSetupResult}}},async req=>{
  const p=principalOf(req.principal);authorizeDomain(p,req.params.id);
  const domain=await req.tenant(tx=>loadDomain(tx,p.orgId,req.params.id));if(domain.domain.projectId!==p.projectId)throw new AppError('not_found','Domain not found');
  const lockKey='dns-setup:'+p.orgId+':'+req.params.id,nonce=randomUUID();
  // Fail closed if coordination is unavailable. No provider writes before obtaining this lock.
  let acquired;try{acquired=await deps.redis.set(lockKey,nonce,'EX',180,'NX');}catch{throw new AppError('invalid_state','Automatic DNS setup is temporarily unavailable. Try again shortly.');}
  if(acquired!=='OK')throw new AppError('conflict','DNS setup is already running for this domain. Wait for it to finish and preview again.');
  try{
   const latest=await req.tenant(tx=>loadDomain(tx,p.orgId,req.params.id));if(latest.domain.projectId!==p.projectId)throw new AppError('not_found','Domain not found');
   await req.tenant(tx=>writeAudit(tx,{orgId:p.orgId,actor:actorOf(p),action:'domain.dns_setup_started',targetType:'domain',targetId:req.params.id,requestId:req.id,metadata:{provider:req.body.provider,include_dmarc:req.body.include_dmarc}}));
   const result=await applyDnsSetup(latest,req.body,deps.core.verpSecret);
   await req.tenant(tx=>writeAudit(tx,{orgId:p.orgId,actor:actorOf(p),action:'domain.dns_setup_finished',targetType:'domain',targetId:req.params.id,requestId:req.id,metadata:{provider:req.body.provider,created:result.created,existing:result.existing,conflicts:result.conflicts,failed:result.failed}}));
   return result;
  }finally{await deps.redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",1,lockKey,nonce).catch(()=>undefined);}
 });
}
