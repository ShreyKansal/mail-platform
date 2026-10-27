import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import pg from 'pg';
import {Redis} from 'ioredis';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {buildApp} from '@mp/api/app';
import {apiEnv} from '@mp/api/config';
import {createCoreConfig,AutomationWorker,unsubscribeToken} from '@mp/core';
import {createDatabases,contacts,domains,organizations,emails,emailContents,emailRecipients,apiKeys,broadcasts,broadcastRecipients,automations,automationRuns,automationSteps,automationVersions,withTenant,eq,and,sql} from '@mp/database';
import {FixtureDnsClient} from '@mp/dns-verification';
import {Dispatcher} from '@mp/mail-worker/dispatcher';
import {createLogger} from '@mp/shared';
import {createAccount,addVerifiedDomain,bearer,sessionHeaders,type Account,type Harness} from '../support/harness';
import {ROOT,TEST_DB,testEnv} from '../support/env';
import {loadAutomationMetrics} from '../../apps/api/src/routes/automation-metrics';

// A fresh, uniquely named DB. Never truncate or migrate the user's working database.
const databaseName='mp_automation_'+randomUUID().replaceAll('-','');
const url=(input:string)=>{const u=new URL(input);u.pathname='/'+databaseName;return u.href;};
const owner=new pg.Client({connectionString:TEST_DB.owner});
let h:Harness,a:Account,b:Account,worker:AutomationWorker,dispatcher:Dispatcher,redis:Redis,created=false;
const rawMessages:Buffer[]=[];
const verified='broadcast-'+randomUUID().slice(0,8)+'.test';
const request=(method:'GET'|'POST'|'PATCH'|'DELETE',path:string,payload?:Record<string,unknown>,account=a)=>h.app.inject({method,url:path,headers:bearer(account.apiKey),...(payload!==undefined?{payload}:{})});
const create=async(name:string)=>{const response=await request('POST','/v1/broadcasts',{name});expect(response.statusCode,response.body).toBe(201);return response.json();};
const save=async(row:{id:string;revision:number},extra:Record<string,unknown>={})=>{const response=await request('PATCH',`/v1/broadcasts/${row.id}`,{expected_revision:row.revision,name:'October news',from:`News <hello@${verified}>`,reply_to:null,subject:'October news',html:'<p>News for subscribers</p>',text:'News for subscribers',audience:'all',contact_ids:[],...extra});expect(response.statusCode,response.body).toBe(200);return response.json();};
const addContact=async(email:string,extra:Record<string,unknown>={},account=a)=>{const response=await request('POST','/v1/contacts',{email,...extra},account);expect(response.statusCode,response.body).toBe(201);return response.json();};

beforeAll(async()=>{
 await owner.connect();await owner.query(`create database "${databaseName}" owner mp_owner`);created=true;
 execFileSync(process.execPath,['--import','tsx',resolve(ROOT,'packages/database/src/migrate.ts')],{env:{...process.env,DATABASE_MIGRATION_URL:url(TEST_DB.owner)},cwd:resolve(ROOT,'packages/database'),stdio:'pipe'});
 const config=apiEnv.parse({...testEnv,DATABASE_URL:url(TEST_DB.app),DATABASE_SERVICE_URL:url(TEST_DB.service)});
 const dbs=createDatabases({appUrl:config.DATABASE_URL,serviceUrl:config.DATABASE_SERVICE_URL,applicationName:'broadcast-tests'}),core=createCoreConfig(config),zone:Harness['zone']={};
 redis=new Redis(config.REDIS_URL,{keyPrefix:databaseName+':'});const dns={platform:core.platform,dns:{txt:(n:string)=>new FixtureDnsClient(zone).txt(n),mx:(n:string)=>new FixtureDnsClient(zone).mx(n),raw:(n:string,t:string)=>new FixtureDnsClient(zone).raw(n,t)}};
 const app=await buildApp({config,dbs,core,redis,dns},{logger:false});h={app,dbs,core,config,zone} as Harness;
 a=await createAccount(h,'broadcast-'+randomUUID().slice(0,8));b=await createAccount(h,'other-'+randomUUID().slice(0,8));await addVerifiedDomain(h,a,verified);
 const log=createLogger('broadcast-tests','silent');worker=new AutomationWorker(dbs.service,core,log);
 dispatcher=new Dispatcher(dbs.service,core,{submit:async(_envelope,raw)=>{rawMessages.push(raw);return {response:'250 2.0.0 Ok: queued as ABC123'};},close(){}},{workerId:'isolated-broadcast-tests',streams:['marketing'],batchSize:100,leaseSeconds:60,maxSubmissionAttempts:3,reconcileGraceSeconds:10},log);
});
afterAll(async()=>{await h?.app.close();await h?.dbs.close();if(redis)await redis.quit();if(created&&/^mp_automation_[a-f0-9]{32}$/.test(databaseName))await owner.query(`drop database "${databaseName}"`);await owner.end();});


