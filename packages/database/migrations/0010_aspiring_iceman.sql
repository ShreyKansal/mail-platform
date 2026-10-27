CREATE TABLE "automation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"event" text NOT NULL,
	"contact_id" uuid NOT NULL,
	"properties" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"automation_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"event_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"email" text NOT NULL,
	"event" text NOT NULL,
	"properties" jsonb NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"current_node_id" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_steps" (
	"run_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"email_id" uuid,
	"error" text,
	CONSTRAINT "automation_steps_run_id_node_id_pk" PRIMARY KEY("run_id","node_id")
);
--> statement-breakpoint
CREATE TABLE "automation_versions" (
	"automation_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"definition" jsonb NOT NULL,
	"sender" jsonb NOT NULL,
	"public_api_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_versions_automation_id_version_pk" PRIMARY KEY("automation_id","version")
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"published_version" integer,
	"draft" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_event_id_automation_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."automation_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_steps" ADD CONSTRAINT "automation_steps_run_id_automation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."automation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_steps" ADD CONSTRAINT "automation_steps_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_versions" ADD CONSTRAINT "automation_versions_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_events_idempotency_idx" ON "automation_events" USING btree ("org_id","project_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "automation_events_contact_idx" ON "automation_events" USING btree ("org_id","project_id","contact_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_runs_event_idx" ON "automation_runs" USING btree ("automation_id","event_id");--> statement-breakpoint
CREATE INDEX "automation_runs_due_idx" ON "automation_runs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "automation_runs_project_idx" ON "automation_runs" USING btree ("org_id","project_id","automation_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_steps_email_idx" ON "automation_steps" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "automations_project_idx" ON "automations" USING btree ("org_id","project_id","created_at");
--> statement-breakpoint
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE automations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON automations USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON automations TO mp_app, mp_service;

--> statement-breakpoint
ALTER TABLE automation_versions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE automation_versions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON automation_versions USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON automation_versions TO mp_app, mp_service;

--> statement-breakpoint
ALTER TABLE automation_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE automation_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON automation_events USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON automation_events TO mp_app, mp_service;

--> statement-breakpoint
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE automation_runs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON automation_runs USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON automation_runs TO mp_app, mp_service;

--> statement-breakpoint
ALTER TABLE automation_steps ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE automation_steps FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON automation_steps USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON automation_steps TO mp_app, mp_service;
