import { useNavigate } from 'react-router-dom';
import { User, Settings, SunMoon, ArrowLeftRight, LogOut, Check } from './icons';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from './ui/dropdown-menu';
import { THEME_OPTIONS, useThemePreference } from '../lib/theme';
import type { Session } from '../lib/api';

export function AccountMenu({ session, onLogout, busy }: { session: Session; onLogout: () => void; busy: boolean }) {
  const navigate = useNavigate();
  const [theme, setTheme] = useThemePreference();
  const initials = session.user.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  return <DropdownMenu><DropdownMenuTrigger asChild><button className="header-avatar" aria-label="Account menu" title={session.user.name}>{initials}</button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={10} className="account-menu-content" onCloseAutoFocus={event => { if (document.querySelector('[role="dialog"]')) event.preventDefault(); }}>
      <DropdownMenuLabel className="account-menu-identity"><span className="header-avatar" aria-hidden>{initials}</span><span><strong>{session.user.name}</strong><small>{session.user.email}</small></span></DropdownMenuLabel><DropdownMenuSeparator/>
      <DropdownMenuItem onSelect={() => navigate('/settings?tab=account')}><User size={16}/>Profile</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => navigate('/settings?tab=preferences')}><Settings size={16}/>Personal Settings</DropdownMenuItem>
      <DropdownMenuSub><DropdownMenuSubTrigger><SunMoon size={16}/>Theme</DropdownMenuSubTrigger><DropdownMenuSubContent><DropdownMenuRadioGroup value={theme}>{THEME_OPTIONS.map(option => <DropdownMenuRadioItem key={option.value} value={option.value} onSelect={() => setTheme(option.value)}>{option.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuSubContent></DropdownMenuSub>
      <DropdownMenuSub><DropdownMenuSubTrigger><ArrowLeftRight size={16}/>Workspace</DropdownMenuSubTrigger><DropdownMenuSubContent><DropdownMenuLabel className="account-current-workspace"><span>{session.organization.name}</span><Check size={16}/></DropdownMenuLabel>{session.permissions.includes('org:read') && <DropdownMenuItem onSelect={() => navigate('/settings?tab=team')}>Workspace Settings</DropdownMenuItem>}</DropdownMenuSubContent></DropdownMenuSub>
      <DropdownMenuSeparator/><DropdownMenuItem disabled={busy} onSelect={onLogout}><LogOut size={16}/>Log Out</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