const emailNode=(id='email',next:string|null=null)=>({id,type:'email',name:'Welcome',from:'News <hello@'+verified+'>',reply_to:null,subject:'Hello {{contact.first_name}}',html:'<p>{{event.message}}</p>',text:'Hello',next});
const newAutomation=async(nodes:any[],event='customer.created')=>{const c=await request('POST','/v1/automations',{name:'Welcome'});expect(c.statusCode,c.body).toBe(201);const s=await request('PATCH','/v1/automations/'+c.json().id,{expected_revision:1,name:'Welcome',trigger_event:event,entry_node_id:nodes[0]?.id??null,nodes});expect(s.statusCode,s.body).toBe(200);return s.json();};
const publish=async(a:any)=>{const p=await request('POST','/v1/automations/'+a.id+'/publish',{expected_revision:a.revision});expect(p.statusCode,p.body).toBe(200);return p.json();};
const eventFor=async(c:any,event:string,key=randomUUID(),properties:Record<string,unknown>={message:'<script>escaped</script>'})=>{const r=await request('POST','/v1/automation-events',{idempotency_key:key,event,contact_id:c.id,properties});expect(r.statusCode,r.body).toBe(202);return r.json();};
const detail=async(a:any,id:string)=>(await request('GET','/v1/automations/'+a.id+'/runs/'+id)).json();
const due=async(id:string)=>h.dbs.service.update(automationRuns).set({nextAttemptAt:new Date(0)}).where(eq(automationRuns.id,id));

