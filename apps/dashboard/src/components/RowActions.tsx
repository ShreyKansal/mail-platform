import IconButton from './controls/IconButton';
import DropdownMenu, { DropdownItem, DropdownItemGroup } from './controls/DropdownMenu';
import { MoreHorizontal as MoreIcon } from './icons';

/** Keep secondary row operations in a labelled menu without increasing row height. */
export function RowActions({ label, actions, isDisabled = false }: { label: string; actions: Array<{ label: string; onClick: () => void | Promise<void>; isDisabled?: boolean }>; isDisabled?: boolean }) {
  return <DropdownMenu placement="bottom-end" trigger={({ triggerRef, ...props }) => <IconButton {...props} ref={triggerRef} label={label} icon={MoreIcon} spacing="compact" appearance="subtle" isDisabled={isDisabled} />}>
    <DropdownItemGroup>{actions.map(action => <DropdownItem key={action.label} isDisabled={action.isDisabled} onClick={() => { void action.onClick(); }}>{action.label}</DropdownItem>)}</DropdownItemGroup>
  </DropdownMenu>;
}
