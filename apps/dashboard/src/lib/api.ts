/**
 * Thin client for the platform API. Requests go to the same origin (Vite proxy
 * in development, reverse proxy in production) so the HttpOnly session cookie
 * is sent automatically; unsafe methods add the CSRF header the API requires.
 */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Array<{ path?: string; message: string }>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
    readonly requestId: string | null,
  ) {
    super(body.message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') headers['x-mp-csrf'] = '1';
  let res: Response;
  try {
    res = await fetch(path, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, { code: 'network_error', message: 'Could not reach the API. Check your connection and try again.' }, null);
  }
  const requestId = res.headers.get('x-request-id');
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      throw new ApiError(res.status, { code: 'invalid_response', message: `The API returned an unreadable response (${res.status}). Check that the API service is running, then try again.` }, requestId);
    }
  }
  if (!res.ok) {
    const err = (json as { error?: ApiErrorBody } | null)?.error ?? { code: 'http_error', message: `Request failed (${res.status})` };
    throw new ApiError(res.status, err, requestId);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadCsv(path: string, filename: string) {
  const response = await fetch(path, { credentials: 'same-origin', headers: { accept: 'text/csv' } });
  if (!response.ok) {
    const body = await response.json() as { error?: ApiErrorBody };
    throw new ApiError(response.status, body.error ?? { code: 'http_error', message: 'Export failed' }, response.headers.get('x-request-id'));
  }
  saveBlob(await response.blob(), filename);
}

// ---------------------------------------------------------------------------
// Response types (mirroring @mp/contracts views)
// ---------------------------------------------------------------------------

export interface Session {
  user: { id: string; email: string; name: string };
  organization: { id: string; name: string; status: string; sending_tier: string; daily_recipient_limit: number; local_unlimited_sending?: boolean };
  project: { id: string; name: string };
  role: string;
  permissions: string[];
}

export interface Page<T> {
  data: T[];
  next_cursor: string | null;
}

export type RecordStatus = 'pending' | 'valid' | 'missing' | 'invalid' | 'partial' | 'conflict' | 'temp_error' | 'resolution_failed';

export interface DnsRecord {
  purpose: 'ownership' | 'dkim' | 'return_path_mx' | 'return_path_spf' | 'dmarc';
  type: string;
  host: string;
  value: string;
  priority: number | null;
  required: boolean;
  status: RecordStatus;
  observed: string[];
  detail: string | null;
  checked_at: string | null;
}

export interface Domain {
  tls_policy: 'opportunistic' | 'enforced';
  id: string;
  name: string;
  status: 'pending' | 'verified' | 'failed' | 'disabled';
  sending_enabled: boolean;
  return_path_domain: string;
  custom_return_path_active: boolean;
  dkim_selector: string | null;
  last_checked_at: string | null;
  created_at: string;
  records: DnsRecord[];
}

export interface EmailSummary {
  test_mode: boolean;
  id: string;
  from: string;
  subject: string;
  to: string[];
  status: string;
  source: 'api' | 'smtp';
  tags: Array<{ name: string; value: string }>;
  scheduled_at: string | null;
  created_at: string;
}

export interface EmailEvent {
  id: string;
  type: string;
  recipient_id: string | null;
  data: Record<string, unknown>;
  occurred_at: string;
}

export interface EmailDetail extends EmailSummary {
  message_id: string;
  reply_to: string[];
  metadata: Record<string, string>;
  recipients: Array<{
    id: string;
    kind: 'to' | 'cc' | 'bcc';
    address: string;
    state: string;
    state_changed_at: string;
    last_smtp_code: number | null;
    last_enhanced_status: string | null;
    last_response: string | null;
    bounce_class: string | null;
  }>;
  events: EmailEvent[];
  content: { html: string | null; text: string | null } | null;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  domain_id: string | null;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface SmtpCredential {
  id: string;
  name: string;
  username: string;
  domain_id: string | null;
  allowed_cidrs: string[] | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface Webhook {
  consecutive_failures: number;
  first_failure_at: string | null;
  last_failure_at: string | null;
  last_success_at: string | null;
  id: string;
  url: string;
  description: string | null;
  event_types: string[];
  enabled: boolean;
  disabled_reason: string | null;
  created_at: string;
}

export interface WebhookDelivery {
  id: string;
  event_id: string;
  event_type: string;
  status: 'pending' | 'delivering' | 'retrying' | 'succeeded' | 'dead';
  attempts: number;
  last_status_code: number | null;
  last_error: string | null;
  next_attempt_at: string;
  created_at: string;
}

export interface Suppression {
  id: string;
  email: string;
  reason: 'hard_bounce' | 'complaint' | 'manual' | 'unsubscribe';
  detail: string | null;
  created_at: string;
}

export interface Overview {
  submitted_in_window?: number;
  window_hours: number;
  recipients_by_state: Record<string, number>;
  verified_domains: number;
  total_domains: number;
  suppressions: number;
  daily_limit: number;
  local_unlimited_sending?: boolean;
  used_last_24h: number;
}
