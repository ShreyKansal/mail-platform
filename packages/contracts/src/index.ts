import { z } from 'zod';

/**
 * Public API contracts (v1). Shared by the API (validation + OpenAPI),
 * the dashboard (forms) and the TypeScript SDK. Field names are snake_case
 * on the wire.
 */

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

export const MAX_RECIPIENTS_PER_EMAIL = 50;
export const MAX_BATCH_SIZE = 100;
export const MAX_ATTACHMENTS_BYTES = 10 * 1024 * 1024;
export const MAX_BODY_CHARS = 2 * 1024 * 1024;

export const uuidParam = z.object({ id: z.string().uuid() });

export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** Opaque cursor from a previous page's `next_cursor`. */
  cursor: z.string().max(200).optional(),
});

export const errorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string().optional(), message: z.string() })).optional(),
  }),
  request_id: z.string(),
});

export const listOf = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ data: z.array(item), next_cursor: z.string().nullable() });

export const templateContent = z.object({
  subject: z.string().min(1).max(998).refine(v => !/[\r\n\0]/.test(v), 'subject must be a single line'),
  html: z.string().max(MAX_BODY_CHARS).optional(), text: z.string().max(MAX_BODY_CHARS).optional(),
  variables: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/), z.object({ type: z.enum(['string', 'number']), required: z.boolean().default(true), default: z.union([z.string().max(10000), z.number().finite()]).optional() }).strict()).default({}),
}).strict().refine(v => v.html !== undefined || v.text !== undefined, 'provide html or text').refine(v => Object.keys(v.variables).length <= 50, 'at most 50 variables');
export const templateWrite = z.object({ name: z.string().trim().min(1).max(128), content: templateContent }).strict();
export const templateUpdate = templateWrite.extend({ expected_revision: z.number().int().positive() });
export const templateView = z.object({ id: z.string().uuid(), name: z.string(), content: templateContent, revision: z.number(), published_version: z.number().nullable(), archived_at: z.string().nullable(), created_at: z.string(), updated_at: z.string() });
export const contactWrite = z.object({ email: z.string().email().max(320), first_name: z.string().max(128).default(''), last_name: z.string().max(128).default(''), unsubscribed: z.boolean().default(false),
  properties: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/), z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()])).default({}),
}).strict().refine(v => Object.keys(v.properties).length <= 50, 'at most 50 properties');
export const contactView = z.object({ id: z.string().uuid(), email: z.string(), first_name: z.string(), last_name: z.string(), unsubscribed: z.boolean(), properties: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])), revision: z.number(), archived_at: z.string().nullable(), created_at: z.string(), updated_at: z.string() });

