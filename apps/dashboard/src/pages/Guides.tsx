import { useEffect, useMemo } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Button from '../components/controls/Button';
import Heading from '@atlaskit/heading';
import { Text } from '@atlaskit/primitives';
import { EmptyState } from '../components/EmptyState';
import { ErrorBlock, LoadingBlock } from '../components/feedback';
import { Page } from '../components/Page';
import { Table } from '../components/Table';
import { hasGuideFile, loadGuide } from '../guides/content';
import { GUIDE_CATEGORIES, guideBySlug } from '../guides/manifest';
import { Markdown } from '../guides/Markdown';

export function GuidesPage() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const search = (params.get('q') ?? '').trim().toLowerCase(), topic = params.get('topic') ?? '';
  const categories = useMemo(() => GUIDE_CATEGORIES.map(category => ({...category, guides: category.guides.filter(guide => hasGuideFile(guide) && (!search || (guide.title + ' ' + guide.summary + ' ' + category.title).toLowerCase().includes(search)))})).filter(category => (!topic || topic === category.id) && category.guides.length), [search, topic]);
  useEffect(() => { if (location.hash) { try { document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ block: 'start' }); } catch {} } }, [location.hash, location.key]);
  return <Page layout="reading" title={search ? 'Search Documentation' : 'Documentation'}>
    {!search && !topic && <div className="documentation-introduction"><Text as="p">Find setup instructions, API guides and delivery troubleshooting for your workspace. Select an article from the navigation or browse the guides below.</Text></div>}
    {search && <Text as="p" color="color.text.subtle">Results for &quot;{params.get('q')}&quot;</Text>}
    {(search || topic) && <div><Button appearance="link" onClick={()=>setParams({})}>All Documentation</Button></div>}
    {!categories.length && <EmptyState header="No matching articles" description="Try another title or browse all documentation." primaryAction={<Button onClick={()=>setParams({})}>Clear search</Button>}/>}
    <div className="documentation-topics">{categories.map(category => <section key={category.id} aria-labelledby={category.id}>
      <Heading as="h2" size="small" id={category.id}>{category.title}</Heading><Text as="p" color="color.text.subtle">{category.description}</Text>
      <Table compact isLoading={false} emptyView={<EmptyState header="No Guides" description="Try another topic."/>} label={category.title + ' Guides'} columns={[{ key: 'name', content: 'Guide', width: 35 }, { key: 'description', content: 'Description', width: 65 }]} rows={category.guides.map(guide => ({ key: guide.slug, cells: [{ content: <Link to={'/guides/' + guide.slug}>{guide.title}</Link> }, { content: guide.summary }] }))}/>
    </section>)}</div>
  </Page>;
}

export function GuidePage() {
  const location = useLocation();
  const { slug = '' } = useParams(), guide = guideBySlug(slug);
  const content = useQuery({queryKey:['guide',slug],queryFn:()=>guide ? loadGuide(guide) : Promise.resolve(null),enabled:!!guide,staleTime:Infinity});
  const category=GUIDE_CATEGORIES.find(category=>category.guides.some(item=>item.slug===slug));
  const related=category?.guides.filter(item=>item.slug!==slug && hasGuideFile(item)).slice(0,3) ?? [];
  useEffect(() => {
    if (!content.data) return;
    const hash = window.location.hash.slice(1);
    if (hash) { let target=hash;try{target=decodeURIComponent(hash);}catch{}document.getElementById(target)?.scrollIntoView({block:'start'}); }
    else window.scrollTo({top:0,left:0});
  }, [slug,content.data,location.hash,location.key]);
  if(!guide) return <Page layout="reading" title="Article Not Found" crumbs={[{text:'Documentation',href:'/guides'},{text:'Article Not Found'}]}><EmptyState header="This article is unavailable" description="Browse the documentation to find the task you need." primaryAction={<Link to="/guides">Open documentation</Link>}/></Page>;
  return <Page layout="reading" title={guide.title}>
    {content.isLoading && <LoadingBlock label="Loading article"/>}
    {content.error && <ErrorBlock error={content.error} onRetry={()=>void content.refetch()}/>}
    {content.isSuccess && !content.data && <EmptyState header="Article unavailable" description="Return to documentation to browse available articles." primaryAction={<Link to="/guides">Open documentation</Link>}/>}
    {content.data && <><article className="help-article"><Markdown source={content.data} file={guide.file}/>
      {!!related.length && <section className="help-related" aria-labelledby="related-title"><Heading as="h2" size="medium" id="related-title">Related Articles</Heading>{related.map(item=><Link key={item.slug} to={'/guides/'+item.slug}>{item.title}</Link>)}</section>}
    </article></>}
  </Page>;
}