describe('persisted automations',()=>{
 it('uses inclusive UTC calendar boundaries independently of database timezone',async()=>{
  const c=await addContact('metrics-utc@example.test'),flow=await publish(await newAutomation([{id:'wait',type:'delay',name:'Wait',seconds:1,next:null}],'metrics.utc'));
  for(const timestamp of ['2025-12-31T23:59:59.999Z','2026-01-01T00:00:00.000Z','2026-01-01T23:59:59.999Z','2026-01-02T00:00:00.000Z','2026-01-02T01:00:00.000Z']){const event=await eventFor(c,'metrics.utc');await h.dbs.service.update(automationRuns).set({createdAt:new Date(timestamp),status:'completed'}).where(eq(automationRuns.id,event.run_ids[0]));}
  const [row]=await h.dbs.service.select().from(automations).where(eq(automations.id,flow.id));const metrics=await withTenant(h.dbs.app,a.orgId,async tx=>{await tx.execute(sql`set local time zone 'Asia/Kolkata'`);return loadAutomationMetrics(tx,{orgId:a.orgId,projectId:row!.projectId},flow.id,2,new Date('2026-01-02T00:30:00.000Z'));});
  expect(metrics.from).toBe('2026-01-01T00:00:00.000Z');expect(metrics.runs.total).toBe(3);expect(metrics.daily.map(day=>[day.date,day.runs])).toEqual([['2026-01-01',2],['2026-01-02',1]]);expect(metrics.nodes[0]).toMatchObject({node_id:'wait',executions:0});
 });
 it('returns zero-filled UTC metrics for unpublished drafts and enforces read boundaries',async()=>{
  const draft=await newAutomation([emailNode()],'metrics.draft');const response=await request('GET','/v1/automations/'+draft.id+'/metrics');expect(response.statusCode,response.body).toBe(200);const m=response.json();expect(m.version).toBeNull();expect(m.workflow).toBeNull();expect(m.days).toBe(14);expect(m.daily).toHaveLength(14);expect(m.runs.total).toBe(0);expect(m.emails.total).toBe(0);expect(m.nodes).toEqual([]);expect(m.daily.every((day:any)=>day.runs===0&&day.emails===0)).toBe(true);expect(m.from).toMatch(/T00:00:00.000Z$/);
  expect((await request('GET','/v1/automations/'+draft.id+'/metrics',undefined,b)).statusCode).toBe(404);
  const key=await h.app.inject({method:'POST',url:'/v1/api-keys',headers:sessionHeaders(a.cookie),payload:{name:'Sending only metrics denial',scope:'sending_access'}});expect(key.statusCode).toBe(201);expect((await h.app.inject({url:'/v1/automations/'+draft.id+'/metrics',headers:bearer(key.json().token)})).statusCode).toBe(403);
  for(const days of ['0','91','1.5','bad'])expect((await request('GET','/v1/automations/'+draft.id+'/metrics?days='+days)).statusCode).toBe(422);
 });
 it('aggregates all runs for the published version and UTC window without multiplying steps or recipients',async()=>{
  const contact=await addContact('metrics-reader@example.test',{first_name:'Metrics'}),flow=await publish(await newAutomation([emailNode('original')],'metrics.sent'));
  await eventFor(contact,'metrics.sent');await worker.tick();
  const definition={name:'Published metrics',trigger_event:'metrics.sent',entry_node_id:'first',nodes:[emailNode('first','second'),emailNode('second','third'),emailNode('third')]};
  const updated=await request('PATCH','/v1/automations/'+flow.id,{expected_revision:flow.revision,...definition});const published=await publish(updated.json());
  const enrolled=await eventFor(contact,'metrics.sent'),runId=enrolled.run_ids[0];await worker.tick();await worker.tick();await worker.tick();const steps=(await detail(flow,runId)).steps;
  const first=steps.find((s:any)=>s.node_id==='first'),second=steps.find((s:any)=>s.node_id==='second');
  // Duplicate references/recipient rows must not inflate message counts.
  await h.dbs.service.update(automationSteps).set({emailId:first.email_id}).where(and(eq(automationSteps.runId,runId),eq(automationSteps.nodeId,'third')));
  await h.dbs.service.update(emailRecipients).set({state:'REMOTE_ACCEPTED'}).where(eq(emailRecipients.emailId,first.email_id));
  await h.dbs.service.insert(emailRecipients).values({orgId:a.orgId,emailId:first.email_id,kind:'to',address:'another@example.test',addressLower:'another@example.test',stream:'marketing',state:'REMOTE_ACCEPTED'});
  await h.dbs.service.update(emailRecipients).set({state:'MTA_ACCEPTED'}).where(eq(emailRecipients.emailId,second.email_id));
  for(let i=0;i<31;i++){const event=await eventFor(contact,'metrics.sent');await h.dbs.service.update(automationRuns).set({status:i===0?'failed':'completed'}).where(eq(automationRuns.id,event.run_ids[0]));}
  const old=await eventFor(contact,'metrics.sent');await h.dbs.service.update(automationRuns).set({createdAt:new Date(Date.now()-100*86400000)}).where(eq(automationRuns.id,old.run_ids[0]));
  const future=await eventFor(contact,'metrics.sent');await h.dbs.service.update(automationRuns).set({createdAt:new Date(Date.now()+86400000)}).where(eq(automationRuns.id,future.run_ids[0]));
  // Mutable editor content must never replace the published metrics graph.
  await request('PATCH','/v1/automations/'+flow.id,{expected_revision:published.revision,name:'Unpublished changes',trigger_event:'different.draft',entry_node_id:'draft',nodes:[emailNode('draft')]});
  const response=await request('GET','/v1/automations/'+flow.id+'/metrics?days=7');expect(response.statusCode,response.body).toBe(200);const m=response.json();expect(m.version).toBe(2);expect(m.workflow).toEqual(definition);expect(m.daily).toHaveLength(7);expect(m.runs).toMatchObject({total:32,completed:31,failed:1,running:0});expect(m.emails).toMatchObject({total:2,server_accepted:1,pending:1,queued:0});expect(m.nodes.map((n:any)=>[n.node_id,n.executions])).toEqual([['first',1],['second',1],['third',1]]);expect(m.daily.reduce((sum:number,day:any)=>sum+day.runs,0)).toBe(32);expect(m.daily.reduce((sum:number,day:any)=>sum+day.emails,0)).toBe(2);
  // Stop fixture-only pending runs so later worker scenarios remain isolated.
  await h.dbs.service.update(automationRuns).set({status:'cancelled'}).where(and(eq(automationRuns.automationId,flow.id),eq(automationRuns.status,'running')));
 });
 it('validates typed trigger properties and compound branches',async()=>{
  const c=await addContact('auto-schema@example.test',{first_name:'Typed'}),a1=await newAutomation([{id:'check',type:'condition',name:'All conditions',property:'plan',operator:'equals',value:'pro',match:'all',clauses:[{property:'seats',operator:'greater_than',value:3}],yes:'email',no:null},emailNode()],'typed.event');
  const changed=await request('PATCH','/v1/automations/'+a1.id,{expected_revision:a1.revision,name:a1.name,trigger_event:a1.trigger_event,entry_node_id:a1.entry_node_id,nodes:a1.nodes,trigger_schema:[{key:'plan',type:'string',required:true},{key:'seats',type:'number',required:true}]});await publish(changed.json());
  expect((await request('POST','/v1/automation-events',{idempotency_key:randomUUID(),event:'typed.event',contact_id:c.id,properties:{plan:'pro',seats:'5'}})).statusCode).toBe(422);
  const valid=await eventFor(c,'typed.event',randomUUID(),{plan:'pro',seats:5,message:'OK'});await worker.tick();await worker.tick();expect((await detail(a1,valid.run_ids[0])).steps).toHaveLength(2);await dispatcher.tick();rawMessages.length=0;
 });
 it('validates graphs, optimistic drafts and tenant isolation',async()=>{
  const a1=await newAutomation([emailNode('email','email')]);expect((await request('POST','/v1/automations/'+a1.id+'/publish',{expected_revision:2})).statusCode).toBe(422);
  expect((await request('GET','/v1/automations/'+a1.id,undefined,b)).statusCode).toBe(404);
  expect(await withTenant(h.dbs.app,b.orgId,tx=>tx.select().from(automations).where(eq(automations.id,a1.id)))).toHaveLength(0);
  const payload={expected_revision:2,name:'Updated',trigger_event:'one',entry_node_id:'email',nodes:[emailNode()]};const results=await Promise.all([request('PATCH','/v1/automations/'+a1.id,payload),request('PATCH','/v1/automations/'+a1.id,payload)]);expect(results.map(r=>r.statusCode).sort()).toEqual([200,409]);
  const copy=await request('POST','/v1/automations/'+a1.id+'/duplicate');expect(copy.statusCode).toBe(201);expect((await request('DELETE','/v1/automations/'+copy.json().id)).statusCode).toBe(204);
 });
 it('deduplicates concurrent events and worker ticks with immutable published versions',async()=>{
  const c=await addContact('auto-one@example.test',{first_name:'Alice'}),a1=await publish(await newAutomation([emailNode()],'welcome.one')),key=randomUUID();
  const responses=await Promise.all([eventFor(c,'welcome.one',key),eventFor(c,'welcome.one',key)]);expect(responses[0].id).toBe(responses[1].id);expect(responses.filter(r=>r.duplicate)).toHaveLength(1);const run=responses[0].run_ids[0];
  expect((await request('POST','/v1/automation-events',{idempotency_key:key,event:'different',contact_id:c.id,properties:{}})).statusCode).toBe(409);
  const changed=await request('PATCH','/v1/automations/'+a1.id,{expected_revision:a1.revision,name:'Changed draft',trigger_event:'welcome.one',entry_node_id:'email',nodes:[{...emailNode(),subject:'Changed subject'}]});await publish(changed.json());
  await Promise.all([worker.tick(),worker.tick()]);const result=await detail(a1,run);expect(result.status).toBe('completed');expect(result.version).toBe(1);expect(result.steps).toHaveLength(1);const [mail]=await h.dbs.service.select().from(emails).where(eq(emails.id,result.steps[0].email_id));expect(mail!.subject).toBe('Hello Alice');const [content]=await h.dbs.service.select().from(emailContents).where(eq(emailContents.emailId,mail!.id));expect(content!.html).toContain('&lt;script&gt;escaped&lt;/script&gt;');expect(content!.headers['List-Unsubscribe']).toBeTruthy();
  const baseline=rawMessages.length;await dispatcher.tick();expect(rawMessages.length).toBe(baseline+1);
 });
 it('persists delays, branches, pauses and wait-for-event continuations',async()=>{
  const c=await addContact('auto-wait@example.test',{first_name:'Sam'}),a1=await publish(await newAutomation([{id:'delay',type:'delay',name:'Delay',seconds:1,next:'condition'},{id:'condition',type:'condition',name:'Check plan',property:'plan',operator:'equals',value:'pro',yes:'wait',no:null},{id:'wait',type:'wait_for_event',name:'Wait for purchase',event:'purchased',timeout_seconds:60,next:'email',timeout_next:null},emailNode()],'welcome.wait'));
  const e=await eventFor(c,'welcome.wait',randomUUID(),{plan:'pro',message:'Hi'}),run=e.run_ids[0];await worker.tick();expect((await detail(a1,run)).status).toBe('waiting');await request('POST','/v1/automations/'+a1.id+'/pause');await due(run);expect(await worker.tick()).toBe(0);const noEnroll=await eventFor(c,'welcome.wait');expect(noEnroll.run_ids).toEqual([]);await request('POST','/v1/automations/'+a1.id+'/resume');await worker.tick();await worker.tick();await worker.tick();expect((await detail(a1,run)).current_node_id).toBe('wait');await request('POST','/v1/automations/'+a1.id+'/pause');await eventFor(c,'purchased',randomUUID(),{message:'Purchased'});await request('POST','/v1/automations/'+a1.id+'/resume');await due(run);await worker.tick();await worker.tick();expect((await detail(a1,run)).status).toBe('completed');expect((await detail(a1,run)).steps).toHaveLength(4);
 });
 it('skips unsubscribed contacts, rechecks consent before SMTP, and cancels queued mail',async()=>{
  const c=await addContact('auto-cancel@example.test',{first_name:'Cancelled'}),a1=await publish(await newAutomation([emailNode()],'welcome.cancel'));const e=await eventFor(c,'welcome.cancel');await worker.tick();const run=e.run_ids[0];await request('POST','/v1/automations/'+a1.id+'/runs/'+run+'/cancel');const baseline=rawMessages.length;await dispatcher.tick();expect(rawMessages.length).toBe(baseline+1); // prior wait scenario contributes one pending email; cancelled run contributes none
  await h.dbs.service.update(contacts).set({unsubscribed:true}).where(eq(contacts.id,c.id));const skipped=await eventFor(c,'welcome.cancel');expect((await detail(a1,skipped.run_ids[0])).status).toBe('skipped');
 });
 it('preserves failed step and retries only that step; previews without sending',async()=>{
  const c=await addContact('auto-retry@example.test',{first_name:'Retry'}),a1=await publish(await newAutomation([emailNode()],'welcome.retry'));const before=await h.dbs.service.select().from(emails).where(eq(emails.orgId,a.orgId));const preview=await request('POST','/v1/automations/'+a1.id+'/test',{contact_id:c.id,properties:{message:'Preview'}});expect(preview.statusCode,preview.body).toBe(200);expect(preview.json().steps[0].result).toContain('Would queue');expect((await h.dbs.service.select().from(emails).where(eq(emails.orgId,a.orgId)))).toHaveLength(before.length);
  const e=await eventFor(c,'welcome.retry');await h.dbs.service.update(domains).set({sendingEnabled:false}).where(and(eq(domains.orgId,a.orgId),eq(domains.name,verified)));await worker.tick();expect((await detail(a1,e.run_ids[0])).status).toBe('failed');await h.dbs.service.update(domains).set({sendingEnabled:true}).where(and(eq(domains.orgId,a.orgId),eq(domains.name,verified)));expect((await request('POST','/v1/automations/'+a1.id+'/runs/'+e.run_ids[0]+'/retry')).statusCode).toBe(200);await Promise.all([worker.tick(),worker.tick()]);expect((await detail(a1,e.run_ids[0])).status).toBe('completed');expect((await detail(a1,e.run_ids[0])).steps).toHaveLength(1);
 });
 it('holds queued mail while paused and resumes without consuming attempts',async()=>{
  await dispatcher.tick();const c=await addContact('auto-paused-queue@example.test',{first_name:'Pause'}),a1=await publish(await newAutomation([emailNode()],'pause.queued')),e=await eventFor(c,'pause.queued');await worker.tick();const result=await detail(a1,e.run_ids[0]),emailId=result.steps[0].email_id;await request('POST','/v1/automations/'+a1.id+'/pause');const baseline=rawMessages.length;await dispatcher.tick();expect(rawMessages.length).toBe(baseline);const [recipient]=await h.dbs.service.select().from(emailRecipients).where(eq(emailRecipients.emailId,emailId));expect(recipient!.submissionAttempts).toBe(0);await request('POST','/v1/automations/'+a1.id+'/resume');await dispatcher.tick();expect(rawMessages.length).toBe(baseline+1);
 });
 it('honors quota backoff without duplicate admission and wait timeouts',async()=>{
  const c=await addContact('auto-quota@example.test',{first_name:'Quota'}),a1=await publish(await newAutomation([emailNode()],'quota.event'));await h.dbs.service.update(organizations).set({perMinuteRecipientLimit:1}).where(eq(organizations.id,a.orgId));const e=await eventFor(c,'quota.event');await worker.tick();expect((await detail(a1,e.run_ids[0])).status).toBe('waiting');expect((await detail(a1,e.run_ids[0])).steps).toHaveLength(0);await h.dbs.service.update(organizations).set({perMinuteRecipientLimit:10000}).where(eq(organizations.id,a.orgId));await due(e.run_ids[0]);await Promise.all([worker.tick(),worker.tick()]);expect((await detail(a1,e.run_ids[0])).steps).toHaveLength(1);await dispatcher.tick();
  const wait=await publish(await newAutomation([{id:'wait',type:'wait_for_event',name:'Timeout',event:'never',timeout_seconds:1,next:'email',timeout_next:null},emailNode()],'timeout.event'));const w=await eventFor(c,'timeout.event');await worker.tick();await h.dbs.service.update(automationSteps).set({startedAt:new Date(Date.now()-2000)}).where(eq(automationSteps.runId,w.run_ids[0]));await due(w.run_ids[0]);await worker.tick();expect((await detail(wait,w.run_ids[0])).status).toBe('completed');expect((await detail(wait,w.run_ids[0])).steps).toHaveLength(1);
 });
 it('blocks restricted sending actions and stops a revoked publishing key before SMTP',async()=>{
  const [domain]=await h.dbs.service.select().from(domains).where(and(eq(domains.orgId,a.orgId),eq(domains.name,verified)));const keyResponse=await h.app.inject({method:'POST',url:'/v1/api-keys',headers:sessionHeaders(a.cookie),payload:{name:'Restricted automation key',scope:'full_access',domain_id:domain!.id}});expect(keyResponse.statusCode,keyResponse.body).toBe(201);const restricted=keyResponse.json().token;
  const c=await addContact('auto-revoke@example.test',{first_name:'Revoke'}),a1=await newAutomation([emailNode()],'revoke.event');expect((await h.app.inject({method:'POST',url:'/v1/automations/'+a1.id+'/publish',headers:bearer(restricted),payload:{expected_revision:a1.revision}})).statusCode).toBe(200);
  expect((await h.app.inject({method:'POST',url:'/v1/automation-events',headers:bearer(restricted),payload:{idempotency_key:randomUUID(),event:'revoke.event',contact_id:c.id,properties:{message:'Hi'}}})).statusCode).toBe(403);
  const current=(await request('GET','/v1/automations/'+a1.id)).json();expect((await h.app.inject({method:'POST',url:'/v1/automations/'+a1.id+'/publish',headers:bearer(restricted),payload:{expected_revision:current.revision}})).statusCode).toBe(403);
  const event=await eventFor(c,'revoke.event');await worker.tick();await h.dbs.service.update(apiKeys).set({revokedAt:new Date()}).where(eq(apiKeys.id,keyResponse.json().id));const baseline=rawMessages.length;await dispatcher.tick();expect(rawMessages.length).toBe(baseline);const run=await detail(a1,event.run_ids[0]);const [recipient]=await h.dbs.service.select().from(emailRecipients).where(eq(emailRecipients.emailId,run.steps[0].email_id));expect(recipient!.state).toBe('SUPPRESSED');
 });
});
