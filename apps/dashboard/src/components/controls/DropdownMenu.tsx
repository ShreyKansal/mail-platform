import { Children, isValidElement, type ReactNode, type Ref } from 'react';
import { ChevronDown } from '../icons';
import { DropdownMenu as Root, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '../ui/dropdown-menu';
import Button from './Button';
interface TriggerProps { triggerRef: Ref<HTMLButtonElement>; }
export default function DropdownMenu({ children, trigger, placement = 'bottom-start', className }: { children: ReactNode; trigger: ReactNode | ((props: TriggerProps) => ReactNode); placement?: string; className?: string }) {
  return <Root modal={false}><DropdownMenuTrigger asChild>{typeof trigger === 'function' ? trigger({ triggerRef: null }) : typeof trigger === 'string' ? <Button>{trigger}<ChevronDown size={14} /></Button> : trigger}</DropdownMenuTrigger><DropdownMenuContent side={placement.startsWith('top') ? 'top' : 'bottom'} align={placement.endsWith('end') ? 'end' : placement.endsWith('center') ? 'center' : 'start'} className={`z-[700] min-w-52 ${className ?? ''}`} onCloseAutoFocus={event => { if (document.querySelector('[role="dialog"]')) event.preventDefault(); }}>{children}</DropdownMenuContent></Root>;
}
interface GroupProps { children: ReactNode; title?: string; hasSeparator?: boolean; }
export function DropdownItemGroup({ children, title, hasSeparator }: GroupProps) { return <>{hasSeparator && <DropdownMenuSeparator />}{title && <DropdownMenuLabel className="text-xs text-muted-foreground font-medium">{title}</DropdownMenuLabel>}<DropdownMenuGroup>{children}</DropdownMenuGroup></>; }
export function DropdownItem({ children, isDisabled, onClick }: { children: ReactNode; isDisabled?: boolean; onClick?: () => unknown }) { return <DropdownMenuItem className="cursor-pointer" disabled={isDisabled} onSelect={() => { void onClick?.(); }}>{children}</DropdownMenuItem>; }
export function DropdownItemRadioGroup({ children, title, hasSeparator }: GroupProps & { id: string }) {
  const selected = Children.toArray(children).find(child => isValidElement<{ isSelected?: boolean }>(child) && child.props.isSelected);
  return <>{hasSeparator && <DropdownMenuSeparator />}{title && <DropdownMenuLabel className="text-xs text-muted-foreground font-medium">{title}</DropdownMenuLabel>}<DropdownMenuRadioGroup value={isValidElement<{ id: string }>(selected) ? selected.props.id : ''}>{children}</DropdownMenuRadioGroup></>;
}
export function DropdownItemRadio({ id, children, onClick }: { id: string; children: ReactNode; isSelected?: boolean; onClick?: () => unknown }) { return <DropdownMenuRadioItem className="cursor-pointer" value={id} onSelect={() => { void onClick?.(); }}>{children}</DropdownMenuRadioItem>; }
