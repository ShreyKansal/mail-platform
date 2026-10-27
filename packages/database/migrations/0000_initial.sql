CREATE TYPE "public"."actor_type" AS ENUM('user', 'api_key', 'smtp_credential', 'system');--> statement-breakpoint
CREATE TYPE "public"."attempt_stage" AS ENUM('submission', 'remote');--> statement-breakpoint
CREATE TYPE "public"."dkim_key_status" AS ENUM('pending', 'active', 'retiring', 'retired');--> statement-breakpoint
CREATE TYPE "public"."dns_record_purpose" AS ENUM('ownership', 'dkim', 'return_path_mx', 'return_path_spf', 'dmarc');--> statement-breakpoint
CREATE TYPE "public"."dns_record_status" AS ENUM('pending', 'valid', 'missing', 'invalid', 'partial', 'conflict', 'temp_error', 'resolution_failed');--> statement-breakpoint
CREATE TYPE "public"."domain_status" AS ENUM('pending', 'verified', 'failed', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."email_source" AS ENUM('api', 'smtp');--> statement-breakpoint
CREATE TYPE "public"."email_stream" AS ENUM('transactional', 'marketing');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'developer', 'billing_admin', 'analyst', 'read_only');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('active', 'pending_review', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('super_admin', 'security_admin', 'support');--> statement-breakpoint
CREATE TYPE "public"."recipient_kind" AS ENUM('to', 'cc', 'bcc');--> statement-breakpoint
CREATE TYPE "public"."recipient_state" AS ENUM('CREATED', 'VALIDATING', 'ACCEPTED', 'SCHEDULED', 'QUEUED', 'DISPATCHING', 'RETRYING', 'MTA_ACCEPTED', 'DEFERRED', 'REMOTE_ACCEPTED', 'FAILED', 'BOUNCED', 'SUPPRESSED', 'REJECTED', 'CANCELLED', 'DELIVERY_UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."sending_tier" AS ENUM('sandbox', 'standard', 'high_volume');--> statement-breakpoint
CREATE TYPE "public"."suppression_reason" AS ENUM('hard_bounce', 'complaint', 'manual', 'unsubscribe');--> statement-breakpoint
CREATE TYPE "public"."webhook_delivery_status" AS ENUM('pending', 'delivering', 'retrying', 'succeeded', 'dead');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"domain_id" uuid,
	"created_by_user_id" uuid,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" uuid,
	"ip" text,
	"request_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bounce_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"source" text NOT NULL,
	"classification" text NOT NULL,
	"hard" boolean NOT NULL,
	"smtp_code" smallint,
	"enhanced_status" text,
	"diagnostic" text,
	"dedupe_key" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dkim_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"domain_id" uuid NOT NULL,
	"selector" text NOT NULL,
	"algorithm" text DEFAULT 'rsa-sha256' NOT NULL,
	"key_bits" integer NOT NULL,
	"public_key" text NOT NULL,
	"private_key_sealed" text NOT NULL,
	"status" "dkim_key_status" DEFAULT 'pending' NOT NULL,
	"activated_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dns_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"domain_id" uuid NOT NULL,
	"purpose" "dns_record_purpose" NOT NULL,
	"type" text NOT NULL,
	"host" text NOT NULL,
	"value" text NOT NULL,
	"priority" smallint,
	"required" boolean NOT NULL,
	"status" "dns_record_status" DEFAULT 'pending' NOT NULL,
	"observed" jsonb,
	"detail" text,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "domain_status" DEFAULT 'pending' NOT NULL,
	"ownership_token" text NOT NULL,
	"ownership_verified_at" timestamp with time zone,
	"return_path_label" text DEFAULT 'bounce' NOT NULL,
	"return_path_verified_at" timestamp with time zone,
	"sending_enabled" boolean DEFAULT false NOT NULL,
	"last_checked_at" timestamp with time zone,
	"next_check_at" timestamp with time zone DEFAULT now() NOT NULL,
	"check_lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"content_base64" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_contents" (
	"email_id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"html" text,
	"text" text,
	"reply_to" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"to_header" jsonb NOT NULL,
	"cc_header" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_delivery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"stage" "attempt_stage" NOT NULL,
	"outcome" text NOT NULL,
	"mta_queue_id" text,
	"remote_host" text,
	"smtp_code" smallint,
	"enhanced_status" text,
	"response" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"email_id" uuid NOT NULL,
	"recipient_id" uuid,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_idempotency_keys" (
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "email_idempotency_keys_org_id_key_pk" PRIMARY KEY("org_id","key")
);
--> statement-breakpoint
CREATE TABLE "email_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email_id" uuid NOT NULL,
	"kind" "recipient_kind" NOT NULL,
	"address" text NOT NULL,
	"address_lower" text NOT NULL,
	"stream" "email_stream" NOT NULL,
	"state" "recipient_state" NOT NULL,
	"state_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submission_attempts" integer DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"mta_queue_id" text,
	"last_smtp_code" smallint,
	"last_enhanced_status" text,
	"last_response" text,
	"bounce_class" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"domain_id" uuid NOT NULL,
	"source" "email_source" NOT NULL,
	"stream" "email_stream" DEFAULT 'transactional' NOT NULL,
	"api_key_id" uuid,
	"smtp_credential_id" uuid,
	"from_address" text NOT NULL,
	"from_name" text,
	"subject" text NOT NULL,
	"message_id" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scheduled_at" timestamp with time zone,
	"recipient_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mta_queue_messages" (
	"queue_id" text PRIMARY KEY NOT NULL,
	"recipient_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "org_status" DEFAULT 'active' NOT NULL,
	"sending_tier" "sending_tier" DEFAULT 'sandbox' NOT NULL,
	"daily_recipient_limit" integer DEFAULT 100 NOT NULL,
	"per_minute_recipient_limit" integer DEFAULT 10 NOT NULL,
	"suspended_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smtp_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"allowed_cidrs" text[],
	"domain_id" uuid,
	"created_by_user_id" uuid,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"address_lower" text NOT NULL,
	"reason" "suppression_reason" NOT NULL,
	"detail" text,
	"source_recipient_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"active_org_id" uuid,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"platform_role" "platform_role",
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"delivery_id" uuid NOT NULL,
	"attempt_no" integer NOT NULL,
	"status_code" smallint,
	"error" text,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "webhook_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"last_status_code" smallint,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"event_types" text[] NOT NULL,
	"secret_sealed" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"disabled_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_checkpoints" (
	"name" text PRIMARY KEY NOT NULL,
	"file_id" text,
	"position" bigint DEFAULT 0 NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"watermark_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounce_events" ADD CONSTRAINT "bounce_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounce_events" ADD CONSTRAINT "bounce_events_recipient_id_email_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."email_recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dkim_keys" ADD CONSTRAINT "dkim_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dkim_keys" ADD CONSTRAINT "dkim_keys_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dns_records" ADD CONSTRAINT "dns_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dns_records" ADD CONSTRAINT "dns_records_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_contents" ADD CONSTRAINT "email_contents_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_contents" ADD CONSTRAINT "email_contents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_delivery_attempts" ADD CONSTRAINT "email_delivery_attempts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_delivery_attempts" ADD CONSTRAINT "email_delivery_attempts_recipient_id_email_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."email_recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_recipient_id_email_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."email_recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_idempotency_keys" ADD CONSTRAINT "email_idempotency_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_recipients" ADD CONSTRAINT "email_recipients_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_recipients" ADD CONSTRAINT "email_recipients_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mta_queue_messages" ADD CONSTRAINT "mta_queue_messages_recipient_id_email_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."email_recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smtp_credentials" ADD CONSTRAINT "smtp_credentials_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smtp_credentials" ADD CONSTRAINT "smtp_credentials_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smtp_credentials" ADD CONSTRAINT "smtp_credentials_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_active_org_id_organizations_id_fk" FOREIGN KEY ("active_org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_attempts" ADD CONSTRAINT "webhook_attempts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_attempts" ADD CONSTRAINT "webhook_attempts_delivery_id_webhook_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."webhook_deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hash_uq" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_org_project_idx" ON "api_keys" USING btree ("org_id","project_id");--> statement-breakpoint
CREATE INDEX "audit_logs_org_time_idx" ON "audit_logs" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "bounce_events_dedupe_uq" ON "bounce_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "bounce_events_org_idx" ON "bounce_events" USING btree ("org_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dkim_keys_domain_selector_uq" ON "dkim_keys" USING btree ("domain_id","selector");--> statement-breakpoint
CREATE UNIQUE INDEX "dns_records_domain_purpose_host_uq" ON "dns_records" USING btree ("domain_id","purpose","host");--> statement-breakpoint
CREATE INDEX "domains_org_project_idx" ON "domains" USING btree ("org_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "domains_org_name_uq" ON "domains" USING btree ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "domains_verified_name_uq" ON "domains" USING btree ("name") WHERE "domains"."ownership_verified_at" is not null and "domains"."status" <> 'disabled';--> statement-breakpoint
CREATE INDEX "domains_next_check_idx" ON "domains" USING btree ("next_check_at");--> statement-breakpoint
CREATE INDEX "email_attachments_email_idx" ON "email_attachments" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "email_delivery_attempts_recipient_idx" ON "email_delivery_attempts" USING btree ("recipient_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_events_dedupe_uq" ON "email_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "email_events_email_idx" ON "email_events" USING btree ("email_id","occurred_at");--> statement-breakpoint
CREATE INDEX "email_events_org_time_idx" ON "email_events" USING btree ("org_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "email_idempotency_expires_idx" ON "email_idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "email_recipients_email_idx" ON "email_recipients" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "email_recipients_dispatch_idx" ON "email_recipients" USING btree ("stream","next_attempt_at") WHERE "email_recipients"."state" in ('QUEUED', 'SCHEDULED', 'RETRYING');--> statement-breakpoint
CREATE INDEX "email_recipients_lease_idx" ON "email_recipients" USING btree ("lease_expires_at") WHERE "email_recipients"."state" in ('DISPATCHING', 'DELIVERY_UNKNOWN');--> statement-breakpoint
CREATE INDEX "email_recipients_org_created_idx" ON "email_recipients" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "email_recipients_queue_id_idx" ON "email_recipients" USING btree ("mta_queue_id");--> statement-breakpoint
CREATE INDEX "emails_org_created_idx" ON "emails" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "emails_message_id_uq" ON "emails" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_members_org_user_uq" ON "organization_members" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "organization_members_user_idx" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_uq" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "projects_org_idx" ON "projects" USING btree ("org_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "smtp_credentials_username_uq" ON "smtp_credentials" USING btree ("username");--> statement-breakpoint
CREATE INDEX "smtp_credentials_org_idx" ON "smtp_credentials" USING btree ("org_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppressions_org_address_uq" ON "suppressions" USING btree ("org_id","address_lower");--> statement-breakpoint
CREATE UNIQUE INDEX "user_sessions_token_uq" ON "user_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "user_sessions_user_idx" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "webhook_attempts_delivery_idx" ON "webhook_attempts" USING btree ("delivery_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_endpoint_event_uq" ON "webhook_deliveries" USING btree ("endpoint_id","event_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_due_idx" ON "webhook_deliveries" USING btree ("next_attempt_at") WHERE "webhook_deliveries"."status" in ('pending', 'retrying');--> statement-breakpoint
CREATE INDEX "webhook_deliveries_endpoint_idx" ON "webhook_deliveries" USING btree ("endpoint_id","created_at");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_org_project_idx" ON "webhook_endpoints" USING btree ("org_id","project_id");--> statement-breakpoint
CREATE INDEX "workspaces_org_idx" ON "workspaces" USING btree ("org_id");