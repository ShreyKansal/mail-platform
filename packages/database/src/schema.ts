import { sql } from 'drizzle-orm';
import type {AutomationDraft} from '../../contracts/src/automations';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => ts('created_at').notNull().defaultNow();
const updatedAt = () => ts('updated_at').notNull().defaultNow();

export interface TemplateContent {
  subject: string;
  html?: string | undefined;
  text?: string | undefined;
  variables: Record<string, { type: 'string' | 'number'; required: boolean; default?: string | number | undefined }>;
}

export const templates = pgTable('templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  draft: jsonb('draft').$type<TemplateContent>().notNull(),
  revision: integer('revision').notNull().default(1),
  publishedVersion: integer('published_version'),
  archivedAt: ts('archived_at'),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [index('templates_project_created_idx').on(t.orgId, t.projectId, t.createdAt)]);

export const templateVersions = pgTable('template_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  templateId: uuid('template_id').notNull().references(() => templates.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  content: jsonb('content').$type<TemplateContent>().notNull(),
  createdAt: createdAt(),
}, t => [uniqueIndex('template_versions_number_uq').on(t.templateId, t.version)]);

export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  email: text('email').notNull(), emailLower: text('email_lower').notNull(),
  firstName: text('first_name').notNull().default(''), lastName: text('last_name').notNull().default(''),
  unsubscribed: boolean('unsubscribed').notNull().default(false),
  properties: jsonb('properties').$type<Record<string, string | number | boolean | null>>().notNull().default({}),
  revision: integer('revision').notNull().default(1),
  archivedAt: ts('archived_at'), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex('contacts_project_email_uq').on(t.projectId, t.emailLower), index('contacts_project_created_idx').on(t.orgId, t.projectId, t.createdAt)]);

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const orgStatus = pgEnum('org_status', ['active', 'pending_review', 'suspended']);
export const sendingTier = pgEnum('sending_tier', ['sandbox', 'standard', 'high_volume']);
export const memberRole = pgEnum('member_role', [
  'owner',
  'admin',
  'developer',
  'billing_admin',
  'analyst',
  'read_only',
]);
export const platformRole = pgEnum('platform_role', ['super_admin', 'security_admin', 'support']);

export const domainStatus = pgEnum('domain_status', ['pending', 'verified', 'failed', 'disabled']);
export const dnsRecordPurpose = pgEnum('dns_record_purpose', [
  'ownership',
  'dkim',
  'return_path_mx',
  'return_path_spf',
  'dmarc',
]);
export const dnsRecordStatus = pgEnum('dns_record_status', [
  'pending',
  'valid',
  'missing',
  'invalid',
  'partial',
  'conflict',
  'temp_error',
  'resolution_failed',
]);
export const dkimKeyStatus = pgEnum('dkim_key_status', ['pending', 'active', 'retiring', 'retired']);

