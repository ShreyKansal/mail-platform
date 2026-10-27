import { ALL_GUIDES, type Guide } from './manifest';

/**
 * Guide bodies come straight from the repository's docs/ folder so the
 * dashboard and the Markdown docs never drift apart. Files are loaded lazily.
 */
const DOCS_PREFIX = '../../../../docs/';
const loaders = import.meta.glob(['../../../../docs/help/**/*.md', '../../../../docs/developer-guides/**/*.md'], { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;

export function hasGuideFile(guide: Guide): boolean {
  return `${DOCS_PREFIX}${guide.file}` in loaders;
}

export async function loadGuide(guide: Guide): Promise<string | null> {
  const load = loaders[`${DOCS_PREFIX}${guide.file}`];
  return load ? load() : null;
}

/** Resolves a relative Markdown link inside `fromFile` to a docs-relative path. */
export function resolveDocPath(fromFile: string, href: string): string {
  const parts = fromFile.split('/').slice(0, -1);
  for (const seg of href.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.' && seg !== '') parts.push(seg);
  }
  return parts.join('/');
}

export type LinkTarget = { kind: 'guide'; to: string } | { kind: 'external'; href: string } | { kind: 'anchor'; href: string } | { kind: 'text' };

/** Decides how a link in a guide renders: in-app guide link, external link, or plain text. */
export function classifyLink(fromFile: string, href: string | undefined): LinkTarget {
  if (!href) return { kind: 'text' };
  if (/^(https?:|mailto:)/.test(href)) return { kind: 'external', href };
  if (href.startsWith('#')) return { kind: 'anchor', href };
  if (href.startsWith('/')) return { kind: 'guide', to: href };
  const [path] = href.split('#');
  const target = resolveDocPath(fromFile, path ?? '');
  const guide = ALL_GUIDES.find((g) => g.file === target);
  return guide ? { kind: 'guide', to: `/guides/${guide.slug}` } : { kind: 'text' };
}
