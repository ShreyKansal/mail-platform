import { useEffect, useState } from 'react';
import { Text } from '@atlaskit/primitives';
import type { ArticleSection } from '../guides/sections';

export function ArticleContents({ sections }: { sections: ArticleSection[] }) {
  const [active, setActive] = useState('');
  useEffect(() => {
    const update = () => {
      const headings = sections.map(section => document.getElementById(section.id)).filter((heading): heading is HTMLElement => !!heading);
      const boundary = (document.getElementById('main')?.getBoundingClientRect().top ?? 0) + 40;
      setActive([...headings].reverse().find(heading => heading.getBoundingClientRect().top <= boundary)?.id ?? sections[0]?.id ?? '');
    };
    const scroller = document.getElementById('main');
    update();scroller?.addEventListener('scroll', update, { passive: true });
    return () => scroller?.removeEventListener('scroll', update);
  }, [sections.map(section => section.id).join('|')]);
  const links = sections.map(section => <a key={section.id} className={section.level === 3 ? 'contents-subsection' : undefined} href={'#' + section.id} aria-current={active === section.id ? 'location' : undefined} onClick={() => {setActive(section.id);requestAnimationFrame(() => document.getElementById(section.id)?.closest<HTMLElement>('.md-heading')?.focus({preventScroll:true}));}}>{section.title}</a>);
  return <>
    <aside className="article-contents"><nav aria-label="In This Article"><Text weight="semibold">In This Article</Text>{links}</nav></aside>
  </>;
}

export function MobileArticleContents({ sections }: { sections: ArticleSection[] }) {
  if (!sections.length) return null;
  return <details className="documentation-mobile-contents"><summary>In This Article</summary><nav aria-label="Article sections">{sections.map(section => <a key={section.id} href={'#' + section.id}>{section.title}</a>)}</nav></details>;
}
