import type { ApiResult, Broadcast, BroadcastDraft, BroadcastSummary, EmailDetail, EmailSummary, ListEmailsOptions, MorphmailerError, MorphmailerOptions, RequestOptions, SendEmailOptions } from './types';
export type * from './types';

/** Server-side SDK. Sending requests are never retried automatically. */
export class Morphmailer {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(apiKey: string, options: MorphmailerOptions) {
    if (!apiKey?.trim() || /[\r\n]/.test(apiKey)) throw new TypeError('Provide a valid Morphmailer API key');
    const base = new URL(options.baseUrl);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new TypeError('baseUrl must be an HTTP(S) URL without credentials, query or fragment');
    this.timeoutMs = options.timeoutMs ?? 30_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 2147483647) throw new TypeError('timeoutMs must be a positive integer up to 2147483647');
    this.apiKey = apiKey.trim();
    this.baseUrl = base.href.replace(/\/+$/, '');
    this.fetcher = options.fetch ?? globalThis.fetch;
    if (!this.fetcher) throw new TypeError('This runtime requires fetch support');
  }

  readonly emails = {
    send: (email: SendEmailOptions, options?: RequestOptions) => this.request<{ id: string }>('POST', '/v1/emails', email, options),
    get: (id: string, options?: RequestOptions) => this.request<EmailDetail>('GET', `/v1/emails/${encodeURIComponent(id)}`, undefined, options),
    list: (query: ListEmailsOptions = {}, options?: RequestOptions) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
      return this.request<{ data: EmailSummary[]; next_cursor: string | null }>('GET', `/v1/emails${params.size ? `?${params}` : ''}`, undefined, options);
    },
    cancel: (id: string, options?: RequestOptions) => this.request<{ id: string; cancelled: number; not_cancellable: number }>('POST', `/v1/emails/${encodeURIComponent(id)}/cancel`, undefined, options),
    update: (id: string, email: { scheduled_at: string }, options?: RequestOptions) => this.request<{ id: string; scheduled_at: string }>('PATCH', `/v1/emails/${encodeURIComponent(id)}`, email, options),
  };
  readonly batch = {
    send: (emails: SendEmailOptions[], options?: RequestOptions): Promise<ApiResult<{ data: Array<{ id: string }> }>> => {
      if (emails.length < 1 || emails.length > 100) return Promise.resolve({ data: null, error: { code: 'validation_error', message: 'A batch must contain 1–100 emails', statusCode: null, requestId: null } });
      return this.request('POST', '/v1/emails/batch', emails, options);
    },
  };

  readonly broadcasts = {
    create:(draft:{name:string},options?:RequestOptions)=>this.request<Broadcast>('POST','/v1/broadcasts',draft,options),
    get:(id:string,options?:RequestOptions)=>this.request<Broadcast>('GET',`/v1/broadcasts/${encodeURIComponent(id)}`,undefined,options),
    list:(query:{limit?:number;cursor?:string;search?:string;status?:Broadcast['status']}={},options?:RequestOptions)=>{
      const params=new URLSearchParams();for(const [key,value] of Object.entries(query))if(value!==undefined)params.set(key,String(value));
      return this.request<{data:BroadcastSummary[];next_cursor:string|null}>('GET','/v1/broadcasts'+(params.size?'?'+params:''),undefined,options);
    },
    update:(id:string,draft:BroadcastDraft&{expected_revision:number},options?:RequestOptions)=>this.request<Broadcast>('PATCH',`/v1/broadcasts/${encodeURIComponent(id)}`,draft,options),
    remove:(id:string,options?:RequestOptions)=>this.request<null>('DELETE',`/v1/broadcasts/${encodeURIComponent(id)}`,undefined,options),
    duplicate:(id:string,options?:RequestOptions)=>this.request<Broadcast>('POST',`/v1/broadcasts/${encodeURIComponent(id)}/duplicate`,undefined,options),
    send:(id:string,body:{expected_revision:number;scheduled_at?:string},options?:RequestOptions)=>this.request<Broadcast>('POST',`/v1/broadcasts/${encodeURIComponent(id)}/send`,body,options),
    cancel:(id:string,options?:RequestOptions)=>this.request<Broadcast>('POST',`/v1/broadcasts/${encodeURIComponent(id)}/cancel`,undefined,options),
    retry:(id:string,options?:RequestOptions)=>this.request<Broadcast>('POST',`/v1/broadcasts/${encodeURIComponent(id)}/retry`,undefined,options),
    test:(id:string,body:{to:string},options?:RequestOptions)=>this.request<{id:string}>('POST',`/v1/broadcasts/${encodeURIComponent(id)}/test`,body,options),
    audience:(id:string,options?:RequestOptions)=>this.request<{eligible:number;excluded:number}>('GET',`/v1/broadcasts/${encodeURIComponent(id)}/audience`,undefined,options),
  };

  readonly automations = {
    create:(draft:{name:string},options?:RequestOptions)=>this.request<Automation>('POST','/v1/automations',draft,options),
    get:(id:string,options?:RequestOptions)=>this.request<Automation>('GET',`/v1/automations/${encodeURIComponent(id)}`,undefined,options),
    list:(query:{limit?:number;cursor?:string;search?:string;status?:Automation['status']}={},options?:RequestOptions)=>this.request<{data:AutomationSummary[];next_cursor:string|null}>('GET','/v1/automations'+this.query(query),undefined,options),
    update:(id:string,draft:AutomationDraft&{expected_revision:number},options?:RequestOptions)=>this.request<Automation>('PATCH',`/v1/automations/${encodeURIComponent(id)}`,draft,options),
    publish:(id:string,body:{expected_revision:number},options?:RequestOptions)=>this.request<Automation>('POST',`/v1/automations/${encodeURIComponent(id)}/publish`,body,options),
    pause:(id:string,options?:RequestOptions)=>this.request<Automation>('POST',`/v1/automations/${encodeURIComponent(id)}/pause`,undefined,options),
    resume:(id:string,options?:RequestOptions)=>this.request<Automation>('POST',`/v1/automations/${encodeURIComponent(id)}/resume`,undefined,options),
    duplicate:(id:string,options?:RequestOptions)=>this.request<Automation>('POST',`/v1/automations/${encodeURIComponent(id)}/duplicate`,undefined,options),
    remove:(id:string,options?:RequestOptions)=>this.request<null>('DELETE',`/v1/automations/${encodeURIComponent(id)}`,undefined,options),
    test:(id:string,body:{contact_id:string;properties?:Record<string,AutomationScalar>},options?:RequestOptions)=>this.request<{steps:Array<{node_id:string;type:string;result:string}>}>('POST',`/v1/automations/${encodeURIComponent(id)}/test`,body,options),
    runs:{
      list:(id:string,query:{limit?:number;cursor?:string;status?:AutomationRun['status']}={},options?:RequestOptions)=>this.request<{data:AutomationRun[];next_cursor:string|null}>('GET',`/v1/automations/${encodeURIComponent(id)}/runs`+this.query(query),undefined,options),
      get:(id:string,runId:string,options?:RequestOptions)=>this.request<AutomationRun&{steps:AutomationStep[]}>('GET',`/v1/automations/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}`,undefined,options),
      retry:(id:string,runId:string,options?:RequestOptions)=>this.request<AutomationRun>('POST',`/v1/automations/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}/retry`,undefined,options),
      cancel:(id:string,runId:string,options?:RequestOptions)=>this.request<AutomationRun>('POST',`/v1/automations/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}/cancel`,undefined,options),
    },
  };
  readonly automationEvents = {send:(body:{idempotency_key:string;event:string;contact_id:string;properties?:Record<string,AutomationScalar>},options?:RequestOptions)=>this.request<{id:string;run_ids:string[];duplicate:boolean}>('POST','/v1/automation-events',body,options)};
  private query(input:Record<string,unknown>){const params=new URLSearchParams();for(const [key,value] of Object.entries(input))if(value!==undefined)params.set(key,String(value));return params.size?'?'+params:'';}
  private async request<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<ApiResult<T>> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    try {
      const headers = new Headers({ Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' });
      if (body !== undefined) headers.set('Content-Type', 'application/json');
      if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
      const response = await this.fetcher(`${this.baseUrl}${path}`, { method, headers, signal, redirect: 'error', ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      const requestId = response.headers.get('x-request-id');
      if(response.ok&&response.status===204)return {data:null as T,error:null};
      let payload: unknown;
      try { payload = await response.json(); }
      catch {
        if (signal.aborted) throw new Error('aborted');
        return { data: null, error: { code: 'invalid_response', message: 'The API returned a non-JSON response', statusCode: response.status, requestId } };
      }
      if (!response.ok) {
        const envelope = payload as { error?: Partial<MorphmailerError>; request_id?: string } | null;
        const error = envelope?.error;
        return { data: null, error: { code: typeof error?.code === 'string' ? error.code : 'api_error', message: typeof error?.message === 'string' ? error.message : `API request failed (${response.status})`, statusCode: response.status, requestId: requestId ?? (typeof envelope?.request_id === 'string' ? envelope.request_id : null), ...(Array.isArray(error?.details) ? { details: error.details } : {}) } };
      }
      if (payload === null || typeof payload !== 'object') return { data: null, error: { code: 'invalid_response', message: 'The API returned an invalid JSON response', statusCode: response.status, requestId } };
      return { data: payload as T, error: null };
    } catch {
      return { data: null, error: { code: options.signal?.aborted ? 'request_aborted' : timeout.aborted ? 'request_timeout' : 'network_error', message: options.signal?.aborted ? 'Request cancelled' : timeout.aborted ? 'Request timed out' : 'Could not reach the Morphmailer API', statusCode: null, requestId: null } };
    }
  }
}
import type {Automation,AutomationDraft,AutomationSummary,AutomationRun,AutomationStep,AutomationScalar} from './types';
