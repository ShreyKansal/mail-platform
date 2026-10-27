ALTER TABLE webhook_deliveries ADD COLUMN retry_cycle_attempts integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE webhook_deliveries SET retry_cycle_attempts = attempts;
--> statement-breakpoint
ALTER TABLE email_attachments ADD COLUMN content_id text;