export const broadcastStatus = z.enum(['draft','scheduled','sending','completed','cancelled','failed']);
export const broadcastDraft = z.object({
  name:z.string().trim().min(1).max(128), from:z.string().max(512), reply_to:z.string().max(320).nullable(),
  subject:z.string().max(998).refine(value=>!/[\r\n\0]/.test(value),'Subject must be a single line'),
  html:z.string().max(500_000), text:z.string().max(100_000), audience:z.enum(['all','selected']),
  contact_ids:z.array(z.string().uuid()).max(10_000).refine(ids=>new Set(ids).size===ids.length,'Contact IDs must be unique'),
}).strict();
export const broadcastCreate = broadcastDraft.pick({name:true});
export const broadcastUpdate = broadcastDraft.extend({expected_revision:z.number().int().positive()});
export const broadcastSend = z.object({expected_revision:z.number().int().positive(),scheduled_at:z.string().datetime({offset:true}).optional()}).strict();
export const broadcastView = broadcastDraft.extend({id:z.string().uuid(),status:broadcastStatus,revision:z.number().int(),scheduled_at:z.string().nullable(),created_at:z.string(),updated_at:z.string(),completed_at:z.string().nullable(),error:z.string().nullable(),recipient_count:z.number(),processed_count:z.number(),skipped_count:z.number(),failed_count:z.number(),stats:z.object({recipient_states:z.record(z.string(),z.number())}).optional()});
export type Broadcast = z.infer<typeof broadcastView>;
export const broadcastListView=broadcastView.omit({html:true,text:true,contact_ids:true}).extend({selected_contact_count:z.number().int()});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const EMAIL_EVENT_TYPES = [
  'email.accepted',
  'email.scheduled',
  'email.rescheduled',
  'email.suppressed',
  'email.mta_accepted',
  'email.deferred',
  'email.remote_accepted',
  'email.bounced',
  'email.failed',
  'email.cancelled',
  'email.delivery_unknown',
] as const;
export const DOMAIN_EVENT_TYPES = ['domain.verified', 'domain.verification_lost'] as const;
export const EVENT_TYPES = [...EMAIL_EVENT_TYPES, ...DOMAIN_EVENT_TYPES, 'webhook.test'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------

const addressList = z.union([z.string().min(3).max(512), z.array(z.string().min(3).max(512)).min(1).max(MAX_RECIPIENTS_PER_EMAIL)]);
const tagToken = z.string().regex(/^[A-Za-z0-9_-]{1,256}$/, 'only ASCII letters, digits, underscores and dashes');

export const attachmentInput = z.object({
  filename: z
    .string()
    .min(1)
    .max(255)
    .refine((f) => !/[\u0000-\u001f\u007f/\\]/.test(f), 'filename must not contain path separators or control characters'),
  /** Base64-encoded content. */
  content: z.string().min(1).regex(/^[A-Za-z0-9+/\r\n]+={0,2}$/, 'content must be base64').optional(),
  path: z.string().url().max(2048).optional(),
  content_id: z.string().regex(/^[A-Za-z0-9._@+-]{1,127}$/, 'invalid content ID').optional(),
  content_type: z
    .string()
    .regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i)
    .optional(),
}).refine((a) => Number(a.content !== undefined) + Number(a.path !== undefined) === 1, { message: 'provide exactly one of content or path' });

export const sendEmailRequest = z
  .object({
    from: z.string().min(3).max(512),
    to: addressList,
    cc: addressList.optional(),
    bcc: addressList.optional(),
    reply_to: addressList.optional(),
    subject: z.string().min(1).max(998).optional(),
    template: z.object({ id: z.string().uuid(), version: z.number().int().positive().optional(), variables: z.record(z.string(), z.union([z.string().max(10000), z.number().finite()])).default({}) }).strict().optional(),
    html: z.string().max(MAX_BODY_CHARS).optional(),
    text: z.string().max(MAX_BODY_CHARS).optional(),
    attachments: z.array(attachmentInput).max(20).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    tags: z.array(z.object({ name: tagToken, value: tagToken })).max(20).optional(),
    metadata: z
      .record(z.string().max(64), z.string().max(512))
      .refine((m) => Object.keys(m).length <= 20, 'at most 20 metadata keys')
      .optional(),
    scheduled_at: z.string().datetime({ offset: true }).optional(),
    test_mode: z.boolean().optional(),
    idempotency_key: z.string().min(1).max(256).optional(),
  })
  .strict()
  .refine((v) => v.template ? v.subject === undefined && v.html === undefined && v.text === undefined : v.subject !== undefined && (v.html !== undefined || v.text !== undefined), { message: 'provide subject and html/text, or template; template cannot be combined with subject/html/text', path: ['html'] });
export type SendEmailRequest = z.infer<typeof sendEmailRequest>;

export const batchSendRequest = z.array(sendEmailRequest).min(1).max(MAX_BATCH_SIZE);

export const sendEmailResponse = z.object({ id: z.string().uuid() });
export const batchSendResponse = z.object({ data: z.array(sendEmailResponse) });

export const recipientState = z.enum([
  'CREATED',
  'VALIDATING',
  'ACCEPTED',
  'SCHEDULED',
  'QUEUED',
  'DISPATCHING',
  'RETRYING',
  'MTA_ACCEPTED',
  'DEFERRED',
  'REMOTE_ACCEPTED',
  'FAILED',
  'BOUNCED',
  'SUPPRESSED',
  'REJECTED',
  'CANCELLED',
  'DELIVERY_UNKNOWN',
]);

