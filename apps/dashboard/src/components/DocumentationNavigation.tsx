import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Heading from '@atlaskit/heading';
import { ChevronDown, ChevronRight, Search } from './icons';
import IconButton from './controls/IconButton';
import Textfield from './controls/Textfield';
import { ALL_GUIDES, GUIDE_CATEGORIES, type Guide } from '../guides/manifest';
import { hasGuideFile, loadGuide } from '../guides/content';
import { articleSections } from '../guides/sections';

function ArticleTreeItem({ guide, onNavigate }: { guide: Guide; onNavigate: () => void }) {
  const location = useLocation();
  const active = location.pathname === '/guides/' + guide.slug;
  const [expanded, setExpanded] = useState(active);
  useEffect(() => { setExpanded(active); }, [active]);
  const content = useQuery({ queryKey: ['guide', guide.slug], queryFn: () => loadGuide(guide), enabled: expanded, staleTime: Infinity });
  const sections = articleSections(content.data ?? '');
  return <div className="documentation-tree-item">
    <div className={'documentation-tree-row' + (active ? ' selected' : '')}><IconButton icon={expanded ? ChevronDown : ChevronRight} label={(expanded ? 'Collapse ' : 'Expand ') + guide.title} appearance="subtle" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}/><NavLink to={'/guides/' + guide.slug} onClick={onNavigate}>{guide.title}</NavLink></div>
    {expanded && <div className="documentation-tree-sections">
      {content.isLoading && <span className="documentation-tree-status">Loading sections…</span>}
      {content.isError && <button className="documentation-tree-retry" onClick={() => void content.refetch()}>Retry loading sections</button>}
      {sections.map(section => <Link key={section.id} to={'/guides/' + guide.slug + '#' + section.id} className={section.level === 3 ? 'subsection' : undefined} aria-current={active && location.hash === '#' + section.id ? 'location' : undefined} onClick={onNavigate}>{section.title}</Link>)}
    </div>}
  </div>;
}

export function DocumentationNavigation({ mobile = false }: { mobile?: boolean }) {
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(location.pathname === '/guides');
  useEffect(() => { setOverviewOpen(location.pathname === '/guides'); }, [location.pathname]);
  const guides = ALL_GUIDES.filter(hasGuideFile).filter(guide => guide.title.toLowerCase().includes(query.trim().toLowerCase()));
  const overview = location.pathname === '/guides';
  return <aside className="documentation-sidebar">
    {!mobile && <header className="documentation-sidebar-heading"><Heading as="h2" size="small">Documentation</Heading></header>}
    {mobile && <button className="documentation-pages-toggle" aria-expanded={open} aria-controls="documentation-pages" onClick={() => setOpen(value => !value)}>Documentation Pages<ChevronDown size={16}/></button>}
    {(!mobile || open) && <div id="documentation-pages" className="documentation-pages-panel">
      <div className="documentation-title-search"><Textfield isCompact type="search" aria-label="Find by title" placeholder="Find By Title" value={query} onChange={event => setQuery(event.currentTarget.value)} elemBeforeInput={<Search size={16}/>}/></div>
      <div className="documentation-title-results" aria-live="polite">{query && `${guides.length} articles`}</div>
      <nav className="help-tree" aria-label="Documentation articles">
        {!query && <div className="documentation-tree-item"><div className={'documentation-tree-row' + (overview ? ' selected' : '')}><IconButton icon={overviewOpen ? ChevronDown : ChevronRight} label={overviewOpen ? 'Collapse Overview' : 'Expand Overview'} appearance="subtle" onClick={() => setOverviewOpen(value => !value)} aria-expanded={overviewOpen}/><NavLink end to="/guides" onClick={() => setOpen(false)}>Overview</NavLink></div>{overviewOpen && <div className="documentation-tree-sections">{GUIDE_CATEGORIES.map(category => <Link key={category.id} to={'/guides#' + category.id} onClick={() => setOpen(false)}>{category.title}</Link>)}</div>}</div>}
        {guides.map(guide => <ArticleTreeItem key={guide.slug} guide={guide} onNavigate={() => setOpen(false)}/>)}
        {!guides.length && <p className="documentation-nav-empty">No matching titles.</p>}
      </nav>
    </div>}
  </aside>;
}
