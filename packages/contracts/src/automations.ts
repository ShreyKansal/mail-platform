import {z} from 'zod';
const id=z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
const next=id.nullable();
const base={id,name:z.string().trim().max(128)};
export const automationScalar=z.union([z.string().max(10000),z.number().finite(),z.boolean(),z.null()]);
export const automationClause=z.object({property:z.string().min(1).max(128),operator:z.enum(['equals','not_equals','exists','contains','greater_than','less_than']),value:automationScalar}).strict();
export const automationNode=z.discriminatedUnion('type',[
 z.object({...base,type:z.literal('email'),from:z.string().max(512),reply_to:z.string().max(320).nullable(),subject:z.string().max(998),html:z.string().max(500000),text:z.string().max(100000),next}).strict(),
 z.object({...base,type:z.literal('delay'),seconds:z.number().int().min(1).max(2592000),next}).strict(),
 z.object({...base,type:z.literal('condition'),...automationClause.shape,clauses:z.array(automationClause).max(20).optional(),match:z.enum(['all','any']).optional(),yes:next,no:next}).strict(),
 z.object({...base,type:z.literal('wait_for_event'),event:z.string().min(1).max(128),timeout_seconds:z.number().int().min(1).max(2592000),next,timeout_next:next}).strict(),
]);
export const automationDraft=z.object({name:z.string().trim().min(1).max(128),trigger_event:z.string().max(128),trigger_schema:z.array(z.object({key:z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,127}$/),type:z.enum(['string','number','boolean']),required:z.boolean()}).strict()).max(100).optional(),entry_node_id:next,nodes:z.array(automationNode).max(50)}).strict();
export const automationStatus=z.enum(['draft','active','paused']);
export const automationView=automationDraft.extend({id:z.string().uuid(),status:automationStatus,revision:z.number().int(),published_version:z.number().int().nullable(),created_at:z.string(),updated_at:z.string()});
export const automationSummary=automationView.omit({nodes:true}).extend({node_count:z.number()});
export const automationEvent=z.object({idempotency_key:z.string().min(1).max(128),event:z.string().min(1).max(128),contact_id:z.string().uuid(),properties:z.record(z.string().max(128),automationScalar).default({})}).strict().refine(v=>Object.keys(v.properties).length<=100,'Use at most 100 properties');
export const automationRunStatus=z.enum(['running','waiting','completed','failed','cancelled','skipped']);
export const automationStepView=z.object({node_id:z.string(),type:z.string(),status:z.enum(['waiting','completed','failed','skipped']),started_at:z.string(),completed_at:z.string().nullable(),email_id:z.string().uuid().nullable(),error:z.string().nullable()});
export const automationRunView=z.object({id:z.string().uuid(),automation_id:z.string().uuid(),version:z.number(),contact_id:z.string().uuid(),email:z.string(),event:z.string(),properties:z.record(automationScalar),status:automationRunStatus,current_node_id:z.string().nullable(),next_attempt_at:z.string(),error:z.string().nullable(),created_at:z.string(),updated_at:z.string(),completed_at:z.string().nullable()});
export type AutomationNode=z.infer<typeof automationNode>;
export type AutomationDraft=z.infer<typeof automationDraft>;
