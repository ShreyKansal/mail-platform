import type {FastifyInstance} from 'fastify';
import type {ZodTypeProvider} from 'fastify-type-provider-zod';
import {z} from 'zod';
import {broadcastCreate,broadcastUpdate,broadcastSend,broadcastView,broadcastListView,broadcastStatus,listOf,paginationQuery,uuidParam} from '@mp/contracts';
import {broadcasts,broadcastRecipients,contacts,emailRecipients,and,eq,desc,inArray,sql,getTableColumns,type Tx} from '@mp/database';
import {admitEmails,fromApiRequest,findSendingDomain,writeAudit,validateBroadcastContent,audienceWhere,eligibleAudienceWhere,verifyUnsubscribeToken,refreshBroadcastCounts,transitionRecipient,type BroadcastRow,type Sender} from '@mp/core';
import {AppError} from '@mp/shared';
import {parseMailbox,domainOf} from '@mp/mail-protocol';
import {actorOf,principalOf,type AppDeps,type Principal} from '../context';
import {decodeCursor,page} from '../views';

const metadataView=(b:Omit<BroadcastRow,'html'|'text'|'contactIds'>)=>({id:b.id,name:b.name,status:b.status,from:b.from,reply_to:b.replyTo,subject:b.subject,audience:b.audience,revision:b.revision,scheduled_at:b.scheduledAt?.toISOString()??null,created_at:b.createdAt.toISOString(),updated_at:b.updatedAt.toISOString(),completed_at:b.completedAt?.toISOString()??null,error:b.error,recipient_count:b.recipientCount,processed_count:b.processedCount,skipped_count:b.skippedCount,failed_count:b.failedCount});
export const broadcastToView=(b:BroadcastRow)=>({...metadataView(b),html:b.html,text:b.text,contact_ids:b.contactIds});
const {html:_html,text:_text,contactIds:_contactIds,...summaryColumns}=getTableColumns(broadcasts);
const senderOf=(p:Principal):Sender=>({orgId:p.orgId,projectId:p.projectId,actor:actorOf(p),source:'api',restrictDomainId:p.kind==='api_key'?p.restrictDomainId:null,...(p.kind==='api_key'?{apiKeyId:p.keyId}:{})});
const senderSnapshot=(p:Principal)=>({type:p.kind==='user'?'user' as const:'api_key' as const,id:p.kind==='user'?p.userId:p.keyId,restrictDomainId:p.kind==='api_key'?p.restrictDomainId:null});
function unsubscribePage(confirmed:boolean,dashboardOrigin:string){
  const font=new URL('/fonts/InterVariable.woff2',dashboardOrigin).href;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${confirmed?'Unsubscribed':'Unsubscribe'}</title><style>@font-face{font-family:Inter;font-style:normal;font-weight:100 900;src:url(${JSON.stringify(font)}) format('woff2')}*{box-sizing:border-box}body{margin:0;background:#fff;color:#18181b;font:14px/1.6 Inter,sans-serif;display:grid;place-items:center;min-height:100dvh;padding:24px}main{width:100%;max-width:460px;border:1px solid #e5e5e8;border-radius:12px;padding:32px}h1{font-size:24px;line-height:1.3;letter-spacing:-.02em;margin:0 0 16px}p{color:#62646b;margin:0 0 24px}button{font:500 14px Inter,sans-serif;padding:10px 16px;border:0;border-radius:6px;background:#2855d9;color:#fff;cursor:pointer}button:focus-visible{outline:3px solid #18181b;outline-offset:3px}</style><main><h1>${confirmed?'You are unsubscribed':'Unsubscribe from marketing emails?'}</h1><p>${confirmed?'You will no longer receive marketing emails from this workspace. Transactional emails are unaffected.':'This stops marketing emails from this workspace. Transactional emails are unaffected.'}</p>${confirmed?'':'<form method="post"><button type="submit">Unsubscribe</button></form>'}</main></html>`;
}
async function find(tx:Tx,p:Principal,id:string,lock=false){
  const query=tx.select().from(broadcasts).where(and(eq(broadcasts.id,id),eq(broadcasts.orgId,p.orgId),eq(broadcasts.projectId,p.projectId)));
  const [b]=await(lock?query.for('update'):query);if(!b)throw new AppError('not_found','Broadcast not found');return b;
}
function draftOnly(b:BroadcastRow,revision?:number){if(b.status!=='draft')throw new AppError('invalid_state','Only drafts can be edited or sent. Duplicate this broadcast to start another.');if(revision!==undefined&&revision!==b.revision)throw new AppError('conflict','This broadcast changed. Reload before saving or sending.');}
async function checkSender(tx:Tx,p:Principal,b:BroadcastRow){
  validateBroadcastContent(b);
  let from;try{from=parseMailbox(b.from);if(b.replyTo)parseMailbox(b.replyTo);}catch{throw new AppError('validation_error','Enter valid sender and reply-to addresses.',[{path:'from',message:'Enter a valid sender address.'}]);}
  const domain=await findSendingDomain(tx,p.orgId,p.projectId,domainOf(from.address));
  if(!domain)throw new AppError('domain_not_verified','Verify the sender domain before sending this broadcast.');
  if(p.kind==='api_key'&&p.restrictDomainId&&p.restrictDomainId!==domain.id)throw new AppError('sender_not_authorized','This key cannot send from that domain.');
}
async function counts(tx:Tx,b:BroadcastRow){
  const [all]=await tx.select({n:sql<number>`count(*)::int`}).from(contacts).where(audienceWhere(b));
  const [eligible]=await tx.select({n:sql<number>`count(*)::int`}).from(contacts).where(eligibleAudienceWhere(b));
  return {eligible:eligible?.n??0,excluded:(b.audience==='selected'?b.contactIds.length:all?.n??0)-(eligible?.n??0)};
}

export function broadcastRoutes(app:FastifyInstance,deps:AppDeps){
  const r=app.withTypeProvider<ZodTypeProvider>(),tags=['Broadcasts'];
  const read={permission:'broadcasts:read' as const},manage={permission:'broadcasts:manage' as const},send={permission:'broadcasts:send' as const};
  r.get('/v1/broadcasts',{config:read,schema:{tags,querystring:paginationQuery.extend({search:z.string().max(200).optional(),status:broadcastStatus.optional()}),response:{200:listOf(broadcastListView)}}},async req=>{
    const p=principalOf(req.principal),cursor=decodeCursor(req.query.cursor);
    return req.tenant(async tx=>page(await tx.select({...summaryColumns,selectedContactCount:sql<number>`jsonb_array_length(${broadcasts.contactIds})`}).from(broadcasts).where(and(eq(broadcasts.orgId,p.orgId),eq(broadcasts.projectId,p.projectId),req.query.status?eq(broadcasts.status,req.query.status):undefined,req.query.search?sql`strpos(lower(${broadcasts.name}),lower(${req.query.search}))>0`:undefined,cursor?sql`(date_trunc('milliseconds',${broadcasts.createdAt}),${broadcasts.id})<(${cursor.t.toISOString()}::timestamptz,${cursor.id}::uuid)`:undefined)).orderBy(sql`date_trunc('milliseconds',${broadcasts.createdAt}) desc`,desc(broadcasts.id)).limit(req.query.limit+1),req.query.limit,b=>({...metadataView(b),selected_contact_count:b.selectedContactCount})));
  });
  r.post('/v1/broadcasts',{config:manage,schema:{tags,body:broadcastCreate,response:{201:broadcastView}}},async(req,reply)=>{
    const p=principalOf(req.principal);return reply.status(201).send(await req.tenant(async tx=>{const [b]=await tx.insert(broadcasts).values({orgId:p.orgId,projectId:p.projectId,name:req.body.name}).returning();await writeAudit(tx,{orgId:p.orgId,actor:actorOf(p),action:'broadcast.created',targetType:'broadcast',targetId:b!.id});return broadcastToView(b!);}));
  });
  r.get('/v1/broadcasts/:id',{config:read,schema:{tags,params:uuidParam,response:{200:broadcastView}}},async req=>{
    const p=principalOf(req.principal);return req.tenant(async tx=>{const b=await find(tx,p,req.params.id);const states=await tx.select({state:emailRecipients.state,n:sql<number>`count(*)::int`}).from(broadcastRecipients).innerJoin(emailRecipients,eq(emailRecipients.emailId,broadcastRecipients.emailId)).where(and(eq(broadcastRecipients.broadcastId,b.id),eq(broadcastRecipients.orgId,p.orgId),eq(broadcastRecipients.projectId,p.projectId))).groupBy(emailRecipients.state);return {...broadcastToView(b),stats:{recipient_states:Object.fromEntries(states.map(s=>[s.state,s.n]))}};});
  });
  r.get('/v1/broadcasts/:id/audience',{config:read,schema:{tags,params:uuidParam,response:{200:z.object({eligible:z.number(),excluded:z.number()})}}},async req=>{const p=principalOf(req.principal);return req.tenant(async tx=>counts(tx,await find(tx,p,req.params.id)));});
  r.patch('/v1/broadcasts/:id',{config:manage,schema:{tags,params:uuidParam,body:broadcastUpdate,response:{200:broadcastView}}},async req=>{
    const p=principalOf(req.principal);return req.tenant(async tx=>{const b=await find(tx,p,req.params.id,true);draftOnly(b,req.body.expected_revision);const v=req.body;
      const [updated]=await tx.update(broadcasts).set({name:v.name,from:v.from.trim(),replyTo:v.reply_to?.trim()||null,subject:v.subject,html:v.html,text:v.text,audience:v.audience,contactIds:v.audience==='selected'?v.contact_ids:[],revision:b.revision+1,updatedAt:new Date()}).where(eq(broadcasts.id,b.id)).returning();
      await writeAudit(tx,{orgId:p.orgId,actor:actorOf(p),action:'broadcast.updated',targetType:'broadcast',targetId:b.id});return broadcastToView(updated!);});
  });
  r.post('/v1/broadcasts/:id/duplicate',{config:manage,schema:{tags,params:uuidParam,response:{201:broadcastView}}},async(req,reply)=>{const p=principalOf(req.principal);return reply.status(201).send(await req.tenant(async tx=>{const b=await find(tx,p,req.params.id);const [copy]=await tx.insert(broadcasts).values({orgId:p.orgId,projectId:p.projectId,name:(b.name+' (copy)').slice(0,128),from:b.from,replyTo:b.replyTo,subject:b.subject,html:b.html,text:b.text,audience:b.audience,contactIds:b.contactIds}).returning();await writeAudit(tx,{orgId:p.orgId,actor:actorOf(p),action:'broadcast.duplicated',targetType:'broadcast',targetId:copy!.id,metadata:{source_id:b.id}});return broadcastToView(copy!);}));});
  r.delete('/v1/broadcasts/:id',{config:manage,schema:{tags,params:uuidParam}},async(req,reply)=>{const p=principalOf(req.principal);await req.tenant(async tx=>{const b=await find(tx,p,req.params.id,true);draftOnly(b);await tx.delete(broadcasts).where(eq(broadcasts.id,b.id));await writeAudit(tx,{orgId:p.orgId,actor:actorOf(p),action:'broadcast.deleted',targetType:'broadcast',targetId:b.id});});return reply.status(204).send();});
  r.post('/v1/broadcasts/:id/send',{config:send,schema:{tags,params:uuidParam,body:broadcastSend,response:{202:broadcastView}}},async(req,reply)=>{
    const p=principalOf(req.principal);return reply.status(202).send(await req.tenant(async tx=>{
      if(deps.config.NODE_ENV==='production'&&new URL(deps.config.PUBLIC_API_URL).protocol!=='https:')throw new AppError('invalid_state','Broadcast sending requires an HTTPS public API URL.');
      const b=await find(tx,p,req.params.id,true);draftOnly(b,req.body.expected_revision);await checkSender(tx,p,b);
      const scheduled=req.body.scheduled_at?new Date(req.body.scheduled_at):null;
      if(scheduled&&(scheduled.getTime()<=Date.now()||scheduled.getTime()>Date.now()+30*86400000))throw new AppError('validation_error','Choose a future time within 30 days.',[{path:'scheduled_at',message:'Choose a future time within 30 days.'}]);
      // A single INSERT SELECT freezes the eligible audience under one statement snapshot.
      await tx.execute(sql`insert into broadcast_recipients(broadcast_id,org_id,project_id,contact_id,email)
        select ${b.id}::uuid,${p.orgId}::uuid,${p.projectId}::uuid,${contacts.id},${contacts.email} from contacts where ${eligibleAudienceWhere(b)}`);
      const [size]=await tx.select({n:sql<number>`count(*)::int`}).from(broadcastRecipients).where(eq(broadcastRecipients.broadcastId,b.id));
      if(!size?.n)throw new AppError('validation_error','No subscribed, unsuppressed contacts match this audience.');
      const [updated]=await tx.update(broadcasts).set({status:scheduled?'scheduled':'sending',scheduledAt:scheduled,nextAttemptAt:scheduled??new Date(),recipientCount:size.n,revision:b.revision+1,publicApiUrl:deps.config.PUBLIC_API_URL,sender:{type:p.kind==='user'?'user':'api_key',id:p.kind==='user'?p.userId:p.keyId,restrictDomainId:p.kind==='api_key'?p.restrictDomainId:null},error:null,updatedAt:new Date()}).where(eq(broadcasts.id,b.id)).returning();
      await writeAudit(tx,{orgId:p.orgId,actor:actorOf(p),action:scheduled?'broadcast.scheduled':'broadcast.started',targetType:'broadcast',targetId:b.id,metadata:{recipients:size.n}});return broadcastToView(updated!);
    }));
  });
  r.post('/v1/broadcasts/:id/test',{config:send,schema:{tags,params:uuidParam,body:z.object({to:z.string().email().max(320)}).strict(),response:{202:z.object({id:z.string().uuid()})}}},async(req,reply)=>{
    const p=principalOf(req.principal);return reply.status(202).send(await req.tenant(async tx=>{const b=await find(tx,p,req.params.id);await checkSender(tx,p,b);const admitted=await admitEmails(tx,senderOf(p),[fromApiRequest({from:b.from,to:req.body.to,subject:b.subject,...(b.html?{html:b.html}:{}),...(b.text?{text:b.text}:{}),...(b.replyTo?{reply_to:b.replyTo}:{})})],{localUnlimitedSending:deps.core.localUnlimitedSending});return {id:admitted.ids[0]!};}));
  });
  r.post('/v1/broadcasts/:id/cancel',{config:send,schema:{tags,params:uuidParam,response:{200:broadcastView}}},async req=>{
    const p=principalOf(req.principal);return req.tenant(async tx=>{const b=await find(tx,p,req.params.id,true);if(b.status==='cancelled')return broadcastToView(b);if(!['scheduled','sending','failed','completed'].includes(b.status))throw new AppError('invalid_state','This broadcast cannot be cancelled.');
      // Dispatcher re-checks campaign cancellation before handoff; already dispatched mail cannot be recalled.
      const [updated]=await tx.update(broadcasts).set({status:'cancelled',error:null,updatedAt:new Date()}).where(eq(broadcasts.id,b.id)).returning();
      const pending=await tx.select({id:emailRecipients.id}).from(emailRecipients).innerJoin(broadcastRecipients,eq(broadcastRecipients.emailId,emailRecipients.emailId)).where(and(eq(broadcastRecipients.broadcastId,b.id),inArray(emailRecipients.state,['QUEUED','SCHEDULED','RETRYING']))).limit(500);
      for(const row of pending)await transitionRecipient(tx,{recipientId:row.id,to:'CANCELLED',cause:'broadcast-cancel:'+b.id,occurredAt:new Date(),eventData:{broadcast_id:b.id}});
      await tx.update(broadcastRecipients).set({status:'skipped',error:'Broadcast cancelled.'}).where(and(eq(broadcastRecipients.broadcastId,b.id),eq(broadcastRecipients.status,'pending')));await refreshBroadcastCounts(tx,b.id);
      await writeAudit(tx,{orgId:p.orgId,actor:actorOf(p),action:'broadcast.cancelled',targetType:'broadcast',targetId:b.id});return broadcastToView(await find(tx,p,b.id));});
  });
  r.post('/v1/broadcasts/:id/retry',{config:send,schema:{tags,params:uuidParam,response:{200:broadcastView}}},async req=>{const p=principalOf(req.principal);return req.tenant(async tx=>{const b=await find(tx,p,req.params.id,true);if(b.status!=='failed')throw new AppError('invalid_state','Only a failed broadcast can be resumed.');await checkSender(tx,p,b);const [updated]=await tx.update(broadcasts).set({status:'sending',error:null,nextAttemptAt:new Date(),updatedAt:new Date(),sender:senderSnapshot(p),publicApiUrl:deps.config.PUBLIC_API_URL}).where(eq(broadcasts.id,b.id)).returning();await writeAudit(tx,{orgId:p.orgId,actor:actorOf(p),action:'broadcast.resumed',targetType:'broadcast',targetId:b.id});return broadcastToView(updated!);});});

  // Capability URL: GET only confirms; POST performs an idempotent marketing unsubscribe.
  if(!app.hasContentTypeParser('application/x-www-form-urlencoded'))app.addContentTypeParser('application/x-www-form-urlencoded',{parseAs:'string'},(_req,body,done)=>done(null,body));
  if(!app.hasContentTypeParser('multipart/form-data'))app.addContentTypeParser('multipart/form-data',{parseAs:'string'},(_req,body,done)=>done(null,body));
  const unsubscribeParams=z.object({token:z.string().max(1000)});
  r.get('/v1/broadcast-unsubscribe/:token',{config:{public:true},schema:{hide:true,params:unsubscribeParams}},async(req,reply)=>{
    verifyUnsubscribeToken(req.params.token,deps.core.verpSecret);return reply.header('referrer-policy','no-referrer').header('content-security-policy',`default-src 'none'; style-src 'unsafe-inline'; font-src ${new URL(deps.config.DASHBOARD_ORIGIN).origin}; form-action 'self'; frame-ancestors 'none'`).type('text/html').send(unsubscribePage(false,deps.config.DASHBOARD_ORIGIN));
  });
  r.post('/v1/broadcast-unsubscribe/:token',{bodyLimit:4096,config:{public:true},schema:{hide:true,params:unsubscribeParams}},async(req,reply)=>{
    const t=verifyUnsubscribeToken(req.params.token,deps.core.verpSecret);await deps.dbs.service.update(contacts).set({unsubscribed:true,revision:sql`${contacts.revision}+1`,updatedAt:new Date()}).where(and(eq(contacts.id,t.c),eq(contacts.orgId,t.o),eq(contacts.projectId,t.p),eq(contacts.unsubscribed,false)));
    return reply.header('referrer-policy','no-referrer').header('content-security-policy',`default-src 'none'; style-src 'unsafe-inline'; font-src ${new URL(deps.config.DASHBOARD_ORIGIN).origin}; frame-ancestors 'none'`).type('text/html').send(unsubscribePage(true,deps.config.DASHBOARD_ORIGIN));
  });
}
