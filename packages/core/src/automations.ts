import {createHash} from 'node:crypto';
import {and,eq,sql,automations,automationVersions,automationRuns,automationEvents,automationSteps,contacts,apiKeys,type Db,type Tx,type DbOrTx} from '@mp/database';
import {automationDraft,type AutomationDraft,type AutomationNode} from '@mp/contracts';
import {AppError,isAppError,type Logger} from '@mp/shared';
import {admitEmails,type Sender} from './admission';
import {unsubscribeToken} from './broadcasts';
import type {CoreConfig} from './config';

export function validateAutomation(draft:AutomationDraft){
 automationDraft.parse(draft);
 if(!draft.trigger_event.trim()||!draft.entry_node_id||!draft.nodes.length)throw new AppError('validation_error','Choose a trigger event and add at least one step.');
 const nodes=new Map(draft.nodes.map(n=>[n.id,n]));if(nodes.size!==draft.nodes.length)throw new AppError('validation_error','Step IDs must be unique.');
 if(new Set(draft.trigger_schema?.map(f=>f.key)).size!==(draft.trigger_schema?.length??0))throw new AppError('validation_error','Event schema property names must be unique.');
 const visiting=new Set<string>(),visited=new Set<string>();
 function walk(id:string|null){if(id===null)return;if(visiting.has(id))throw new AppError('validation_error','Steps cannot form a loop.');if(visited.has(id))return;const n=nodes.get(id);if(!n)throw new AppError('validation_error','A step points to a missing step.');visiting.add(id);for(const edge of n.type==='condition'?[n.yes,n.no]:n.type==='wait_for_event'?[n.next,n.timeout_next]:[n.next])walk(edge);visiting.delete(id);visited.add(id);}
 walk(draft.entry_node_id);if(visited.size!==nodes.size)throw new AppError('validation_error','Every step must be reachable from the entry step.');
 for(const n of draft.nodes)if(n.type==='email'&&(!n.from.trim()||!n.subject.trim()||(!n.html.trim()&&!n.text.trim())))throw new AppError('validation_error',`Complete the sender, subject and content for ${n.name||n.id}.`);
}
type Contact=typeof contacts.$inferSelect;
type Properties=Record<string,string|number|boolean|null>;
export function automationValue(key:string,c:Pick<Contact,'email'|'firstName'|'lastName'>,p:Properties){return key==='contact.email'?c.email:key==='contact.first_name'?c.firstName:key==='contact.last_name'?c.lastName:(Object.hasOwn(p,key.replace(/^event\./,''))?p[key.replace(/^event\./,'')]:undefined);}
export function automationCondition(n:Extract<AutomationNode,{type:'condition'}>,c:Pick<Contact,'email'|'firstName'|'lastName'>,p:Properties){
 const results=[n,...(n.clauses??[])].map(clause=>{const v=automationValue(clause.property,c,p);switch(clause.operator){case 'exists':return v!==undefined&&v!==null;case 'equals':return v===clause.value;case 'not_equals':return v!==clause.value;case 'contains':return typeof v==='string'&&typeof clause.value==='string'&&v.includes(clause.value);case 'greater_than':return typeof v==='number'&&typeof clause.value==='number'&&v>clause.value;case 'less_than':return typeof v==='number'&&typeof clause.value==='number'&&v<clause.value;}});return n.match==='any'?results.some(Boolean):results.every(Boolean);
}
export function validateAutomationProperties(draft:AutomationDraft,properties:Properties){for(const field of draft.trigger_schema??[]){const value=properties[field.key];if(value===undefined){if(field.required)throw new AppError('validation_error',`Missing event property: ${field.key}`);}else if(typeof value!==field.type)throw new AppError('validation_error',`Event property ${field.key} must be ${field.type}.`);}}
export function personalizeAutomation(value:string,c:Pick<Contact,'email'|'firstName'|'lastName'>,properties:Properties,html=false){
 const rendered=value.replace(/\{\{\s*((?:event\.|contact\.)[a-zA-Z0-9_-]+)\s*\}\}/g,(_match,key:string)=>{const v=automationValue(key,c,properties);if(v===undefined||v===null)throw new AppError('validation_error',`Missing personalization value: ${key}`);const s=String(v);return html?s.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]!)):s;});
 if(/\{\{|\}\}/.test(rendered))throw new AppError('validation_error','Unsupported personalization. Use {{contact.first_name}} or {{event.property}}.');return rendered;
}
export async function recordAutomationEvent(tx:Tx,orgId:string,projectId:string,input:{idempotency_key:string;event:string;contact_id:string;properties:Properties}){
 const stable=JSON.stringify({event:input.event,contact_id:input.contact_id,properties:Object.fromEntries(Object.entries(input.properties).sort(([a],[b])=>a.localeCompare(b)))}),fingerprint=createHash('sha256').update(stable).digest('hex');
 // Transaction advisory lock serializes only this project's idempotency key.
 await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${orgId+':'+projectId+':'+input.idempotency_key},0))`);
 const [prior]=await tx.select().from(automationEvents).where(and(eq(automationEvents.orgId,orgId),eq(automationEvents.projectId,projectId),eq(automationEvents.idempotencyKey,input.idempotency_key)));
 if(prior){if(prior.fingerprint!==fingerprint)throw new AppError('conflict','This event idempotency key was already used for different data.');const runs=await tx.select({id:automationRuns.id}).from(automationRuns).where(eq(automationRuns.eventId,prior.id));return {id:prior.id,run_ids:runs.map(r=>r.id),duplicate:true};}
 const [c]=await tx.select().from(contacts).where(and(eq(contacts.id,input.contact_id),eq(contacts.orgId,orgId),eq(contacts.projectId,projectId))).for('share');if(!c)throw new AppError('not_found','Contact not found');
 const [event]=await tx.insert(automationEvents).values({orgId,projectId,idempotencyKey:input.idempotency_key,fingerprint,event:input.event,contactId:c.id,properties:input.properties}).returning();
 const active=await tx.select().from(automations).where(and(eq(automations.orgId,orgId),eq(automations.projectId,projectId),eq(automations.status,'active'))).for('share');const runIds:string[]=[];
 for(const a of active){const [v]=await tx.select().from(automationVersions).where(and(eq(automationVersions.automationId,a.id),eq(automationVersions.version,a.publishedVersion!)));if(!v||v.definition.trigger_event!==input.event)continue;validateAutomationProperties(v.definition,input.properties);
 const skip=c.unsubscribed||!!c.archivedAt;const [run]=await tx.insert(automationRuns).values({orgId,projectId,automationId:a.id,version:v.version,eventId:event!.id,contactId:c.id,email:c.email,event:input.event,properties:input.properties,currentNodeId:v.definition.entry_node_id,status:skip?'skipped':'running',...(skip?{error:'Contact is not subscribed.',completedAt:new Date()}:{})}).returning();runIds.push(run!.id);}
 return {id:event!.id,run_ids:runIds,duplicate:false};
}
export class AutomationWorker {
 constructor(private db:Db,private core:CoreConfig,private log:Logger){}
 async tick():Promise<number>{return this.db.transaction(async tx=>{
 const [r]=await tx.select().from(automationRuns).where(and(sql`${automationRuns.status} in ('running','waiting')`,sql`${automationRuns.nextAttemptAt}<=now()`,sql`exists(select 1 from automations a where a.id=${automationRuns.automationId} and a.status='active')`)).orderBy(automationRuns.nextAttemptAt).limit(1).for('update',{skipLocked:true});if(!r)return 0;
 const [a]=await tx.select().from(automations).where(eq(automations.id,r.automationId)).for('share');if(a?.status!=='active')return 0;
 const [v]=await tx.select().from(automationVersions).where(and(eq(automationVersions.automationId,r.automationId),eq(automationVersions.version,r.version)));if(!v)throw new Error('Automation version missing');
 const n=v.definition.nodes.find(node=>node.id===r.currentNodeId);if(!n){await tx.update(automationRuns).set({status:'completed',completedAt:new Date(),updatedAt:new Date()}).where(eq(automationRuns.id,r.id));return 1;}
 const [step]=await tx.select().from(automationSteps).where(and(eq(automationSteps.runId,r.id),eq(automationSteps.nodeId,n.id)));
 const advance=async(next:string|null)=>{await tx.update(automationRuns).set({currentNodeId:next,status:next?'running':'completed',completedAt:next?null:new Date(),error:null,nextAttemptAt:new Date(),updatedAt:new Date()}).where(eq(automationRuns.id,r.id));};
 try{await tx.transaction(async unit=>{
 const [c]=await unit.select().from(contacts).where(and(eq(contacts.id,r.contactId),eq(contacts.orgId,r.orgId),eq(contacts.projectId,r.projectId))).for('share');
 if(!c||c.unsubscribed||c.archivedAt||c.emailLower!==r.email.toLowerCase()){await unit.update(automationRuns).set({status:'skipped',error:'Contact is no longer subscribed or their address changed.',completedAt:new Date(),updatedAt:new Date()}).where(eq(automationRuns.id,r.id));return;}
 const finish=async(emailId:string|null=null)=>{await unit.insert(automationSteps).values({runId:r.id,nodeId:n.id,orgId:r.orgId,projectId:r.projectId,type:n.type,status:'completed',completedAt:new Date(),emailId}).onConflictDoUpdate({target:[automationSteps.runId,automationSteps.nodeId],set:{status:'completed',completedAt:new Date(),emailId,error:null}});};
 if(n.type==='delay'&&!step){await unit.insert(automationSteps).values({runId:r.id,nodeId:n.id,orgId:r.orgId,projectId:r.projectId,type:n.type,status:'waiting'});await unit.update(automationRuns).set({status:'waiting',nextAttemptAt:new Date(Date.now()+n.seconds*1000),updatedAt:new Date()}).where(eq(automationRuns.id,r.id));return;}
 if(n.type==='wait_for_event'){
  const since=step?.startedAt??new Date();if(!step)await unit.insert(automationSteps).values({runId:r.id,nodeId:n.id,orgId:r.orgId,projectId:r.projectId,type:n.type,status:'waiting'});
  const [event]=await unit.select().from(automationEvents).where(and(eq(automationEvents.orgId,r.orgId),eq(automationEvents.projectId,r.projectId),eq(automationEvents.contactId,r.contactId),eq(automationEvents.event,n.event),sql`${automationEvents.createdAt}>=${since}`,sql`${automationEvents.createdAt}<=${new Date(since.getTime()+n.timeout_seconds*1000)}`)).orderBy(automationEvents.createdAt).limit(1);
  if(event){await finish();await unit.update(automationRuns).set({properties:{...r.properties,...event.properties}}).where(eq(automationRuns.id,r.id));await advance(n.next);return;}
  if(Date.now()>=since.getTime()+n.timeout_seconds*1000){await finish();await advance(n.timeout_next);return;}
  await unit.update(automationRuns).set({status:'waiting',nextAttemptAt:new Date(Math.min(Date.now()+5000,since.getTime()+n.timeout_seconds*1000)),updatedAt:new Date()}).where(eq(automationRuns.id,r.id));return;
 }
 if(n.type==='condition'){await finish();await advance(automationCondition(n,c,r.properties)?n.yes:n.no);return;}
 if(n.type==='delay'){await finish();await advance(n.next);return;}
 if(v.sender.type==='api_key'){const [key]=await unit.select().from(apiKeys).where(and(eq(apiKeys.id,v.sender.id),eq(apiKeys.orgId,r.orgId),eq(apiKeys.projectId,r.projectId)));if(!key||key.revokedAt||(key.expiresAt&&key.expiresAt<=new Date()))throw new AppError('sender_not_authorized','The publishing API key is no longer active.');}
 const sender:Sender={orgId:r.orgId,projectId:r.projectId,actor:{type:v.sender.type,id:v.sender.id},source:'api',restrictDomainId:v.sender.restrictDomainId,...(v.sender.type==='api_key'?{apiKeyId:v.sender.id}:{})};
 const link=new URL('/v1/broadcast-unsubscribe/'+unsubscribeToken(r.orgId,r.projectId,c.id,this.core.verpSecret),v.publicApiUrl).href;
 const {ids}=await admitEmails(unit,sender,[{stream:'marketing',from:n.from,to:[r.email],cc:[],bcc:[],replyTo:n.reply_to?[n.reply_to]:[],subject:personalizeAutomation(n.subject,c,r.properties),...(n.html?{html:personalizeAutomation(n.html,c,r.properties,true)+`<p><a href="${link}">Unsubscribe</a></p>`}:{}),...(n.text?{text:personalizeAutomation(n.text,c,r.properties)+'\n\nUnsubscribe: '+link}:{}),headers:{'List-Unsubscribe':`<${link}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'},attachments:[],tags:[],metadata:{automation_id:a.id,automation_run_id:r.id}}],{localUnlimitedSending:this.core.localUnlimitedSending});
 await finish(ids[0]!);await advance(n.next);
 });}catch(error){const retry=isAppError(error)&&['rate_limited','quota_exceeded'].includes(error.code),message=isAppError(error)?error.message:'Step failed. Retry after checking the sender configuration.';await tx.update(automationRuns).set({status:retry?'waiting':'failed',error:message,nextAttemptAt:new Date(Date.now()+60000),updatedAt:new Date()}).where(eq(automationRuns.id,r.id));if(!retry)await tx.insert(automationSteps).values({runId:r.id,nodeId:n.id,orgId:r.orgId,projectId:r.projectId,type:n.type,status:'failed',error:message}).onConflictDoUpdate({target:[automationSteps.runId,automationSteps.nodeId],set:{status:'failed',error:message}});this.log.warn({runId:r.id,code:isAppError(error)?error.code:'internal_error'},'automation step deferred');}
 return 1;
 });}
}
