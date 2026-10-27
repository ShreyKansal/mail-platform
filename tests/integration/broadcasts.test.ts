import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import pg from 'pg';
import {Redis} from 'ioredis';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {buildApp} from '@mp/api/app';
import {apiEnv} from '@mp/api/config';
import {createCoreConfig,BroadcastWorker,unsubscribeToken} from '@mp/core';
import {createDatabases,contacts,domains,organizations,emails,emailContents,emailRecipients,broadcasts,broadcastRecipients,withTenant,eq,and,sql} from '@mp/database';
import {FixtureDnsClient} from '@mp/dns-verification';
import {Dispatcher} from '@mp/mail-worker/dispatcher';
import {createLogger} from '@mp/shared';
import {createAccount,addVerifiedDomain,bearer,sessionHeaders,type Account,type Harness} from '../support/harness';
import {ROOT,TEST_DB,testEnv} from '../support/env';

// A fresh, uniquely named DB. Never truncate or migrate the user's working database.
const databaseName='mp_broadcast_'+randomUUID().replaceAll('-','');
const url=(input:string)=>{const u=new URL(input);u.pathname='/'+databaseName;return u.href;};
const owner=new pg.Client({connectionString:TEST_DB.owner});
let h:Harness,a:Account,b:Account,worker:BroadcastWorker,dispatcher:Dispatcher,redis:Redis,created=false;
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
 const log=createLogger('broadcast-tests','silent');worker=new BroadcastWorker(dbs.service,core,log);
 dispatcher=new Dispatcher(dbs.service,core,{submit:async(_envelope,raw)=>{rawMessages.push(raw);return {response:'250 2.0.0 Ok: queued as ABC123'};},close(){}},{workerId:'isolated-broadcast-tests',streams:['marketing'],batchSize:100,leaseSeconds:60,maxSubmissionAttempts:3,reconcileGraceSeconds:10},log);
});
afterAll(async()=>{await h?.app.close();await h?.dbs.close();if(redis)await redis.quit();if(created&&/^mp_broadcast_[a-f0-9]{32}$/.test(databaseName))await owner.query(`drop database "${databaseName}"`);await owner.end();});