export const emailRecipientView = z.object({
  id: z.string().uuid(),
  kind: z.enum(['to', 'cc', 'bcc']),
  address: z.string(),
  state: recipientState,
  state_changed_at: z.string(),
  last_smtp_code: z.number().nullable(),
  last_enhanced_status: z.string().nullable(),
  last_response: z.string().nullable(),
  bounce_class: z.string().nullable(),
});

export const emailSummaryView = z.object({
  id: z.string().uuid(),
  from: z.string(),
  subject: z.string(),
  to: z.array(z.string()),
  status: z.union([recipientState, z.literal('PARTIAL')]),
  source: z.enum(['api', 'smtp']),
  test_mode: z.boolean(),
  tags: z.array(z.object({ name: z.string(), value: z.string() })),
  scheduled_at: z.string().nullable(),
  created_at: z.string(),
});

export const emailEventView = z.object({
  id: z.string().uuid(),
  type: z.string(),
  recipient_id: z.string().uuid().nullable(),
  data: z.record(z.string(), z.unknown()),
  occurred_at: z.string(),
});

export const emailDetailView = emailSummaryView.extend({
  message_id: z.string(),
  reply_to: z.array(z.string()),
  metadata: z.record(z.string(), z.string()),
  recipients: z.array(emailRecipientView),
  events: z.array(emailEventView),
  /** Present only with emails:read_content. */
  content: z.object({ html: z.string().nullable(), text: z.string().nullable() }).nullable(),
});

export const listEmailsQuery = paginationQuery.extend({
  test_mode: z.enum(['true', 'false']).optional(),
  status: recipientState.optional(),
  created_after: z.string().datetime({ offset: true }).optional(),
  created_before: z.string().datetime({ offset: true }).optional(),
  api_key_id: z.string().uuid().optional(),
  source: z.enum(['api', 'smtp']).optional(),
  search: z.string().trim().min(1).max(200).optional(),
});

export const rescheduleEmailRequest = z.object({ scheduled_at: z.string().datetime({ offset: true }) }).strict();
export const exportFilters = listEmailsQuery.omit({ limit: true, cursor: true });
export const exportJobView = z.object({ id: z.string().uuid(), status: z.enum(['queued', 'running', 'ready', 'failed']), row_count: z.number(), error: z.string().nullable(), created_at: z.string(), completed_at: z.string().nullable(), expires_at: z.string() });
export const dkimKeyView = z.object({ id: z.string().uuid(), selector: z.string(), status: z.enum(['pending', 'active', 'retiring', 'retired']), retire_after: z.string().nullable(), created_at: z.string(), record: z.object({ type: z.literal('TXT'), host: z.string(), value: z.string() }) });

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

export const createDomainRequest = z
  .object({
    name: z.string().min(3).max(253),
    return_path_label: z
      .string()
      .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/, 'must be a single lowercase DNS label')
      .default('bounce'),
  })
  .strict();

export const dnsRecordView = z.object({
  purpose: z.enum(['ownership', 'dkim', 'return_path_mx', 'return_path_spf', 'dmarc']),
  type: z.string(),
  host: z.string(),
  value: z.string(),
  priority: z.number().nullable(),
  required: z.boolean(),
  status: z.enum(['pending', 'valid', 'missing', 'invalid', 'partial', 'conflict', 'temp_error', 'resolution_failed']),
  observed: z.array(z.string()),
  detail: z.string().nullable(),
  checked_at: z.string().nullable(),
});

export const domainView = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.enum(['pending', 'verified', 'failed', 'disabled']),
  sending_enabled: z.boolean(),
  tls_policy: z.enum(['opportunistic', 'enforced']),
  return_path_domain: z.string(),
  custom_return_path_active: z.boolean(),
  dkim_selector: z.string().nullable(),
  last_checked_at: z.string().nullable(),
  created_at: z.string(),
  records: z.array(dnsRecordView),
});

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

