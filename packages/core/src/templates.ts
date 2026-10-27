import { MAX_BODY_CHARS, templateContent, type SendEmailRequest } from '@mp/contracts';
import { and, eq, templates, templateVersions, type TemplateContent, type Tx } from '@mp/database';
import { AppError } from '@mp/shared';
const token = /{{\s*([A-Za-z][A-Za-z0-9_]{0,63})\s*}}/g;
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function validateTemplate(content: TemplateContent): void {
    templateContent.parse(content);
    for (const [name, spec] of Object.entries(content.variables)) {
        if (spec.default !== undefined && typeof spec.default !== spec.type)
            throw new AppError('validation_error', `default for ${name} must be ${spec.type}`);
    }
    for (const body of [content.subject, content.html ?? '', content.text ?? '']) {
        const remainder = body.replace(token, (_match, key: string) => {
            if (!Object.hasOwn(content.variables, key))
                throw new AppError('validation_error', `undeclared template variable: ${key}`);
            return '';
        });
        if (remainder.includes('{{') || remainder.includes('}}'))
            throw new AppError('validation_error', 'unsupported template expression; use {{variable}}');
    }
    // Restrict interpolation to text content. Attribute/tag interpolation needs URL/CSS-aware escaping.
    if (/<[^>]*{{/.test(content.html ?? ''))
        throw new AppError('validation_error', 'HTML variables are supported in text content only, not inside tags or attributes');
    for (const block of (content.html ?? '').matchAll(/<(script|style)\b[^>]*>([\s\S]*?)(?:<\/\1\s*>|$)/gi)) {
        if (block[2]!.includes('{{'))
            throw new AppError('validation_error', 'variables are not supported inside script or style blocks');
    }
}
export function renderTemplate(content: TemplateContent, supplied: Record<string, string | number>) {
    validateTemplate(content);
    for (const key of Object.keys(supplied))
        if (!Object.hasOwn(content.variables, key))
            throw new AppError('validation_error', `unknown template variable: ${key}`);
    const values: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const [key, spec] of Object.entries(content.variables)) {
        const value = Object.hasOwn(supplied, key) ? supplied[key] : spec.default;
        if (value === undefined) {
            if (spec.required)
                throw new AppError('validation_error', `missing template variable: ${key}`);
            values[key] = '';
            continue;
        }
        if (typeof value !== spec.type || (typeof value === 'number' && !Number.isFinite(value)))
            throw new AppError('validation_error', `variable ${key} must be ${spec.type}`);
        values[key] = String(value);
    }
    const render = (body: string, html: boolean, max: number) => {
        const replacements = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, html ? escape(value) : value]));
        let length = body.length;
        for (const match of body.matchAll(token))
            length += replacements[match[1]!]!.length - match[0].length;
        if (length > max)
            throw new AppError('payload_too_large', 'rendered template is too large');
        return body.replace(token, (_match, key: string) => replacements[key]!);
    };
    const subject = render(content.subject, false, 998);
    if (!subject || subject.length > 998 || /[\r\n\0]/.test(subject))
        throw new AppError('validation_error', 'rendered subject must be a nonempty single line up to 998 characters');
    const html = content.html === undefined ? undefined : render(content.html, true, MAX_BODY_CHARS);
    const text = content.text === undefined ? undefined : render(content.text, false, MAX_BODY_CHARS);
    if ((html?.length ?? 0) > MAX_BODY_CHARS || (text?.length ?? 0) > MAX_BODY_CHARS)
        throw new AppError('payload_too_large', 'rendered template is too large');
    return { subject, html, text };
}
export async function resolveEmailTemplates(tx: Tx, orgId: string, projectId: string, requests: SendEmailRequest[]) {
    const resolved: Array<{
        request: SendEmailRequest;
        versionId?: string;
    }> = [];
    for (const request of requests) {
        if (!request.template) {
            resolved.push({ request });
            continue;
        }
        const [template] = await tx.select().from(templates).where(and(eq(templates.id, request.template.id), eq(templates.orgId, orgId), eq(templates.projectId, projectId)));
        if (!template || template.archivedAt)
            throw new AppError('not_found', 'template not found');
        const version = request.template.version ?? template.publishedVersion;
        if (!version)
            throw new AppError('invalid_state', 'template has no published version');
        const [published] = await tx.select().from(templateVersions).where(and(eq(templateVersions.templateId, template.id), eq(templateVersions.orgId, orgId), eq(templateVersions.version, version)));
        if (!published)
            throw new AppError('not_found', 'published template version not found');
        const { template: _reference, ...rest } = request;
        resolved.push({ request: { ...rest, ...renderTemplate(published.content, request.template.variables) }, versionId: published.id });
    }
    return resolved;
}
