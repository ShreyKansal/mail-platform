export interface Attachment {
  filename: string;
  content?: string;
  path?: string;
  content_id?: string;
  content_type?: string;
}
/** Wire field names match the platform REST API. */
export type SendEmailOptions = {
  from: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  reply_to?: string | string[];
  attachments?: Attachment[];
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
  metadata?: Record<string, string>;
  scheduled_at?: string;
  test_mode?: boolean;
  idempotency_key?: string;
} & (
  | { subject: string; html: string; text?: string; template?: never }
  | { subject: string; text: string; html?: string; template?: never }
  | { template: { id: string; version?: number; variables?: Record<string, string | number> }; subject?: never; html?: never; text?: never }
);
export type RecipientState = 'CREATED' | 'VALIDATING' | 'ACCEPTED' | 'SCHEDULED' | 'QUEUED' | 'DISPATCHING' | 'RETRYING' | 'MTA_ACCEPTED' | 'REMOTE_ACCEPTED' | 'DEFERRED' | 'FAILED' | 'BOUNCED' | 'SUPPRESSED' | 'REJECTED' | 'CANCELLED' | 'DELIVERY_UNKNOWN';
export interface EmailSummary {
  id: string;
  from: string;
  subject: string;
  to: string[];
  status: RecipientState | 'PARTIAL';
  source: 'api' | 'smtp';
  test_mode: boolean;
  tags: Array<{ name: string; value: string }>;
  scheduled_at: string | null;
  created_at: string;
}
export interface EmailDetail extends EmailSummary {
  message_id: string;
  reply_to: string[];
  metadata: Record<string, string>;
  recipients: Array<{ id: string; address: string; kind: 'to' | 'cc' | 'bcc'; state: RecipientState; state_changed_at: string; last_smtp_code: number | null; last_enhanced_status: string | null; last_response: string | null; bounce_class: string | null }>;
  events: Array<{ id: string; type: string; recipient_id: string | null; data: Record<string, unknown>; occurred_at: string }>;
  content: { html: string | null; text: string | null } | null;
}
export interface ListEmailsOptions {
  limit?: number;
  cursor?: string;
  test_mode?: 'true' | 'false';
  status?: RecipientState;
  created_after?: string;
  created_before?: string;
  api_key_id?: string;
  source?: 'api' | 'smtp';
  search?: string;
}
export interface RequestOptions { idempotencyKey?: string; signal?: AbortSignal }
export interface BroadcastDraft {
  name:string; from:string; reply_to:string|null; subject:string; html:string; text:string;
  audience:'all'|'selected'; contact_ids:string[];
}
export interface Broadcast extends BroadcastDraft {
  id:string; status:'draft'|'scheduled'|'sending'|'completed'|'cancelled'|'failed'; revision:number;
  scheduled_at:string|null; created_at:string; updated_at:string; completed_at:string|null; error:string|null;
  recipient_count:number; processed_count:number; skipped_count:number; failed_count:number;
  stats?:{recipient_states:Record<string,number>};
}
export type BroadcastSummary=Omit<Broadcast,'html'|'text'|'contact_ids'>&{selected_contact_count:number};
export interface MorphmailerOptions {
  /** Origin or reverse-proxy base path, without /v1. Required for self-hosted deployments. */
  baseUrl: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}
export interface MorphmailerError {
  code: string;
  message: string;
  statusCode: number | null;
  requestId: string | null;
  details?: Array<{ path?: string; message: string }>;
}
export type ApiResult<T> = { data: T; error: null } | { data: null; error: MorphmailerError };
export type AutomationScalar=string|number|boolean|null;
export type AutomationClause={property:string;operator:'equals'|'not_equals'|'exists'|'contains'|'greater_than'|'less_than';value:AutomationScalar};
export type AutomationNode={id:string;name:string}&(
 {type:'email';from:string;reply_to:string|null;subject:string;html:string;text:string;next:string|null}|
 {type:'delay';seconds:number;next:string|null}|
 ({type:'condition';yes:string|null;no:string|null;clauses?:AutomationClause[];match?:'all'|'any'}&AutomationClause)|
 {type:'wait_for_event';event:string;timeout_seconds:number;next:string|null;timeout_next:string|null});
export interface AutomationDraft {name:string;trigger_event:string;trigger_schema?:Array<{key:string;type:'string'|'number'|'boolean';required:boolean}>;entry_node_id:string|null;nodes:AutomationNode[]}
export interface Automation extends AutomationDraft {id:string;status:'draft'|'active'|'paused';revision:number;published_version:number|null;created_at:string;updated_at:string}
export type AutomationSummary=Omit<Automation,'nodes'>&{node_count:number};
export interface AutomationRun {id:string;automation_id:string;version:number;contact_id:string;email:string;event:string;properties:Record<string,AutomationScalar>;status:'running'|'waiting'|'completed'|'failed'|'cancelled'|'skipped';current_node_id:string|null;next_attempt_at:string;error:string|null;created_at:string;updated_at:string;completed_at:string|null}
export interface AutomationStep {node_id:string;type:AutomationNode['type'];status:'waiting'|'completed'|'failed'|'skipped';started_at:string;completed_at:string|null;email_id:string|null;error:string|null}