describe('persisted broadcast lifecycle',()=>{
 it('supports drafts, optimistic revisions, filters, cursor pages and tenant isolation',async()=>{
  const draft=await create('Unfinished draft');expect((await request('POST',`/v1/broadcasts/${draft.id}/send`,{expected_revision:1})).statusCode).toBe(422);
  const payload={expected_revision:1,name:'October writer',from:'',reply_to:null,subject:'',html:'',text:'',audience:'all',contact_ids:[]};
  const responses=await Promise.all([request('PATCH',`/v1/broadcasts/${draft.id}`,payload),request('PATCH',`/v1/broadcasts/${draft.id}`,{...payload,name:'October other writer'})]);expect(responses.map(r=>r.statusCode).sort()).toEqual([200,409]);
  expect((await request('GET',`/v1/broadcasts/${draft.id}`,undefined,b)).statusCode).toBe(404);
  expect(await withTenant(h.dbs.app,b.orgId,tx=>tx.select().from(broadcasts).where(eq(broadcasts.id,draft.id)))).toHaveLength(0);
  const copy=await request('POST',`/v1/broadcasts/${draft.id}/duplicate`);expect(copy.statusCode).toBe(201);expect(copy.json().status).toBe('draft');expect(copy.json().revision).toBe(1);
  const first=await request('GET','/v1/broadcasts?limit=1&status=draft');expect(first.statusCode).toBe(200);expect(first.json().next_cursor).toBeTruthy();
  const second=await request('GET','/v1/broadcasts?limit=1&status=draft&cursor='+encodeURIComponent(first.json().next_cursor));expect(second.json().data[0].id).not.toBe(first.json().data[0].id);
  expect((await request('GET','/v1/broadcasts?search=October')).json().data.length).toBeGreaterThan(0);
  expect((await request('DELETE',`/v1/broadcasts/${copy.json().id}`)).statusCode).toBe(204);
 });
 it('freezes the eligible audience and processes concurrent batches exactly once through marketing admission',async()=>{
  const subscribers=[];for(let i=0;i<31;i++)subscribers.push(await addContact(`reader${i}@example.test`));
  await addContact('unsubscribed@example.test',{unsubscribed:true});const archived=await addContact('archived@example.test');await request('POST',`/v1/contacts/${archived.id}/archive`);
  await addContact('suppressed@example.test');expect((await request('POST','/v1/suppressions',{email:'suppressed@example.test'})).statusCode).toBe(201);
  const draft=await save(await create('Audience freeze'));const count=(await request('GET',`/v1/broadcasts/${draft.id}/audience`)).json();expect(count).toEqual({eligible:31,excluded:3});
  const start=await request('POST',`/v1/broadcasts/${draft.id}/send`,{expected_revision:draft.revision});expect(start.statusCode,start.body).toBe(202);expect(start.json().recipient_count).toBe(31);
  expect((await request('POST',`/v1/broadcasts/${draft.id}/send`,{expected_revision:draft.revision})).statusCode).toBe(409);
  await addContact('added-after-send@example.test');await h.dbs.service.update(contacts).set({unsubscribed:true}).where(eq(contacts.id,subscribers[0].id));
  await Promise.all([worker.tick(),worker.tick()]);await worker.tick();await worker.tick();
  const result=(await request('GET',`/v1/broadcasts/${draft.id}`)).json();expect(result).toMatchObject({status:'completed',recipient_count:31,processed_count:31,skipped_count:1});
  const ledger=await h.dbs.service.select().from(broadcastRecipients).where(eq(broadcastRecipients.broadcastId,draft.id));expect(ledger).toHaveLength(31);expect(ledger.filter(row=>row.status==='queued')).toHaveLength(30);expect(new Set(ledger.filter(row=>row.emailId).map(row=>row.emailId)).size).toBe(30);
  const rows=await h.dbs.service.select().from(emails).where(eq(emails.orgId,a.orgId));expect(rows).toHaveLength(30);expect(rows.every(row=>row.stream==='marketing'&&row.recipientCount===1)).toBe(true);
  // A contact can opt out after queue admission. Dispatcher rechecks before SMTP handoff.
  const queued=ledger.filter(row=>row.emailId);await h.dbs.service.update(contacts).set({unsubscribed:true}).where(eq(contacts.id,queued[0]!.contactId));await dispatcher.tick();expect(rawMessages).toHaveLength(29);
  const raw=rawMessages[0]!.toString().replace(/\r\n[ \t]+/g,' ');expect(raw).toMatch(/DKIM-Signature:/);expect(raw).toMatch(/list-unsubscribe:list-unsubscribe-post/i);expect(raw).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
  const [content]=await h.dbs.service.select().from(emailContents).where(eq(emailContents.emailId,queued[1]!.emailId!));const link=content!.headers['List-Unsubscribe']!.slice(1,-1),path=new URL(link).pathname;
  expect((await h.app.inject(path)).statusCode).toBe(200);const [before]=await h.dbs.service.select().from(contacts).where(eq(contacts.id,queued[1]!.contactId));expect(before!.unsubscribed).toBe(false);
  const unsub=()=>h.app.inject({method:'POST',url:path,headers:{'content-type':'application/x-www-form-urlencoded'},payload:'List-Unsubscribe=One-Click'});expect((await unsub()).statusCode).toBe(200);expect((await unsub()).statusCode).toBe(200);
  const [after]=await h.dbs.service.select().from(contacts).where(eq(contacts.id,queued[1]!.contactId));expect(after!.unsubscribed).toBe(true);
  expect((await h.app.inject({method:'POST',url:path+'bad'})).statusCode).toBe(404);
 });
 it('schedules, cancels without generating mail, and excludes foreign contacts from selected audiences',async()=>{
  const own=await addContact('selected@example.test'),foreign=await addContact('foreign@example.test',{},b),draft=await save(await create('Scheduled'),{audience:'selected',contact_ids:[own.id,foreign.id]});
  expect((await request('GET',`/v1/broadcasts/${draft.id}/audience`)).json()).toEqual({eligible:1,excluded:1});
  expect((await request('POST',`/v1/broadcasts/${draft.id}/send`,{expected_revision:draft.revision,scheduled_at:new Date(Date.now()-10000).toISOString()})).statusCode).toBe(422);
  const scheduled=await request('POST',`/v1/broadcasts/${draft.id}/send`,{expected_revision:draft.revision,scheduled_at:new Date(Date.now()+3600000).toISOString()});expect(scheduled.statusCode).toBe(202);expect(await worker.tick()).toBe(0);
  expect((await request('DELETE',`/v1/broadcasts/${draft.id}`)).statusCode).toBe(409);
  expect((await request('POST',`/v1/broadcasts/${draft.id}/cancel`)).json().status).toBe('cancelled');expect((await request('POST',`/v1/broadcasts/${draft.id}/cancel`)).statusCode).toBe(200);expect(await worker.tick()).toBe(0);
  const token=unsubscribeToken(a.orgId,(await h.app.inject({url:'/auth/session',headers:{cookie:a.cookie}})).json().project.id,own.id,h.core.verpSecret);expect((await h.app.inject('/v1/broadcast-unsubscribe/'+token)).statusCode).toBe(200);
 });
 it('resumes a failed campaign ledger without duplicating previously admitted mail',async()=>{
  const c=await addContact('resume@example.test'),draft=await save(await create('Resume'),{audience:'selected',contact_ids:[c.id]});expect((await request('POST',`/v1/broadcasts/${draft.id}/send`,{expected_revision:draft.revision})).statusCode).toBe(202);
  await h.dbs.service.update(domains).set({sendingEnabled:false}).where(and(eq(domains.orgId,a.orgId),eq(domains.name,verified)));await worker.tick();expect((await request('GET',`/v1/broadcasts/${draft.id}`)).json().status).toBe('failed');
  await h.dbs.service.update(domains).set({sendingEnabled:true}).where(and(eq(domains.orgId,a.orgId),eq(domains.name,verified)));expect((await request('POST',`/v1/broadcasts/${draft.id}/retry`)).statusCode).toBe(200);await Promise.all([worker.tick(),worker.tick()]);await worker.tick();
  const [campaign]=await h.dbs.service.select().from(broadcasts).where(eq(broadcasts.id,draft.id));expect(campaign!.status).toBe('completed');expect(campaign!.processedCount).toBe(1);expect((await h.dbs.service.select().from(broadcastRecipients).where(eq(broadcastRecipients.broadcastId,draft.id))).filter(row=>row.emailId)).toHaveLength(1);
 });
 it('pauses at quota limits and resumes the pending ledger without dropping or duplicating contacts',async()=>{
  const c=await addContact('quota@example.test'),draft=await save(await create('Quota recovery'),{audience:'selected',contact_ids:[c.id]});
  await h.dbs.service.update(organizations).set({perMinuteRecipientLimit:1}).where(eq(organizations.id,a.orgId));
  expect((await request('POST',`/v1/broadcasts/${draft.id}/send`,{expected_revision:draft.revision})).statusCode).toBe(202);expect(await worker.tick()).toBe(0);
  const paused=(await request('GET',`/v1/broadcasts/${draft.id}`)).json();expect(paused.status).toBe('sending');expect(paused.processed_count).toBe(0);expect(paused.error).toContain('limit');
  await h.dbs.service.update(organizations).set({perMinuteRecipientLimit:1000}).where(eq(organizations.id,a.orgId));await h.dbs.service.update(broadcasts).set({nextAttemptAt:new Date()}).where(eq(broadcasts.id,draft.id));
  expect(await worker.tick()).toBe(1);expect(await worker.tick()).toBe(0);expect((await request('GET',`/v1/broadcasts/${draft.id}`)).json()).toMatchObject({status:'completed',processed_count:1});
 });
 it('enforces campaign permissions separately from ordinary sending access',async()=>{
  const key=await h.app.inject({method:'POST',url:'/v1/api-keys',headers:sessionHeaders(a.cookie),payload:{name:'Sending only',scope:'sending_access'}});expect(key.statusCode).toBe(201);
  const headers=bearer(key.json().token);expect((await h.app.inject({url:'/v1/broadcasts',headers})).statusCode).toBe(403);expect((await h.app.inject({method:'POST',url:'/v1/broadcasts',headers,payload:{name:'Not allowed'}})).statusCode).toBe(403);
 });
});