export const createApiKeyRequest = z
  .object({
    name: z.string().trim().min(1).max(100),
    scope: z.enum(['full_access', 'sending_access']).default('sending_access'),
    domain_id: z.string().uuid().optional(),
    expires_at: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export const apiKeyView = z.object({
  id: z.string().uuid(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(z.string()),
  domain_id: z.string().uuid().nullable(),
  last_used_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
  created_at: z.string(),
});

export const createApiKeyResponse = apiKeyView.extend({
  /** Shown exactly once. */
  token: z.string(),
});

// ---------------------------------------------------------------------------
// SMTP credentials
// ---------------------------------------------------------------------------

export const createSmtpCredentialRequest = z
  .object({
    name: z.string().trim().min(1).max(100),
    domain_id: z.string().uuid().optional(),
    allowed_cidrs: z.array(z.string().max(43)).max(20).optional(),
  })
  .strict();

export const smtpCredentialView = z.object({
  id: z.string().uuid(),
  name: z.string(),
  username: z.string(),
  domain_id: z.string().uuid().nullable(),
  allowed_cidrs: z.array(z.string()).nullable(),
  last_used_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
  created_at: z.string(),
});

export const createSmtpCredentialResponse = smtpCredentialView.extend({
  /** Shown exactly once. */
  password: z.string(),
});

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export const createWebhookRequest = z
  .object({
    url: z.string().url().max(2048),
    event_types: z.array(z.enum(EVENT_TYPES)).min(1),
    description: z.string().max(500).optional(),
  })
  .strict();

export const updateWebhookRequest = z
  .object({
    url: z.string().url().max(2048).optional(),
    event_types: z.array(z.enum(EVENT_TYPES)).min(1).optional(),
    description: z.string().max(500).nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export const webhookView = z.object({
  id: z.string().uuid(),
  url: z.string(),
  description: z.string().nullable(),
  event_types: z.array(z.string()),
  enabled: z.boolean(),
  disabled_reason: z.string().nullable(),
  consecutive_failures: z.number(),
  first_failure_at: z.string().nullable(),
  last_failure_at: z.string().nullable(),
  last_success_at: z.string().nullable(),
  created_at: z.string(),
});

export const createWebhookResponse = webhookView.extend({
  /** `whsec_…` signing secret, shown exactly once. */
  secret: z.string(),
});

export const webhookDeliveryView = z.object({
  id: z.string().uuid(),
  event_id: z.string().uuid(),
  event_type: z.string(),
  status: z.enum(['pending', 'delivering', 'retrying', 'succeeded', 'dead']),
  attempts: z.number(),
  last_status_code: z.number().nullable(),
  last_error: z.string().nullable(),
  next_attempt_at: z.string(),
  created_at: z.string(),
});

// ---------------------------------------------------------------------------
// Suppressions
// ---------------------------------------------------------------------------

export const createSuppressionRequest = z.object({ email: z.string().min(3).max(320) }).strict();

export const suppressionView = z.object({
  id: z.string().uuid(),
  email: z.string(),
  reason: z.enum(['hard_bounce', 'complaint', 'manual', 'unsubscribe']),
  detail: z.string().nullable(),
  created_at: z.string(),
});

// ---------------------------------------------------------------------------
// Dashboard auth
// ---------------------------------------------------------------------------

export const signupRequest = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().email().max(320),
    password: z.string().min(12, 'use at least 12 characters').max(256),
    organization_name: z.string().trim().min(1).max(100),
  })
  .strict();

export const loginRequest = z
  .object({
    email: z.string().email().max(320),
    password: z.string().min(1).max(256),
  })
  .strict();

export const sessionView = z.object({
  user: z.object({ id: z.string().uuid(), email: z.string(), name: z.string() }),
  organization: z.object({
    id: z.string().uuid(),
    name: z.string(),
    status: z.string(),
    sending_tier: z.string(),
    daily_recipient_limit: z.number(),
    local_unlimited_sending: z.boolean().default(false),
  }),
  project: z.object({ id: z.string().uuid(), name: z.string() }),
  role: z.string(),
  permissions: z.array(z.string()),
});

export const overviewQuery = z.object({ hours: z.coerce.number().int().min(1).max(2160).default(24) });

export const overviewView = z.object({
  submitted_in_window: z.number(),
  window_hours: z.number(),
  recipients_by_state: z.record(z.string(), z.number()),
  verified_domains: z.number(),
  total_domains: z.number(),
  suppressions: z.number(),
  daily_limit: z.number(),
  local_unlimited_sending: z.boolean().default(false),
  used_last_24h: z.number(),
});
export * from './automations';
export * from './automation-metrics';
export * from './dns-setup';
