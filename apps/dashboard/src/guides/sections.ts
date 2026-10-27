export interface ArticleSection { id: string; title: string; level: number; line: number }
export function articleSections(source: string): ArticleSection[] {
  const used = new Map<string, number>();
  let fenced = false;
  const sections: ArticleSection[] = [];
  source.split('\n').forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return; }
    if (fenced) return;
    const match = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) return;
    const title = match[2]!.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, '');
    const base = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'section';
    const count = used.get(base) ?? 0; used.set(base, count + 1);
    sections.push({id: count ? base + '-' + count : base, title, level: match[1]!.length, line: index + 1});
  });
  return sections;
}
