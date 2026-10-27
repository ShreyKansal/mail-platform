import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contacts, emailContents, emails, eq, organizationMembers, templateVersions, templates, withTenant } from '@mp/database';
import { addVerifiedDomain, bearer, createAccount, createHarness, sessionHeaders, type Account, type Harness } from '../support/harness';
let h: Harness, a: Account, b: Account;
const run = randomUUID().slice(0, 8), domain = `product-${run}.test`;
const content = { subject: 'Hello {{name}}', html: '<p>{{name}}</p>', variables: { name: { type: 'string', required: true } } };
const create = () => h.app.inject({ method: 'POST', url: '/v1/templates', headers: bearer(a.apiKey), payload: { name: 'Welcome', content } });
beforeAll(async () => { h = await createHarness(); a = await createAccount(h, `product-${run}`); b = await createAccount(h, `product-other-${run}`); await addVerifiedDomain(h, a, domain); });
afterAll(async () => h?.close());
describe('published templates', () => {
    it('requires publishing and snapshots versioned content while preserving idempotency', async () => {
        const created = await create();
        expect(created.statusCode).toBe(201);
        const t = created.json();
        const request = { from: `sender@${domain}`, to: 'success@simulate.mail-platform.invalid', test_mode: true, scheduled_at: new Date(Date.now() + 3600000).toISOString(), template: { id: t.id, variables: { name: '<b>Sam</b>' } } };
        const send = () => h.app.inject({ method: 'POST', url: '/v1/emails', headers: { ...bearer(a.apiKey), 'idempotency-key': `template-${run}` }, payload: request });
        expect((await send()).statusCode).toBe(409);
        const publish = () => h.app.inject({ method: 'POST', url: `/v1/templates/${t.id}/publish`, headers: bearer(a.apiKey), payload: { expected_revision: 1 } });
        expect((await publish()).statusCode).toBe(200);
        expect((await publish()).statusCode).toBe(200);
        expect(await h.dbs.service.select().from(templateVersions).where(eq(templateVersions.templateId, t.id))).toHaveLength(1);
        const sent = await send();
        expect(sent.statusCode).toBe(202);
        const emailId = sent.json().id;
        const [stored] = await h.dbs.service.select().from(emailContents).where(eq(emailContents.emailId, emailId));
        expect(stored!.html).toBe('<p>&lt;b&gt;Sam&lt;/b&gt;</p>');
        const updated = await h.app.inject({ method: 'PATCH', url: `/v1/templates/${t.id}`, headers: bearer(a.apiKey), payload: { name: 'Changed', content: { ...content, subject: 'New subject' }, expected_revision: 1 } });
        expect(updated.statusCode).toBe(200);
        await h.app.inject({ method: 'POST', url: `/v1/templates/${t.id}/publish`, headers: bearer(a.apiKey), payload: { expected_revision: 2 } });
        const replay = await send();
        expect(replay.json().id).toBe(emailId);
        expect(replay.headers['idempotent-replayed']).toBe('true');
        const [email] = await h.dbs.service.select().from(emails).where(eq(emails.id, emailId));
        const [version] = await h.dbs.service.select().from(templateVersions).where(eq(templateVersions.id, email!.templateVersionId!));
        expect(version!.version).toBe(1);
        expect(email!.subject).toBe('Hello <b>Sam</b>');
        const pinned = await h.app.inject({ method: 'POST', url: '/v1/emails', headers: bearer(a.apiKey), payload: { ...request, template: { ...request.template, version: 1 } } });
        expect(pinned.statusCode).toBe(202);
        expect((await h.app.inject({ method: 'GET', url: `/v1/emails/${pinned.json().id}`, headers: bearer(a.apiKey) })).json().subject).toBe('Hello <b>Sam</b>');
    });
    it('serializes competing edits and rejects stale publish, cross-tenant reads and invalid variables', async () => {
        const t = (await create()).json();
        const patch = (name: string) => h.app.inject({ method: 'PATCH', url: `/v1/templates/${t.id}`, headers: bearer(a.apiKey), payload: { name, content, expected_revision: 1 } });
        const results = await Promise.all([patch('First'), patch('Second')]);
        expect(results.map(r => r.statusCode).sort()).toEqual([200, 409]);
        expect((await h.app.inject({ method: 'POST', url: `/v1/templates/${t.id}/publish`, headers: bearer(a.apiKey), payload: { expected_revision: 1 } })).statusCode).toBe(409);
        expect((await h.app.inject({ method: 'GET', url: `/v1/templates/${t.id}`, headers: bearer(b.apiKey) })).statusCode).toBe(404);
        expect(await withTenant(h.dbs.app, b.orgId, tx => tx.select().from(templates).where(eq(templates.id, t.id)))).toHaveLength(0);
        const missing = await h.app.inject({ method: 'POST', url: `/v1/templates/${t.id}/preview`, headers: bearer(a.apiKey), payload: { variables: {} } });
        expect(missing.statusCode).toBe(422);
        const preview = await h.app.inject({ method: 'POST', url: `/v1/templates/${t.id}/preview`, headers: bearer(a.apiKey), payload: { variables: { name: '<img src=x onerror=alert(1)>' } } });
        expect(preview.json().html).toContain('&lt;img');
    });
    it('archives reversibly, rejects new sends and retains versions and existing queued content', async () => {
        const t = (await create()).json();
        await h.app.inject({ method: 'POST', url: `/v1/templates/${t.id}/publish`, headers: bearer(a.apiKey), payload: { expected_revision: 1 } });
        await h.app.inject({ method: 'POST', url: `/v1/templates/${t.id}/archive`, headers: bearer(a.apiKey) });
        expect((await h.app.inject({ method: 'POST', url: '/v1/emails', headers: bearer(a.apiKey), payload: { from: `sender@${domain}`, to: 'success@simulate.mail-platform.invalid', test_mode: true, template: { id: t.id, variables: { name: 'Sam' } } } })).statusCode).toBe(404);
        expect(await h.dbs.service.select().from(templateVersions).where(eq(templateVersions.templateId, t.id))).toHaveLength(1);
        expect((await h.app.inject({ method: 'POST', url: `/v1/templates/${t.id}/restore`, headers: bearer(a.apiKey) })).statusCode).toBe(200);
    });
    it('keeps batch admission atomic when one template reference is invalid', async () => {
        const t = (await create()).json();
        await h.app.inject({ method: 'POST', url: `/v1/templates/${t.id}/publish`, headers: bearer(a.apiKey), payload: { expected_revision: 1 } });
        const request = { from: `sender@${domain}`, to: 'success@simulate.mail-platform.invalid', test_mode: true, template: { id: t.id, variables: { name: 'Sam' } } };
        const before = await h.dbs.service.select({ id: emails.id }).from(emails).where(eq(emails.orgId, a.orgId));
        expect((await h.app.inject({ method: 'POST', url: '/v1/emails/batch', headers: bearer(a.apiKey), payload: [request, { ...request, template: { ...request.template, id: randomUUID() } }] })).statusCode).toBe(404);
        expect(await h.dbs.service.select({ id: emails.id }).from(emails).where(eq(emails.orgId, a.orgId))).toHaveLength(before.length);
    });
});
describe('contacts and settings', () => {
    it('deduplicates contact identity case-insensitively and preserves unsubscribe during imports', async () => {
        const created = await h.app.inject({ method: 'POST', url: '/v1/contacts', headers: bearer(a.apiKey), payload: { email: 'Reader@example.org', first_name: 'Sam', unsubscribed: true, properties: { plan: 'pro' } } });
        expect(created.statusCode).toBe(201);
        const c = created.json();
        expect((await h.app.inject({ method: 'POST', url: '/v1/contacts', headers: bearer(a.apiKey), payload: { email: 'reader@example.org' } })).statusCode).toBe(409);
        const imported = await h.app.inject({ method: 'POST', url: '/v1/contacts/import', headers: bearer(a.apiKey), payload: { contacts: [{ email: 'reader@example.org', first_name: 'Updated' }, { email: 'new@example.org' }] } });
        expect(imported.statusCode).toBe(200);
        expect(imported.json()).toMatchObject({ created: 1, updated: 1 });
        const get = () => h.app.inject({ method: 'GET', url: `/v1/contacts/${c.id}`, headers: bearer(a.apiKey) });
        const current = (await get()).json();
        expect(current.unsubscribed).toBe(true);
        expect(current.first_name).toBe('Updated');
        expect((await h.app.inject({ method: 'PATCH', url: `/v1/contacts/${c.id}`, headers: bearer(a.apiKey), payload: { expected_revision: 1, contact: { email: 'reader@example.org' } } })).statusCode).toBe(409);
        expect((await h.app.inject({ method: 'GET', url: `/v1/contacts/${c.id}`, headers: bearer(b.apiKey) })).statusCode).toBe(404);
        expect(await withTenant(h.dbs.app, b.orgId, tx => tx.select().from(contacts).where(eq(contacts.id, c.id)))).toHaveLength(0);
        await h.app.inject({ method: 'POST', url: `/v1/contacts/${c.id}/archive`, headers: bearer(a.apiKey) });
        expect((await h.app.inject({ method: 'POST', url: '/v1/contacts/import', headers: bearer(a.apiKey), payload: { contacts: [{ email: 'reader@example.org' }] } })).json().skipped_archived).toBe(1);
        expect((await h.app.inject({ method: 'POST', url: `/v1/contacts/${c.id}/restore`, headers: bearer(a.apiKey) })).json().unsubscribed).toBe(true);
    });
    it('rejects malformed or duplicate imports atomically and paginates literal search', async () => {
        const bad = await h.app.inject({ method: 'POST', url: '/v1/contacts/import', headers: bearer(a.apiKey), payload: { contacts: [{ email: 'atomic@example.org' }, { email: 'invalid' }] } });
        expect(bad.statusCode).toBe(422);
        expect((await h.app.inject({ method: 'GET', url: '/v1/contacts?search=atomic', headers: bearer(a.apiKey) })).json().data).toHaveLength(0);
        expect((await h.app.inject({ method: 'POST', url: '/v1/contacts/import', headers: bearer(a.apiKey), payload: { contacts: [{ email: 'duplicate@example.org' }, { email: 'DUPLICATE@example.org' }] } })).statusCode).toBe(422);
        const first = (await h.app.inject({ method: 'GET', url: '/v1/contacts?limit=1', headers: bearer(a.apiKey) })).json();
        expect(first.next_cursor).toBeTruthy();
        const second = (await h.app.inject({ method: 'GET', url: `/v1/contacts?limit=1&cursor=${encodeURIComponent(first.next_cursor)}`, headers: bearer(a.apiKey) })).json();
        expect(second.data[0].id).not.toBe(first.data[0].id);
    });
    it('denies writes to read-only members and keeps team settings tenant scoped and session-only', async () => {
        const team = await h.app.inject({ method: 'GET', url: '/v1/settings/team', headers: sessionHeaders(a.cookie) });
        expect(team.statusCode).toBe(200);
        expect(team.json().members).toHaveLength(1);
        expect((await h.app.inject({ method: 'GET', url: '/v1/settings/team', headers: bearer(a.apiKey) })).statusCode).toBe(403);
        await h.dbs.service.update(organizationMembers).set({ role: 'read_only' }).where(eq(organizationMembers.orgId, a.orgId));
        try {
            expect((await h.app.inject({ method: 'POST', url: '/v1/templates', headers: sessionHeaders(a.cookie), payload: { name: 'Denied', content } })).statusCode).toBe(403);
            expect((await h.app.inject({ method: 'POST', url: '/v1/contacts', headers: sessionHeaders(a.cookie), payload: { email: 'denied@example.org' } })).statusCode).toBe(403);
            expect((await h.app.inject({ method: 'PATCH', url: '/v1/settings/team', headers: sessionHeaders(a.cookie), payload: { name: 'Denied' } })).statusCode).toBe(403);
        }
        finally {
            await h.dbs.service.update(organizationMembers).set({ role: 'owner' }).where(eq(organizationMembers.orgId, a.orgId));
        }
        expect((await h.app.inject({ method: 'PATCH', url: '/v1/settings/team', headers: sessionHeaders(a.cookie), payload: { name: 'Renamed team' } })).statusCode).toBe(200);
        expect((await h.app.inject({ method: 'GET', url: '/auth/session', headers: sessionHeaders(a.cookie) })).json().organization.name).toBe('Renamed team');
        expect((await h.app.inject({ method: 'GET', url: '/auth/session', headers: sessionHeaders(b.cookie) })).json().organization.name).not.toBe('Renamed team');
    });
});
