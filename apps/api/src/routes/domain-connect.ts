import type {FastifyInstance} from 'fastify';
import type {ZodTypeProvider} from 'fastify-type-provider-zod';
import {z} from 'zod';
import {uuidParam} from '@mp/contracts';
import {loadDomain,writeAudit} from '@mp/core';
import {AppError} from '@mp/shared';
import {domainConnectReady,domainConnectUrl,goDaddyZone,newDomainConnectState,assertGoDaddyTemplate} from '../domain-connect';
import {actorOf,principalOf,type AppDeps} from '../context';

export function domainConnectRoutes(app:FastifyInstance,deps:AppDeps){
  const r=app.withTypeProvider<ZodTypeProvider>(),config={permission:'domains:manage' as const,sessionOnly:true},tags=['Domains'];
  r.get('/v1/domains/:id/domain-connect',{config,schema:{tags,params:uuidParam,response:{200:z.object({available:z.boolean(),provider:z.literal('godaddy'),reason:z.string().nullable()})}}},async req=>{
    const p=principalOf(req.principal),domain=await req.tenant(tx=>loadDomain(tx,p.orgId,req.params.id));
    if(domain.domain.projectId!==p.projectId)throw new AppError('not_found','Domain not found');
    const available=domain.domain.status!=='disabled'&&domainConnectReady(deps.config);
    return {available,provider:'godaddy' as const,reason:available?null:'GoDaddy Domain Connect requires the service’s approved template and public callback configuration. Manual DNS setup is available.'};
  });
  r.post('/v1/domains/:id/domain-connect/start',{config,schema:{tags,params:uuidParam,response:{200:z.object({url:z.string().url()})}}},async req=>{
    const p=principalOf(req.principal);if(p.kind!=='user')throw new AppError('forbidden','Sign in to connect your domain.');
    const domain=await req.tenant(tx=>loadDomain(tx,p.orgId,req.params.id));
    if(domain.domain.projectId!==p.projectId)throw new AppError('not_found','Domain not found');
    if(!domainConnectReady(deps.config))throw new AppError('invalid_state','GoDaddy Domain Connect is not enabled yet. Use manual DNS setup.');
    await assertGoDaddyTemplate(deps.config);
    const zone=await goDaddyZone(domain.domain.name),state=newDomainConnectState(),url=domainConnectUrl(domain,zone,deps.config,state);
    // State is bound to the authenticated user and expires after ten minutes.
    await deps.redis.set('domain-connect:'+state,JSON.stringify({org:p.orgId,project:p.projectId,user:p.userId,domain:req.params.id}),'EX',600);
    await req.tenant(tx=>writeAudit(tx,{orgId:p.orgId,actor:actorOf(p),action:'domain.connect_started',targetType:'domain',targetId:req.params.id,requestId:req.id}));
    return {url};
  });
  r.post('/v1/domains/:id/domain-connect/complete',{config,schema:{tags,params:uuidParam,body:z.object({state:z.string().regex(/^[a-zA-Z0-9_-]{43}$/),error:z.string().max(100).optional()}).strict(),response:{200:z.object({status:z.enum(['returned','cancelled'])})}}},async req=>{
    const p=principalOf(req.principal);if(p.kind!=='user')throw new AppError('forbidden','Sign in to continue.');
    const expected=JSON.stringify({org:p.orgId,project:p.projectId,user:p.userId,domain:req.params.id});
    const consumed=await deps.redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then redis.call('del',KEYS[1]); return 1 else return 0 end",1,'domain-connect:'+req.body.state,expected);
    if(consumed!==1)throw new AppError('conflict','This connection session expired or does not belong to you. Start again.');
    const domain=await req.tenant(tx=>loadDomain(tx,p.orgId,req.params.id));if(domain.domain.projectId!==p.projectId)throw new AppError('not_found','Domain not found');
    // A redirect is not proof DNS was changed. The DNS verifier remains authoritative.
    return {status:req.body.error?'cancelled' as const:'returned' as const};
  });
}