export const emailStream = pgEnum('email_stream', ['transactional', 'marketing']);
export const emailSource = pgEnum('email_source', ['api', 'smtp']);
export const recipientKind = pgEnum('recipient_kind', ['to', 'cc', 'bcc']);
export const recipientState = pgEnum('recipient_state', [
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
export const attemptStage = pgEnum('attempt_stage', ['submission', 'remote']);
export const suppressionReason = pgEnum('suppression_reason', ['hard_bounce', 'complaint', 'manual', 'unsubscribe']);
export const webhookDeliveryStatus = pgEnum('webhook_delivery_status', [
  'pending',
  'delivering',
  'retrying',
  'succeeded',
  'dead',
]);
export const actorType = pgEnum('actor_type', ['user', 'api_key', 'smtp_credential', 'system']);

// ---------------------------------------------------------------------------
// Identity and tenancy
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    emailVerifiedAt: ts('email_verified_at'),
    platformRole: platformRole('platform_role'),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: ts('locked_until'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`)],
);

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    status: orgStatus('status').notNull().default('active'),
    sendingTier: sendingTier('sending_tier').notNull().default('sandbox'),
    /** Recipients per rolling 24h. Sandbox default is deliberately small (abuse prevention). */
    dailyRecipientLimit: integer('daily_recipient_limit').notNull().default(100),
    /** Recipients per minute across all keys. */
    perMinuteRecipientLimit: integer('per_minute_recipient_limit').notNull().default(10),
    /** Null inherits the development environment default; ignored in production. */
    localUnlimitedSending: boolean('local_unlimited_sending'),
    suspendedReason: text('suspended_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('organizations_slug_uq').on(t.slug)],
);

export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    activeOrgId: uuid('active_org_id').references(() => organizations.id, { onDelete: 'set null' }),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [uniqueIndex('user_sessions_token_uq').on(t.tokenHash), index('user_sessions_user_idx').on(t.userId)],
);

export const organizationMembers = pgTable(
  'organization_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRole('role').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('organization_members_org_user_uq').on(t.orgId, t.userId),
    index('organization_members_user_idx').on(t.userId),
  ],
);

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('workspaces_org_idx').on(t.orgId)],
);

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('projects_org_idx').on(t.orgId, t.workspaceId)],
);

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Non-secret display prefix, e.g. `mp_3kq7v2`. */
    prefix: text('prefix').notNull(),
    keyHash: text('key_hash').notNull(),
    scopes: text('scopes').array().notNull(),
    /** When set, the key may only send from this domain. */
    domainId: uuid('domain_id'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    lastUsedAt: ts('last_used_at'),
    expiresAt: ts('expires_at'),
    revokedAt: ts('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('api_keys_hash_uq').on(t.keyHash), index('api_keys_org_project_idx').on(t.orgId, t.projectId)],
);

export const smtpCredentials = pgTable(
  'smtp_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    /** When set, only these client CIDRs may authenticate. */
    allowedCidrs: text('allowed_cidrs').array(),
    domainId: uuid('domain_id'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    lastUsedAt: ts('last_used_at'),
    revokedAt: ts('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('smtp_credentials_username_uq').on(t.username),
    index('smtp_credentials_org_idx').on(t.orgId, t.projectId),
  ],
);

// ---------------------------------------------------------------------------
// Domains and authentication records
// ---------------------------------------------------------------------------

export const domains = pgTable(
  'domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** Lowercase ASCII (A-label) form. */
    name: text('name').notNull(),
    status: domainStatus('status').notNull().default('pending'),
    /** Tenant-bound random challenge; unique per domain row, never reused. */
    ownershipToken: text('ownership_token').notNull(),
    ownershipVerifiedAt: ts('ownership_verified_at'),
    /** Label under `name` used as the custom Return-Path, e.g. `bounce` → bounce.example.com. */
    returnPathLabel: text('return_path_label').notNull().default('bounce'),
    returnPathVerifiedAt: ts('return_path_verified_at'),
    sendingEnabled: boolean('sending_enabled').notNull().default(false),
    tlsPolicy: text('tls_policy', { enum: ['opportunistic', 'enforced'] }).notNull().default('opportunistic'),
    lastCheckedAt: ts('last_checked_at'),
    nextCheckAt: ts('next_check_at').notNull().defaultNow(),
    checkLeaseUntil: ts('check_lease_until'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('domains_org_project_idx').on(t.orgId, t.projectId),
    uniqueIndex('domains_org_name_uq').on(t.orgId, t.name),
    // Only one tenant can hold verified ownership of a domain at a time.
    uniqueIndex('domains_verified_name_uq').on(t.name).where(sql`${t.ownershipVerifiedAt} is not null and ${t.status} <> 'disabled'`),
    index('domains_next_check_idx').on(t.nextCheckAt),
  ],
);

export const dnsRecords = pgTable(
  'dns_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    domainId: uuid('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    purpose: dnsRecordPurpose('purpose').notNull(),
    type: text('type').notNull(),
    host: text('host').notNull(),
    value: text('value').notNull(),
    priority: smallint('priority'),
    required: boolean('required').notNull(),
    status: dnsRecordStatus('status').notNull().default('pending'),
    observed: jsonb('observed').$type<string[]>(),
    detail: text('detail'),
    checkedAt: ts('checked_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('dns_records_domain_purpose_host_uq').on(t.domainId, t.purpose, t.host)],
);

export const dkimKeys = pgTable(
  'dkim_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    domainId: uuid('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    selector: text('selector').notNull(),
    algorithm: text('algorithm').notNull().default('rsa-sha256'),
    keyBits: integer('key_bits').notNull(),
    publicKey: text('public_key').notNull(),
    /** Sealed with SecretBox; AAD binds it to the domain id. */
    privateKeySealed: text('private_key_sealed').notNull(),
    status: dkimKeyStatus('status').notNull().default('pending'),
    activatedAt: ts('activated_at'),
    retiredAt: ts('retired_at'),
    retireAfter: ts('retire_after'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('dkim_keys_domain_selector_uq').on(t.domainId, t.selector)],
);

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export interface EmailTag {
  name: string;
  value: string;
}

export const emails = pgTable(
  'emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    domainId: uuid('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'restrict' }),
    source: emailSource('source').notNull(),
    stream: emailStream('stream').notNull().default('transactional'),
    apiKeyId: uuid('api_key_id'),
    smtpCredentialId: uuid('smtp_credential_id'),
    fromAddress: text('from_address').notNull(),
    fromName: text('from_name'),
    subject: text('subject').notNull(),
    /** RFC 5322 Message-ID assigned at admission, without angle brackets. */
    messageId: text('message_id').notNull(),
    tags: jsonb('tags').$type<EmailTag[]>().notNull().default([]),
    metadata: jsonb('metadata').$type<Record<string, string>>().notNull().default({}),
    scheduledAt: ts('scheduled_at'),
    recipientCount: integer('recipient_count').notNull(),
    isTest: boolean('is_test').notNull().default(false),
      templateVersionId: uuid('template_version_id').references(() => templateVersions.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('emails_org_created_idx').on(t.orgId, t.createdAt.desc()),
    uniqueIndex('emails_message_id_uq').on(t.messageId),
  ],
);

export interface StoredAddress {
  address: string;
  name?: string;
}

export const emailContents = pgTable('email_contents', {
  emailId: uuid('email_id')
    .primaryKey()
    .references(() => emails.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  html: text('html'),
  text: text('text'),
  replyTo: jsonb('reply_to').$type<StoredAddress[]>().notNull().default([]),
  /** Header display lists (To/Cc) as composed into the message; BCC is never stored here. */
  toHeader: jsonb('to_header').$type<StoredAddress[]>().notNull(),
  ccHeader: jsonb('cc_header').$type<StoredAddress[]>().notNull().default([]),
  /** Validated custom headers (allow-listed names only). */
  headers: jsonb('headers').$type<Record<string, string>>().notNull().default({}),
});

export const emailShares = pgTable('email_shares', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  emailId: uuid('email_id').notNull().references(() => emails.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: ts('expires_at').notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('email_shares_token_uq').on(t.tokenHash), index('email_shares_email_idx').on(t.emailId)]);

export const apiRequestLogs = pgTable('api_request_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  requestId: text('request_id').notNull(),
  apiKeyId: uuid('api_key_id'),
  method: text('method').notNull(),
  route: text('route').notNull(),
  statusCode: integer('status_code').notNull(),
  durationMs: integer('duration_ms').notNull(),
  createdAt: createdAt(),
}, (t) => [index('api_request_logs_project_time_idx').on(t.orgId, t.projectId, t.createdAt.desc())]);

export const emailAttachments = pgTable(
  'email_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    emailId: uuid('email_id')
      .notNull()
      .references(() => emails.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    /** Base64 payload. Moves to object storage in the attachments milestone (see ROADMAP). */
    contentBase64: text('content_base64').notNull(),
    contentId: text('content_id'),
  },
  (t) => [index('email_attachments_email_idx').on(t.emailId)],
);

export const emailRecipients = pgTable(
  'email_recipients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    emailId: uuid('email_id')
      .notNull()
      .references(() => emails.id, { onDelete: 'cascade' }),
    kind: recipientKind('kind').notNull(),
    address: text('address').notNull(),
    addressLower: text('address_lower').notNull(),
    stream: emailStream('stream').notNull(),
    state: recipientState('state').notNull(),
    stateChangedAt: ts('state_changed_at').notNull().defaultNow(),
    nextAttemptAt: ts('next_attempt_at').notNull().defaultNow(),
    submissionAttempts: integer('submission_attempts').notNull().default(0),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: ts('lease_expires_at'),
    mtaQueueId: text('mta_queue_id'),
    lastSmtpCode: smallint('last_smtp_code'),
    lastEnhancedStatus: text('last_enhanced_status'),
    lastResponse: text('last_response'),
    bounceClass: text('bounce_class'),
    createdAt: createdAt(),
  },
  (t) => [
    index('email_recipients_email_idx').on(t.emailId),
    index('email_recipients_dispatch_idx')
      .on(t.stream, t.nextAttemptAt)
      .where(sql`${t.state} in ('QUEUED', 'SCHEDULED', 'RETRYING')`),
    index('email_recipients_lease_idx').on(t.leaseExpiresAt).where(sql`${t.state} in ('DISPATCHING', 'DELIVERY_UNKNOWN')`),
    index('email_recipients_org_created_idx').on(t.orgId, t.createdAt),
    index('email_recipients_queue_id_idx').on(t.mtaQueueId),
  ],
);

export const emailDeliveryAttempts = pgTable(
  'email_delivery_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => emailRecipients.id, { onDelete: 'cascade' }),
    stage: attemptStage('stage').notNull(),
    outcome: text('outcome').notNull(),
    mtaQueueId: text('mta_queue_id'),
    remoteHost: text('remote_host'),
    smtpCode: smallint('smtp_code'),
    enhancedStatus: text('enhanced_status'),
    /** Sanitized SMTP response text (no message content, truncated). */
    response: text('response'),
    occurredAt: ts('occurred_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('email_delivery_attempts_recipient_idx').on(t.recipientId, t.occurredAt)],
);

export const emailEvents = pgTable(
  'email_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    emailId: uuid('email_id')
      .notNull()
      .references(() => emails.id, { onDelete: 'cascade' }),
    recipientId: uuid('recipient_id').references(() => emailRecipients.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    /** Producers derive this deterministically so replays never create duplicates. */
    dedupeKey: text('dedupe_key').notNull(),
    occurredAt: ts('occurred_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('email_events_dedupe_uq').on(t.dedupeKey),
    index('email_events_email_idx').on(t.emailId, t.occurredAt),
    index('email_events_org_time_idx').on(t.orgId, t.occurredAt.desc()),
  ],
);

export const emailIdempotencyKeys = pgTable(
  'email_idempotency_keys',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    response: jsonb('response').$type<unknown>().notNull(),
    createdAt: createdAt(),
    expiresAt: ts('expires_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.key] }), index('email_idempotency_expires_idx').on(t.expiresAt)],
);

/** Postfix queue id → recipient, learned from the qmgr `from=<VERP>` log line. */
export const mtaQueueMessages = pgTable('mta_queue_messages', {
  queueId: text('queue_id').primaryKey(),
  recipientId: uuid('recipient_id')
    .notNull()
    .references(() => emailRecipients.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').notNull(),
  seenAt: ts('seen_at').notNull(),
});

export const bounceEvents = pgTable(
  'bounce_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => emailRecipients.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    classification: text('classification').notNull(),
    hard: boolean('hard').notNull(),
    smtpCode: smallint('smtp_code'),
    enhancedStatus: text('enhanced_status'),
    diagnostic: text('diagnostic'),
    dedupeKey: text('dedupe_key').notNull(),
    receivedAt: ts('received_at').notNull(),
  },
  (t) => [uniqueIndex('bounce_events_dedupe_uq').on(t.dedupeKey), index('bounce_events_org_idx').on(t.orgId, t.receivedAt)],
);

export const suppressions = pgTable(
  'suppressions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    addressLower: text('address_lower').notNull(),
    reason: suppressionReason('reason').notNull(),
    detail: text('detail'),
    sourceRecipientId: uuid('source_recipient_id'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('suppressions_org_address_uq').on(t.orgId, t.addressLower)],
);

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    description: text('description'),
    eventTypes: text('event_types').array().notNull(),
    /** Sealed `whsec_...` secret; AAD binds it to the endpoint id. */
    secretSealed: text('secret_sealed').notNull(),
    /** Previous secret after a rotation; deliveries are signed with both until it expires. */
    previousSecretSealed: text('previous_secret_sealed'),
    previousSecretExpiresAt: ts('previous_secret_expires_at'),
    enabled: boolean('enabled').notNull().default(true),
    disabledReason: text('disabled_reason'),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    firstFailureAt: ts('first_failure_at'),
    lastFailureAt: ts('last_failure_at'),
    lastSuccessAt: ts('last_success_at'),
    healthGeneration: integer('health_generation').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('webhook_endpoints_org_project_idx').on(t.orgId, t.projectId)],
);

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    endpointId: uuid('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: webhookDeliveryStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    retryCycleAttempts: integer('retry_cycle_attempts').notNull().default(0),
    nextAttemptAt: ts('next_attempt_at').notNull().defaultNow(),
    leaseExpiresAt: ts('lease_expires_at'),
    lastStatusCode: smallint('last_status_code'),
    lastError: text('last_error'),
    createdAt: createdAt(),
    completedAt: ts('completed_at'),
  },
  (t) => [
    uniqueIndex('webhook_deliveries_endpoint_event_uq').on(t.endpointId, t.eventId),
    index('webhook_deliveries_due_idx').on(t.nextAttemptAt).where(sql`${t.status} in ('pending', 'retrying')`),
    index('webhook_deliveries_endpoint_idx').on(t.endpointId, t.createdAt),
  ],
);

export const webhookAttempts = pgTable(
  'webhook_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    deliveryId: uuid('delivery_id')
      .notNull()
      .references(() => webhookDeliveries.id, { onDelete: 'cascade' }),
    attemptNo: integer('attempt_no').notNull(),
    statusCode: smallint('status_code'),
    error: text('error'),
    durationMs: integer('duration_ms').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('webhook_attempts_delivery_idx').on(t.deliveryId)],
);

// ---------------------------------------------------------------------------
// Audit and operations
// ---------------------------------------------------------------------------

export const exportJobs = pgTable('export_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['queued', 'running', 'ready', 'failed'] }).notNull().default('queued'),
  filters: jsonb('filters').$type<Record<string, string>>().notNull().default({}),
  cursor: jsonb('cursor').$type<{ t: string; id: string }>(),
  rowCount: integer('row_count').notNull().default(0),
  chunkCount: integer('chunk_count').notNull().default(0),
  leaseToken: uuid('lease_token'),
  leaseUntil: ts('lease_until'),
  error: text('error'),
  createdAt: createdAt(),
  completedAt: ts('completed_at'),
  expiresAt: ts('expires_at').notNull(),
}, (t) => [index('export_jobs_project_time_idx').on(t.orgId, t.projectId, t.createdAt.desc())]);

export const exportChunks = pgTable('export_chunks', {
  jobId: uuid('job_id').notNull().references(() => exportJobs.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  part: integer('part').notNull(),
  csv: text('csv').notNull(),
}, (t) => [primaryKey({ columns: [t.jobId, t.part] })]);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  message: text('message').notNull(),
  resourceId: uuid('resource_id'),
  createdAt: createdAt(),
}, (t) => [index('notifications_project_time_idx').on(t.orgId, t.projectId, t.createdAt.desc())]);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
    actorType: actorType('actor_type').notNull(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: uuid('target_id'),
    ip: text('ip'),
    requestId: text('request_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('audit_logs_org_time_idx').on(t.orgId, t.createdAt.desc())],
);

/** Durable progress markers for single-consumer workers (e.g. Postfix log offset). */
export const workerCheckpoints = pgTable('worker_checkpoints', {
  name: text('name').primaryKey(),
  fileId: text('file_id'),
  position: bigint('position', { mode: 'number' }).notNull().default(0),
  heartbeatAt: ts('heartbeat_at').notNull().defaultNow(),
  /** Timestamp of the newest log line processed; used for lease-expiry reconciliation. */
  watermarkAt: ts('watermark_at'),
});

export const broadcasts = pgTable('broadcasts', {
  id:uuid('id').primaryKey().defaultRandom(), orgId:uuid('org_id').notNull().references(()=>organizations.id,{onDelete:'cascade'}),
  projectId:uuid('project_id').notNull().references(()=>projects.id,{onDelete:'cascade'}), name:text('name').notNull(),
  status:text('status',{enum:['draft','scheduled','sending','completed','cancelled','failed']}).notNull().default('draft'),
  from:text('from_address').notNull().default(''), replyTo:text('reply_to'),subject:text('subject').notNull().default(''),
  html:text('html').notNull().default(''),text:text('text').notNull().default(''),
  audience:text('audience',{enum:['all','selected']}).notNull().default('all'), contactIds:jsonb('contact_ids').$type<string[]>().notNull().default([]),
  revision:integer('revision').notNull().default(1), scheduledAt:ts('scheduled_at'), nextAttemptAt:ts('next_attempt_at').notNull().defaultNow(),
  sender:jsonb('sender').$type<{type:'user'|'api_key';id:string;restrictDomainId:string|null}>(),
  publicApiUrl:text('public_api_url'),recipientCount:integer('recipient_count').notNull().default(0),
  processedCount:integer('processed_count').notNull().default(0),skippedCount:integer('skipped_count').notNull().default(0),failedCount:integer('failed_count').notNull().default(0),
  error:text('error'),completedAt:ts('completed_at'),createdAt:createdAt(),updatedAt:updatedAt(),
}, t=>[index('broadcasts_project_created_idx').on(t.orgId,t.projectId,t.createdAt),index('broadcasts_due_idx').on(t.status,t.nextAttemptAt)]);

/** One frozen audience row per contact. Queue admission and this row commit atomically. */
export const broadcastRecipients = pgTable('broadcast_recipients', {
  broadcastId:uuid('broadcast_id').notNull().references(()=>broadcasts.id,{onDelete:'cascade'}),
  orgId:uuid('org_id').notNull().references(()=>organizations.id,{onDelete:'cascade'}),projectId:uuid('project_id').notNull().references(()=>projects.id,{onDelete:'cascade'}),
  contactId:uuid('contact_id').notNull(),email:text('email').notNull(),
  status:text('status',{enum:['pending','queued','skipped','failed']}).notNull().default('pending'),
  emailId:uuid('email_id').references(()=>emails.id,{onDelete:'set null'}),error:text('error'),createdAt:createdAt(),
}, t=>[primaryKey({columns:[t.broadcastId,t.contactId]}),index('broadcast_recipients_email_idx').on(t.emailId),index('broadcast_recipients_pending_idx').on(t.broadcastId,t.status,t.contactId)]);

export const automations=pgTable('automations',{
 id:uuid('id').primaryKey().defaultRandom(),orgId:uuid('org_id').notNull().references(()=>organizations.id,{onDelete:'cascade'}),projectId:uuid('project_id').notNull().references(()=>projects.id,{onDelete:'cascade'}),
 name:text('name').notNull(),status:text('status',{enum:['draft','active','paused']}).notNull().default('draft'),revision:integer('revision').notNull().default(1),publishedVersion:integer('published_version'),
 draft:jsonb('draft').$type<AutomationDraft>().notNull(),createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[index('automations_project_idx').on(t.orgId,t.projectId,t.createdAt)]);
export const automationVersions=pgTable('automation_versions',{
 automationId:uuid('automation_id').notNull().references(()=>automations.id,{onDelete:'cascade'}),version:integer('version').notNull(),orgId:uuid('org_id').notNull(),projectId:uuid('project_id').notNull(),
 definition:jsonb('definition').$type<AutomationDraft>().notNull(),sender:jsonb('sender').$type<{type:'user'|'api_key';id:string;restrictDomainId:string|null}>().notNull(),publicApiUrl:text('public_api_url').notNull(),createdAt:createdAt(),
},t=>[primaryKey({columns:[t.automationId,t.version]})]);
export const automationEvents=pgTable('automation_events',{
 id:uuid('id').primaryKey().defaultRandom(),orgId:uuid('org_id').notNull(),projectId:uuid('project_id').notNull(),idempotencyKey:text('idempotency_key').notNull(),fingerprint:text('fingerprint').notNull(),event:text('event').notNull(),contactId:uuid('contact_id').notNull(),properties:jsonb('properties').$type<Record<string,string|number|boolean|null>>().notNull(),createdAt:createdAt(),
},t=>[uniqueIndex('automation_events_idempotency_idx').on(t.orgId,t.projectId,t.idempotencyKey),index('automation_events_contact_idx').on(t.orgId,t.projectId,t.contactId,t.createdAt)]);
export const automationRuns=pgTable('automation_runs',{
 id:uuid('id').primaryKey().defaultRandom(),orgId:uuid('org_id').notNull(),projectId:uuid('project_id').notNull(),automationId:uuid('automation_id').notNull().references(()=>automations.id,{onDelete:'cascade'}),version:integer('version').notNull(),eventId:uuid('event_id').notNull().references(()=>automationEvents.id),contactId:uuid('contact_id').notNull(),email:text('email').notNull(),
 event:text('event').notNull(),properties:jsonb('properties').$type<Record<string,string|number|boolean|null>>().notNull(),status:text('status',{enum:['running','waiting','completed','failed','cancelled','skipped']}).notNull().default('running'),currentNodeId:text('current_node_id'),nextAttemptAt:ts('next_attempt_at').notNull().defaultNow(),error:text('error'),completedAt:ts('completed_at'),createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[uniqueIndex('automation_runs_event_idx').on(t.automationId,t.eventId),index('automation_runs_due_idx').on(t.status,t.nextAttemptAt),index('automation_runs_project_idx').on(t.orgId,t.projectId,t.automationId,t.createdAt)]);
export const automationSteps=pgTable('automation_steps',{
 runId:uuid('run_id').notNull().references(()=>automationRuns.id,{onDelete:'cascade'}),nodeId:text('node_id').notNull(),orgId:uuid('org_id').notNull(),projectId:uuid('project_id').notNull(),type:text('type').notNull(),status:text('status',{enum:['waiting','completed','failed','skipped']}).notNull(),startedAt:ts('started_at').notNull().defaultNow(),completedAt:ts('completed_at'),emailId:uuid('email_id').references(()=>emails.id,{onDelete:'set null'}),error:text('error'),
},t=>[primaryKey({columns:[t.runId,t.nodeId]}),index('automation_steps_email_idx').on(t.emailId)]);
