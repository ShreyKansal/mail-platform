CREATE TABLE "api_request_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"api_key_id" uuid,
	"method" text NOT NULL,
	"route" text NOT NULL,
	"status_code" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"email_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_request_logs" ADD CONSTRAINT "api_request_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_request_logs" ADD CONSTRAINT "api_request_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_shares" ADD CONSTRAINT "email_shares_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_shares" ADD CONSTRAINT "email_shares_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_shares" ADD CONSTRAINT "email_shares_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_request_logs_project_time_idx" ON "api_request_logs" USING btree ("org_id","project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "email_shares_token_uq" ON "email_shares" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "email_shares_email_idx" ON "email_shares" USING btree ("email_id");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON email_shares TO mp_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON api_request_logs TO mp_app;
--> statement-breakpoint
ALTER TABLE email_shares ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE email_shares FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON email_shares USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());
--> statement-breakpoint
ALTER TABLE api_request_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE api_request_logs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON api_request_logs USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());
