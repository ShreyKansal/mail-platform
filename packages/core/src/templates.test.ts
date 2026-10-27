import { describe, expect, it } from 'vitest';
import { renderTemplate, validateTemplate } from './templates';
const content = { subject: 'Hello {{name}}', html: '<p>{{name}} / {{count}}</p>', text: '{{name}} / {{count}}', variables: { name: { type: 'string' as const, required: true }, count: { type: 'number' as const, required: false, default: 2 } } };
describe('safe template rendering', () => {
    it('escapes HTML, preserves plain text and applies typed defaults', () => {
        expect(renderTemplate(content, { name: '<b>"Sam"</b>' })).toEqual({ subject: 'Hello <b>"Sam"</b>', html: '<p>&lt;b&gt;&quot;Sam&quot;&lt;/b&gt; / 2</p>', text: '<b>"Sam"</b> / 2' });
    });
    it('rejects undeclared, unknown, missing and incorrectly typed variables', () => {
        expect(() => validateTemplate({ ...content, subject: '{{unknown}}' })).toThrow('undeclared');
        expect(() => renderTemplate(content, {})).toThrow('missing');
        expect(() => renderTemplate(content, { name: 'Sam', extra: 'x' })).toThrow('unknown');
        expect(() => renderTemplate(content, { name: 'Sam', count: '2' })).toThrow('number');
        expect(() => validateTemplate({ ...content, variables: { ...content.variables, count: { type: 'number', required: false, default: '2' } } })).toThrow('default');
    });
    it('rejects attribute interpolation, expressions and header injection', () => {
        expect(() => validateTemplate({ ...content, html: '<a href="{{name}}">Link</a>' })).toThrow('attributes');
        expect(() => validateTemplate({ ...content, html: '<script>run({{name}})</script>' })).toThrow('script or style');
        expect(() => validateTemplate({ ...content, html: '<style>{{name}}</style>' })).toThrow('script or style');
        expect(() => validateTemplate({ ...content, html: '{{#if name}}' })).toThrow('expression');
        expect(() => renderTemplate(content, { name: 'Sam\r\nBcc: victim@example.org' })).toThrow('single line');
    });
    it('does not recursively evaluate values and rejects expansion before allocation', () => {
        expect(renderTemplate(content, { name: '{{count}}' }).text).toBe('{{count}} / 2');
        expect(() => renderTemplate({ ...content, subject: 'Hello', html: '{{name}}'.repeat(30000) }, { name: 'x'.repeat(10000) })).toThrow('too large');
    });
});
