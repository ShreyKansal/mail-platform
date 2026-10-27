import { NavLink } from 'react-router-dom';
import { Settings2, Download } from './icons';
import { NAVIGATION } from '../lib/navigation';

export function WorkspaceNavigation({ permissions, compact }: { permissions: string[]; compact: boolean }) {
  return <nav className="workspace-nav" aria-label="Main navigation">
    {NAVIGATION.flatMap(section => section.items).filter(item => permissions.includes(item.permission)).map(item => { const Icon = item.icon; return <NavLink key={item.to} to={item.to} end={item.to === '/'} aria-label={item.label} title={compact ? item.label : undefined} className={({isActive}) => 'nav-item' + (isActive ? ' selected' : '')}><Icon size={18} aria-hidden /><span className="nav-item-label">{item.label}</span></NavLink>; })}
    {permissions.includes('org:read') && <NavLink to="/settings" title={compact ? 'Settings' : undefined} aria-label="Settings" className={({isActive}) => 'nav-item' + (isActive ? ' selected' : '')}><Settings2 size={18} aria-hidden /><span className="nav-item-label">Settings</span></NavLink>}
    {permissions.includes('org:manage') && <NavLink to="/exports" title={compact ? 'Exports' : undefined} aria-label="Exports" className={({isActive}) => 'nav-item' + (isActive ? ' selected' : '')}><Download size={18} aria-hidden /><span className="nav-item-label">Exports</span></NavLink>}
  </nav>;
}
