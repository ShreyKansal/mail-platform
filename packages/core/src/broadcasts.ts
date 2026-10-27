import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {and,eq,inArray,sql,broadcasts,broadcastRecipients,contacts,apiKeys,type Db,type DbOrTx} from '@mp/database';
import {AppError,isAppError,type Logger} from '@mp/shared';
import {admitEmails,type AdmissionInput,type Sender} from './admission';
import type {CoreConfig} from './config';

export type BroadcastRow = typeof broadcasts.$inferSelect;
const tokenBody=z.object({o:z.string().uuid(),p:z.string().uuid(),c:z.string().uuid()}).strict();
const signature=(body:string,secret:string)=>createHmac('sha256',secret).update('broadcast-unsubscribe:v1:'+body).digest();
export function unsubscribeToken(orgId:string,projectId:string,contactId:string,secret:string):string {
  const body=Buffer.from(JSON.stringify({o:orgId,p:projectId,c:contactId})).toString('base64url');
  return body+'.'+signature(body,secret).toString('base64url');
}
export function verifyUnsubscribeToken(token:string,secret:string) {
  if(token.length>1000||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token))throw new AppError('not_found','Unsubscribe link is invalid');
  const [body,sig,extra]=token.split('.');
  if(!body||!sig||extra)throw new AppError('not_found','Unsubscribe link is invalid');
  const supplied=Buffer.from(sig,'base64url'),expected=signature(body,secret);
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw new AppError('not_found','Unsubscribe link is invalid');
  try{return tokenBody.parse(JSON.parse(Buffer.from(body,'base64url').toString('utf8')));}catch{throw new AppError('not_found','Unsubscribe link is invalid');}
}

/** Stored drafts may be incomplete. Only a send/test requires complete content. */
export function validateBroadcastContent(b:Pick<BroadcastRow,'from'|'replyTo'|'subject'|'html'|'text'>) {
  const details=[];
  if(!b.from.trim())details.push({path:'from',message:'Choose a verified sender address.'});
  if(!b.subject.trim())details.push({path:'subject',message:'Enter a subject.'});
  if(!b.html.trim()&&!b.text.trim())details.push({path:'html',message:'Write HTML or plain-text content.'});
  if(details.length)throw new AppError('validation_error','Complete the broadcast before sending.',details);
}

