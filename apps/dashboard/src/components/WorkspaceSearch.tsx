import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import ModalDialog, { ModalBody, ModalHeader, ModalTitle, ModalTransition } from '@atlaskit/modal-dialog';
import Textfield from './controls/Textfield';
import { Search } from './icons';
import { NAVIGATION } from '../lib/navigation';
import { ALL_GUIDES } from '../guides/manifest';
import { api } from '../lib/api';

type Result = { label: string; to: string; kind: string };
type RecordResult = { id: string; name?: string; subject?: string; email?: string };
const SOURCES = [
  { path: 'emails', permission: 'emails:read', kind: 'Email', route: '/emails/' },
  { path: 'contacts', permission: 'contacts:read', kind: 'Contact', route: '/audience/' },
  { path: 'broadcasts', permission: 'broadcasts:read', kind: 'Broadcast', route: '/broadcasts/' },
  { path: 'automations', permission: 'automations:read', kind: 'Automation', route: '/automations/' },
];

export function WorkspaceSearch({ permissions, onClose }: { permissions: string[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const timer = setTimeout(() => setDebounced(query.trim()), 250); return () => clearTimeout(timer); }, [query]);
  const sources = SOURCES.filter(source => permissions.includes(source.permission));
  const remote = useQueries({ queries: sources.map(source => ({
    queryKey: ['workspace-search', source.path, debounced],
    queryFn: () => api.get<{ data: RecordResult[]; has_more?: boolean }>(`/v1/${source.path}?limit=8&search=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2, staleTime: 30_000, retry: false,
  })) });
  const pages: Result[] = [
    ...NAVIGATION.flatMap(section => section.items).filter(item => permissions.includes(item.permission)).map(item => ({ ...item, kind: 'Page' })),
    ...(permissions.includes('org:read') ? [{ to: '/settings', label: 'Settings', kind: 'Page' }, { to: '/settings?tab=team', label: 'Team', kind: 'Settings' }, { to: '/settings?tab=usage', label: 'Usage and sending limits', kind: 'Settings' }, { to: '/notifications', label: 'Notifications', kind: 'Page' }] : []),
    ...(permissions.includes('org:manage') ? [{ to: '/exports', label: 'Exports', kind: 'Page' }] : []),
    { to: '/guides', label: 'Documentation', kind: 'Page' },
  ];
  const needle = query.trim().toLocaleLowerCase();
  const local = [...pages, ...(needle ? ALL_GUIDES.map(guide => ({ label: guide.title, to: '/guides/' + guide.slug, kind: 'Guide' })) : [])].filter(item => !needle || item.label.toLocaleLowerCase().includes(needle));
  const records = remote.flatMap((result, index) => { const source = sources[index]!; return (result.data?.data ?? []).map(record => ({ label: record.subject || record.name || record.email || record.id, to: source.path === 'contacts' ? '/audience?search=' + encodeURIComponent(record.email || '') : source.route + record.id, kind: source.kind })); });
  const ready = query.trim() === debounced;
  const results = [...local, ...(ready && needle.length >= 2 ? records : [])];
  const loading = needle.length >= 2 && (!ready || remote.some(result => result.isFetching));
  return <ModalTransition><ModalDialog onClose={onClose} width="medium" autoFocus={input} onOpenComplete={() => input.current?.focus()}>
    <ModalHeader hasCloseButton><ModalTitle>Search workspace</ModalTitle></ModalHeader>
    <ModalBody><div className="universal-search">
      <Textfield ref={input} type="search" aria-label="Search workspace" placeholder="Search pages, guides and records…" maxLength={200} value={query} onChange={event => setQuery(event.currentTarget.value)} elemBeforeInput={<Search size={16}/>} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); document.querySelector<HTMLAnchorElement>('.universal-search-results a')?.focus(); } }}/>
      <div className="universal-search-results" aria-label="Search results">
        {results.map(result => <Link key={result.kind + result.to} to={result.to} onClick={onClose}><span>{result.label}</span><small>{result.kind}</small></Link>)}
      </div>
      <p role="status">{loading ? 'Searching workspace…' : !results.length ? 'No results found. Try another search.' : `${results.length} results`}</p>
      {needle.length >= 2 && remote.some(result => result.isError) && <p role="alert">Some records could not be searched. Change your search to try again.</p>}
      {needle.length === 1 && <p>Type at least two characters to search records.</p>}
    </div></ModalBody>
  </ModalDialog></ModalTransition>;
}
