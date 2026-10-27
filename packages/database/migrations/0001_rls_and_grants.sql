-- Runtime role grants and row-level security.
--
-- Roles (created by infrastructure, see infrastructure/docker/postgres/init and docs/architecture/TENANT-ISOLATION.md):
--   mp_app      API request path. NOBYPASSRLS: every tenant table is filtered by app_current_org().
--   mp_service  Delivery workers and pre-tenant authentication lookups. BYPASSRLS; code filters explicitly.

CREATE FUNCTION app_current_org() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO mp_app, mp_service;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_current_org() TO mp_app, mp_service;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mp_service;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mp_service;
--> statement-breakpoint

-- Mutable tenant tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  workspaces, projects, organization_members, api_keys, smtp_credentials,
  domains, dns_records, dkim_keys,
  emails, email_contents, email_attachments, email_recipients, email_idempotency_keys,
  suppressions, webhook_endpoints, webhook_deliveries
TO mp_app;
--> statement-breakpoint

-- Append-only tenant tables: the API may write and read but never rewrite history.
GRANT SELECT, INSERT ON email_events, email_delivery_attempts, bounce_events, webhook_attempts, audit_logs TO mp_app;
--> statement-breakpoint

-- Organizations: visible only for the bound tenant; creation happens via the service role at signup.
GRANT SELECT, UPDATE ON organizations TO mp_app;
--> statement-breakpoint

-- Users: the API may read identity columns only. Password hashes and lockout
-- state are reachable exclusively through the service role (auth module).
GRANT SELECT (id, email, name, created_at) ON users TO mp_app;
--> statement-breakpoint
-- user_sessions, mta_queue_messages and worker_checkpoints are service-only (no mp_app grant).

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workspaces', 'projects', 'organization_members', 'api_keys', 'smtp_credentials',
    'domains', 'dns_records', 'dkim_keys',
    'emails', 'email_contents', 'email_attachments', 'email_recipients', 'email_idempotency_keys',
    'email_events', 'email_delivery_attempts', 'bounce_events',
    'suppressions', 'webhook_endpoints', 'webhook_deliveries', 'webhook_attempts', 'audit_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO mp_app USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org())',
      t
    );
  END LOOP;
END $$;
--> statement-breakpoint

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON organizations TO mp_app
  USING (id = app_current_org()) WITH CHECK (id = app_current_org());
--> statement-breakpoint

-- Service-only tables still get RLS enabled with no mp_app policy, so an
-- accidental future grant fails closed.
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mta_queue_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE worker_checkpoints ENABLE ROW LEVEL SECURITY;