export function broadcastInput(b:BroadcastRow,contact:{id:string;email:string},secret:string):AdmissionInput {
  validateBroadcastContent(b);
  const base=new URL(b.publicApiUrl!);
  if(!['http:','https:'].includes(base.protocol)||base.username||base.password)throw new AppError('validation_error','Public API URL is invalid');
  const url=new URL('/v1/broadcast-unsubscribe/'+unsubscribeToken(b.orgId,b.projectId,contact.id,secret),base).href;
  return {stream:'marketing',from:b.from,to:[contact.email],cc:[],bcc:[],replyTo:b.replyTo?[b.replyTo]:[],subject:b.subject,
    ...(b.html.trim()?{html:b.html+`<p><a href="${url}">Unsubscribe</a></p>`}:{}),
    ...(b.text.trim()?{text:b.text+'\n\nUnsubscribe: '+url}:{}),attachments:[],
    headers:{'List-Unsubscribe':`<${url}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'},tags:[],metadata:{broadcast_id:b.id}};
}

export function audienceWhere(b:Pick<BroadcastRow,'orgId'|'projectId'|'audience'|'contactIds'>) {
  return and(eq(contacts.orgId,b.orgId),eq(contacts.projectId,b.projectId),b.audience==='selected'?(b.contactIds.length?inArray(contacts.id,b.contactIds):sql`false`):undefined);
}

export function eligibleAudienceWhere(b:Pick<BroadcastRow,'orgId'|'projectId'|'audience'|'contactIds'>) {
  return and(audienceWhere(b),eq(contacts.unsubscribed,false),sql`${contacts.archivedAt} is null`,sql`not exists(select 1 from suppressions s where s.org_id=${contacts.orgId} and s.address_lower=${contacts.emailLower})`);
}

export async function refreshBroadcastCounts(tx:DbOrTx,id:string) {
  await tx.execute(sql`update broadcasts b set
    processed_count=(select count(*)::int from broadcast_recipients r where r.broadcast_id=b.id and r.status<>'pending'),
    skipped_count=(select count(*)::int from broadcast_recipients r where r.broadcast_id=b.id and r.status='skipped'),
    failed_count=(select count(*)::int from broadcast_recipients r where r.broadcast_id=b.id and r.status='failed')
    where b.id=${id}::uuid`);
}

/** Locks one campaign for a bounded batch. Recipient admission and its ledger commit together. */
export class BroadcastWorker {
  constructor(private db:Db,private core:CoreConfig,private log:Logger){}
  async tick():Promise<number> {
    return this.db.transaction(async tx=>{
      const [b]=await tx.select().from(broadcasts).where(and(sql`${broadcasts.status} in ('scheduled','sending')`,sql`${broadcasts.nextAttemptAt}<=now()`,sql`(${broadcasts.scheduledAt} is null or ${broadcasts.scheduledAt}<=now())`)).orderBy(broadcasts.nextAttemptAt).limit(1).for('update',{skipLocked:true});
      if(!b)return 0;
      await tx.update(broadcasts).set({status:'sending',updatedAt:new Date()}).where(eq(broadcasts.id,b.id));
      const sender:Sender={orgId:b.orgId,projectId:b.projectId,actor:{type:b.sender?.type??'system',id:b.sender?.id??null},source:'api',restrictDomainId:b.sender?.restrictDomainId??null,...(b.sender?.type==='api_key'?{apiKeyId:b.sender.id}:{})};
      if(b.sender?.type==='api_key'){
        const [key]=await tx.select().from(apiKeys).where(and(eq(apiKeys.id,b.sender.id),eq(apiKeys.orgId,b.orgId),eq(apiKeys.projectId,b.projectId)));
        if(!key||key.revokedAt||(key.expiresAt&&key.expiresAt<=new Date())){await tx.update(broadcasts).set({status:'failed',error:'The sending API key is no longer active.',updatedAt:new Date()}).where(eq(broadcasts.id,b.id));return 0;}
      }
      const pending=await tx.select().from(broadcastRecipients).where(and(eq(broadcastRecipients.broadcastId,b.id),eq(broadcastRecipients.status,'pending'))).orderBy(broadcastRecipients.contactId).limit(25);
      let handled=0,paused=false;
      for(const recipient of pending){
        try{
          await tx.transaction(async unit=>{
            const [c]=await unit.select().from(contacts).where(and(eq(contacts.id,recipient.contactId),eq(contacts.orgId,b.orgId),eq(contacts.projectId,b.projectId))).for('share');
            if(!c||c.unsubscribed||c.archivedAt||c.emailLower!==recipient.email.toLowerCase()){
              await unit.update(broadcastRecipients).set({status:'skipped',error:'Contact is no longer eligible.'}).where(and(eq(broadcastRecipients.broadcastId,b.id),eq(broadcastRecipients.contactId,recipient.contactId)));return;
            }
            const admitted=await admitEmails(unit,sender,[broadcastInput(b,c,this.core.verpSecret)],{localUnlimitedSending:this.core.localUnlimitedSending});
            await unit.update(broadcastRecipients).set({status:'queued',emailId:admitted.ids[0]!,error:null}).where(and(eq(broadcastRecipients.broadcastId,b.id),eq(broadcastRecipients.contactId,c.id)));
          });
          handled++;
        }catch(error){
          if(isAppError(error)&&(error.code==='quota_exceeded'||error.code==='rate_limited')){
            await tx.update(broadcasts).set({error:error.message,nextAttemptAt:new Date(Date.now()+60_000),updatedAt:new Date()}).where(eq(broadcasts.id,b.id));paused=true;break;
          }
          // Keep unprocessed recipients pending. Retry resumes the same ledger, never sent rows.
          this.log.warn({broadcastId:b.id,code:isAppError(error)?error.code:'internal_error'},'broadcast paused');
          await tx.update(broadcasts).set({status:'failed',error:isAppError(error)?error.message:'Broadcast processing failed. Retry to resume.',updatedAt:new Date()}).where(eq(broadcasts.id,b.id));paused=true;break;
        }
      }
      await refreshBroadcastCounts(tx,b.id);
      if(!paused){
        const [remaining]=await tx.select({n:sql<number>`count(*)::int`}).from(broadcastRecipients).where(and(eq(broadcastRecipients.broadcastId,b.id),eq(broadcastRecipients.status,'pending')));
        if(!remaining?.n)await tx.update(broadcasts).set({status:'completed',completedAt:new Date(),error:null,updatedAt:new Date()}).where(eq(broadcasts.id,b.id));
        else await tx.update(broadcasts).set({error:null,nextAttemptAt:new Date(),updatedAt:new Date()}).where(eq(broadcasts.id,b.id));
      }
      return handled;
    });
  }
}
