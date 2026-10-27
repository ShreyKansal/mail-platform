# Templates, contacts and settings

These capabilities extend the existing API and Postfix delivery path. Templates and contacts remain partial product areas; broadcasts, topics, segments, automations and inboxes are still open work.

## Templates

All template resources are scoped to the authenticated organization and project. Reading requires `templates:read`; mutations require `templates:manage`. Owners, admins and developers can manage templates. Full-access API keys can manage them; sending-only keys can use a published template through the email API without reading or editing its draft. The read_only role can inspect templates.

- `POST /v1/templates`: create `{name, content}`. Content requires a single-line `subject`, at least one of `html`/`text`, and optional `variables` definitions.
- `GET /v1/templates`: cursor pagination; archived templates are omitted unless `archived=true`.
- `GET /v1/templates/{id}`: current draft, revision, published version and archive state.
- `PATCH /v1/templates/{id}`: replace `{name, content, expected_revision}`. A stale revision returns `409`; editing an archived template also fails.
- `POST /v1/templates/{id}/publish`: `{expected_revision}` publishes an immutable snapshot. Publishing the same revision again is idempotent. Publication and editing serialize on the template row. Revision numbers can have gaps when several draft saves precede publication.
- `GET /v1/templates/{id}/versions`: published snapshots, newest first. `limit` is 1–100; use `next_before` as the next request's `before`.
- `POST /v1/templates/{id}/preview`: `{variables, version?}` renders the saved draft by default, or a specified published version. No email is sent.
- `POST /v1/templates/{id}/archive` and `/restore`: reversible lifecycle changes. Archive blocks new template sends while retaining history and already-admitted email content.

Example content:

```json
{
  "subject": "Welcome, {{name}}",
  "html": "<p>Hello {{name}}. Your balance is {{balance}}.</p>",
  "variables": {
    "name": {"type":"string", "required":true},
    "balance": {"type":"number", "required":false, "default":0}
  }
}
```

Variables use double braces and ASCII identifiers starting with a letter. Up to 50 definitions are allowed. String and finite-number types are checked, including defaults. Unknown variables, missing required values, undeclared placeholders and unsupported expressions fail validation. HTML values are escaped. Interpolation inside HTML tags/attributes and script/style blocks is rejected; there are no raw HTML values, conditionals, loops or arbitrary code execution. Values are substituted once, never recursively. Expanded size is checked before constructing the result; subject header injection is rejected. Optional variables without defaults become empty strings. Body and request-size limits still apply.

Send a published template through either the single or batch email endpoint:

```json
{
  "from": "sender@your-verified-domain.com",
  "to": "success@simulate.mail-platform.invalid",
  "test_mode": true,
  "template": {
    "id": "a-template-uuid",
    "version": 1,
    "variables": {"name":"Sam", "balance":20}
  }
}
```

Omit `version` to resolve the currently published snapshot. Do not combine `template` with `subject`, `html` or `text`. Sender, recipients, attachments, headers, tags, scheduling and normal admission rules remain available. Existing non-template clients still provide subject and HTML/text as before. At admission, rendered content and the immutable version ID are persisted. Later draft/publication changes do not alter queued content. An idempotent replay resolves its original email before looking up the current template, preserving the original result. Invalid template references keep batch admission atomic.

The dashboard includes draft editing, typed variable JSON, saved-draft preview in a sandboxed iframe, publication, paginated version inspection, archive/restore and a published-version simulation action. Save before preview/publish. Missing features include the visual block editor, autosave, collaboration, duplication and richer expression support. No Resend wire compatibility is claimed.

## Contacts

Contact resources require `contacts:read` or `contacts:manage` and enforce organization/project ownership. Full-access keys and developers can manage contacts; sending-only keys cannot.

- `POST /v1/contacts`: `{email, first_name?, last_name?, unsubscribed?, properties?}`. The email identity is unique case-insensitively within a project. A duplicate, including an archived identity, returns `409`.
- `GET /v1/contacts`: standard cursor pagination with literal case-insensitive `search`, `unsubscribed=true|false` and `archived=true` to include archived rows.
- `GET /v1/contacts/{id}`: contact and current revision.
- `PATCH /v1/contacts/{id}`: `{expected_revision, contact: {...}}`, replacing names, status and properties. Changing the email identity is rejected. Stale revisions return `409`.
- `POST /v1/contacts/{id}/archive` and `/restore`: reversible archive. Archived rows are excluded by default, cannot be edited, and retain their subscription status when restored.
- `POST /v1/contacts/import`: `{contacts: [...]}` with 1–500 complete records. Imports are synchronous JSON, bounded to a 4 MiB request. The entire request validates first and commits atomically. Duplicate input emails are rejected case-insensitively. Existing contacts receive replacement names/properties; their unsubscribe state is preserved even when input omits it or sets false. Archived contacts are skipped, never automatically restored. The response counts created, updated and skipped archived contacts. Concurrent identity creation can return `409`; retry the import.

Custom property values support strings, finite numbers, booleans and null, with at most 50 named values. Property names follow the template identifier format. There is no central property-definition registry yet. Create/update/import/archive actions write audit records without storing the imported address list in audit metadata. The dashboard provides contact search, editing, subscription state, archive/restore and JSON import.

Contact subscription state is a marketing preference, separate from transactional bounce/manual suppressions. It does not block transactional sends. Only administrators/developers with management permission should explicitly re-subscribe a contact after obtaining consent; imports never do this automatically. Public signed preference pages, RFC 8058 unsubscribe, topics, segments, CSV import jobs and contact webhooks remain unimplemented. These omissions block claiming complete marketing parity.

## Settings

`GET /v1/settings/team` requires a dashboard session with `members:read` and returns the current team's name and member names, emails and roles. `PATCH /v1/settings/team` accepts `{name}` and requires a dashboard session with `org:manage`; it cannot select another organization or change status, quotas or roles. Renaming is audited. API keys cannot use either route.

The Settings page shows profile/project information, team members, current sending limits and links to exports, notifications and SMTP credentials. This does not implement invitations, project switching, password recovery, verification, MFA, SSO, billing or account deletion.

## Persistence and validation

Migration `0007_templates_contacts` adds templates, immutable version snapshots, contacts and email version provenance. All new tables force tenant RLS. The application role cannot update or delete published snapshots. Contact/template archive is intentionally reversible; content retention and physical erasure policies remain separate work.

Behavioral evidence lives in `packages/core/src/templates.test.ts` and `tests/integration/product.test.ts`, alongside the existing SMTP, delivery, Batch 1 and security suites. Dashboard compilation is checked; browser end-to-end inspection remains pending because this session has no connected browser.
