CREATE TABLE "export_chunks" (
	"job_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"part" integer NOT NULL,
	"csv" text NOT NULL,
	CONSTRAINT "export_chunks_job_id_part_pk" PRIMARY KEY("job_id","part")
);
--> statement-breakpoint
CREATE TABLE "export_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cursor" jsonb,
	"row_count" integer DEFAULT 0 NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"resource_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dkim_keys" ADD COLUMN "retire_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "is_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN "consecutive_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN "first_failure_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN "last_failure_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN "last_success_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN "health_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "export_chunks" ADD CONSTRAINT "export_chunks_job_id_export_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."export_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_chunks" ADD CONSTRAINT "export_chunks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "export_jobs_project_time_idx" ON "export_jobs" USING btree ("org_id","project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_project_time_idx" ON "notifications" USING btree ("org_id","project_id","created_at" DESC NULLS LAST);
--> statement-breakpoint
GRANT SELECT, INSERT ON export_jobs TO mp_app;
--> statement-breakpoint
GRANT SELECT ON export_chunks, notifications TO mp_app;
--> statement-breakpoint
ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE export_jobs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON export_jobs USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());
--> statement-breakpoint
ALTER TABLE export_chunks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE export_chunks FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON export_chunks USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());
--> statement-breakpoint
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON notifications USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());
