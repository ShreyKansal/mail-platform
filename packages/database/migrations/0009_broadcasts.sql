CREATE TABLE "broadcast_recipients" (
	"broadcast_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"email_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broadcast_recipients_broadcast_id_contact_id_pk" PRIMARY KEY("broadcast_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"from_address" text DEFAULT '' NOT NULL,
	"reply_to" text,
	"subject" text DEFAULT '' NOT NULL,
	"html" text DEFAULT '' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"audience" text DEFAULT 'all' NOT NULL,
	"contact_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"scheduled_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sender" jsonb,
	"public_api_url" text,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"processed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_broadcast_id_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."broadcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "broadcast_recipients_email_idx" ON "broadcast_recipients" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "broadcast_recipients_pending_idx" ON "broadcast_recipients" USING btree ("broadcast_id","status","contact_id");--> statement-breakpoint
CREATE INDEX "broadcasts_project_created_idx" ON "broadcasts" USING btree ("org_id","project_id","created_at");--> statement-breakpoint
CREATE INDEX "broadcasts_due_idx" ON "broadcasts" USING btree ("status","next_attempt_at");
--> statement-breakpoint
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE broadcasts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON broadcasts USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());
--> statement-breakpoint
ALTER TABLE broadcast_recipients ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE broadcast_recipients FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON broadcast_recipients USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON broadcasts, broadcast_recipients TO mp_app, mp_service;
