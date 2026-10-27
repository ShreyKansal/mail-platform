import { AccountMenu } from './AccountMenu';
import { Settings } from './icons';
import { WorkspaceNavigation } from './WorkspaceNavigation';
import { ArrowLeft, PanelLeftClose, PanelLeftOpen } from './icons';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { SettingsReturnContext } from '../lib/settings-modal';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Button from './controls/Button';
import IconButton from './controls/IconButton';
import DropdownMenu, { DropdownItem, DropdownItemGroup } from './controls/DropdownMenu';
import { Menu as MenuIcon } from './icons';
import { X as CrossIcon } from './icons';
import { Bell as NotificationIcon } from './icons';
import { Help as HelpIcon } from './icons';
import { DocumentationNavigation } from './DocumentationNavigation';
import { guideForRoute } from '../guides/manifest';
import { Search as SearchIcon } from './icons';
import { WorkspaceSearch } from './WorkspaceSearch';
import { ApiExamples } from './ApiExamples';
import { BRAND } from '../brand';
import { api, ApiError } from '../lib/api';
import { useSession } from '../lib/hooks';
import { ErrorBlock, LoadingBlock } from './feedback';
import { BrandLogo } from './BrandLogo';


export function AppShell() {
  const session = useSession(), location = useLocation(), qc = useQueryClient();
  const navigate = useNavigate();
  const outlet = useOutlet();
  const overlayOpen = ['/settings', '/notifications'].includes(location.pathname);
  const background = useRef({ outlet, location });
  if (!overlayOpen) background.current = { outlet, location };
  const hasBackground = !['/settings', '/notifications'].includes(background.current.location.pathname);
  const previousRoute = useRef(location.pathname);
  const [searchOpen, setSearchOpen] = useState(false);
  const helpAnchor = useRef<HTMLSpanElement>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setDrawerOpen(false); setSearchOpen(value => !value); } };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, []);
  const helpSpace = (overlayOpen && hasBackground ? background.current.location.pathname : location.pathname).startsWith('/guides');
  const automationEditor = /^\/automations\/[^/]+\/?$/.test(location.pathname);
  const contextualGuide = guideForRoute(location.pathname) ?? (location.pathname.split('/').length === 3 ? guideForRoute('/' + location.pathname.split('/')[1] + '/:id') : undefined);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('mailer-sidebar-collapsed') === 'true');
  const toggleSidebar = () => setCollapsed(value => { localStorage.setItem('mailer-sidebar-collapsed', String(!value)); return !value; });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  const sidebar = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const logout = useMutation({ mutationFn: () => api.post('/auth/logout'), onSuccess: () => { qc.clear(); window.location.assign('/login'); } });
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const update = () => { setMobile(media.matches); setDrawerOpen(false); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => setDrawerOpen(false), [location.pathname, location.search, location.key]);
  useLayoutEffect(() => {
    const wasSettings = ['/settings', '/notifications'].includes(previousRoute.current);
    previousRoute.current = location.pathname;
    if (overlayOpen || wasSettings) return;
    const main = document.getElementById('main');
    if (main) main.scrollTop = 0;
  }, [location.pathname, location.search, location.key]);
  useEffect(() => { if (sidebar.current) sidebar.current.inert = mobile && !drawerOpen; }, [mobile, drawerOpen, session.data, automationEditor]);
  useEffect(() => {
    if (!drawerOpen || !mobile) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const items = () => [...(sidebar.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex="0"]') ?? [])].filter(el => el.getClientRects().length);
    items()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
      if (event.key !== 'Tab') return;
      const focusable = items(), first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; requestAnimationFrame(() => (menuButton.current ?? previous)?.focus()); };
  }, [drawerOpen, mobile]);
  if (session.isLoading) return <div className="workspace-loading"><LoadingBlock label="Loading your workspace" /></div>;
  if (session.error instanceof ApiError && session.error.status === 401) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (session.error || !session.data) return <div className="workspace-loading"><ErrorBlock error={session.error} onRetry={() => void session.refetch()} /></div>;
  const s = session.data;
  const openSearch = () => { setDrawerOpen(false); setSearchOpen(true); };
  const helpMenu = (<span ref={helpAnchor}><DropdownMenu placement="bottom-end" trigger={({triggerRef, ...props}) => <Button {...props} ref={triggerRef} className="sidebar-help" appearance="subtle" aria-label="Help and developer resources"><HelpIcon size={18}/></Button>}>
              <DropdownItemGroup>{contextualGuide && <DropdownItem onClick={() => navigate('/guides/' + contextualGuide.slug)}>Help with This Page</DropdownItem>}<DropdownItem onClick={() => navigate('/guides')}>Documentation</DropdownItem><DropdownItem onClick={() => setCodeOpen(true)}>Open API Examples</DropdownItem></DropdownItemGroup>
            </DropdownMenu></span>);
  return <SettingsReturnContext.Provider value={hasBackground ? background.current.location.pathname + background.current.location.search : '/'}>
    <a href="#main" className="skip-link">Skip to content</a>
    <div className="app-shell" data-sidebar-collapsed={!mobile && collapsed} data-layout={automationEditor ? 'editor' : 'sidebar'} data-editor={automationEditor ? 'automation' : undefined} data-space={helpSpace ? 'documentation' : undefined}>
      {automationEditor ? <header className="workspace-topbar"><div className="header-start"><Link to="/automations" className="editor-back" aria-label="Back to automations"><ArrowLeft size={20}/></Link><Link to="/" className="header-brand" aria-label={BRAND.name+' home'}><BrandLogo /></Link></div><div id="editor-header-title" className="editor-header-title"/><div id="editor-header-actions" className="editor-header-actions"/></header> : <header className="workspace-header" ref={node=>{if(node)node.inert=mobile&&drawerOpen;}}>
        <div className="workspace-header-start"><IconButton ref={menuButton} icon={helpSpace?ArrowLeft:mobile?MenuIcon:collapsed?ExpandNavigationIcon:CollapseNavigationIcon} label={helpSpace?'Back to Workspace':mobile?'Open navigation':collapsed?'Expand navigation':'Collapse navigation'} appearance="subtle" onClick={()=>helpSpace?navigate('/'):mobile?setDrawerOpen(true):toggleSidebar()} aria-expanded={mobile?drawerOpen:!collapsed} aria-controls="workspace-sidebar"/><Link to="/" className="workspace-header-brand" aria-label={BRAND.name+' home'}><BrandLogo width={mobile ? 104 : 132}/></Link></div>
        <Button className="workspace-search-trigger header-universal-search" appearance="subtle" aria-label="Search workspace" onClick={openSearch}><SearchIcon size={16}/><span>Search Workspace</span><kbd>Ctrl K</kbd></Button>
        <div className="workspace-header-actions">{s.permissions.includes('org:read')&&<IconButton icon={NotificationIcon} label="Notifications" className="header-notifications" appearance="subtle" onClick={() => navigate('/notifications')} aria-haspopup="dialog"/>}{helpMenu}<IconButton icon={Settings} label="Settings" appearance="subtle" onClick={() => navigate('/settings')}/><AccountMenu session={s} onLogout={() => logout.mutate()} busy={logout.isPending}/></div>

      </header>}

      <div className="drawer-backdrop" data-open={drawerOpen} onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      {helpSpace ? null : automationEditor ? <div key="automation-navigation" id="editor-navigation" className="editor-navigation" /> : <div key="workspace-navigation" id="workspace-sidebar" ref={sidebar} className="app-sidebar" data-open={drawerOpen} role={mobile && drawerOpen ? 'dialog' : undefined} aria-modal={mobile && drawerOpen ? true : undefined} aria-label={mobile ? 'Workspace navigation' : undefined}>
        {mobile && <div className="sidebar-drawer-heading"><span>Navigation</span><IconButton icon={CrossIcon} label="Close navigation" appearance="subtle" onClick={()=>setDrawerOpen(false)}/></div>}

        <WorkspaceNavigation permissions={s.permissions} compact={!mobile && collapsed} />

      </div>}
      <div className="app-workspace" ref={node => { if (node) node.inert = mobile && drawerOpen; }}>

        <div className={helpSpace ? 'documentation-workspace-layout' : 'workspace-page-layout'}>
        {helpSpace && <DocumentationNavigation mobile={mobile}/>}
        <main id="main" className="app-main" tabIndex={-1}><div className="app-content"><Routes location={overlayOpen && hasBackground ? background.current.location : location}><Route path="*" element={overlayOpen ? hasBackground ? background.current.outlet : <div className="settings-start"><BrandLogo width={132}/></div> : outlet}/></Routes></div></main>
        </div>
      </div>
    </div>
    {logout.error && <div className="logout-error"><ErrorBlock error={logout.error} onRetry={() => logout.mutate()}/></div>}
    {codeOpen && <ApiExamples onClose={() => setCodeOpen(false)} returnFocus={() => helpAnchor.current?.querySelector('button') ?? null} />}
    {searchOpen && <WorkspaceSearch permissions={s.permissions} onClose={() => setSearchOpen(false)} />}
    {overlayOpen && outlet}
  </SettingsReturnContext.Provider>;
}


function CollapseNavigationIcon() { return <PanelLeftClose size={18} aria-hidden />; }
function ExpandNavigationIcon() { return <PanelLeftOpen size={18} aria-hidden />; }
