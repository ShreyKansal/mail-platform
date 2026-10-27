CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"email" text NOT NULL,
	"email_lower" text NOT NULL,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"unsubscribed" boolean DEFAULT false NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"draft" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"published_version" integer,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "template_version_id" uuid;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_project_email_uq" ON "contacts" USING btree ("project_id","email_lower");--> statement-breakpoint
CREATE INDEX "contacts_project_created_idx" ON "contacts" USING btree ("org_id","project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "template_versions_number_uq" ON "template_versions" USING btree ("template_id","version");--> statement-breakpoint
CREATE INDEX "templates_project_created_idx" ON "templates" USING btree ("org_id","project_id","created_at");--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_template_version_id_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_versions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE templates FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON templates USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON templates TO mp_app;

--> statement-breakpoint
ALTER TABLE template_versions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE template_versions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON template_versions USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());
--> statement-breakpoint
GRANT SELECT, INSERT ON template_versions TO mp_app;

--> statement-breakpoint
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON contacts USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON contacts TO mp_app;
