import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Heading from '@atlaskit/heading';
import IconButton from './controls/IconButton';
import { X as CrossIcon } from './icons';

/** Right-edge modal surface. The pinned ModalDialog has no side placement API. */
export function SideSheet({ title, children, onClose, returnFocus, placement = 'side' }: { title: string; children: ReactNode; onClose: () => void; returnFocus?: () => HTMLElement | null; placement?: 'side' | 'floating' }) {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const focusTarget = useRef(returnFocus);
  focusTarget.current = returnFocus;
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const workspace = document.querySelector<HTMLElement>('.app-shell');
    const wasInert = workspace?.inert ?? false;
    const overflow = document.body.style.overflow;
    if (workspace) workspace.inert = true;
    document.body.style.overflow = 'hidden';
    const items = () => [...(panel.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]') ?? [])].filter(element => element.getClientRects().length);
    items()[0]?.focus();
    // A menu can finish removing its focus scope after this portal mounts.
    // Reassert initial focus once that close lifecycle has completed.
    const initialFocus = requestAnimationFrame(() => items()[0]?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const elements = items(), first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    const onFocus = (event: FocusEvent) => { if (!panel.current?.contains(event.target as Node)) items()[0]?.focus(); };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocus);
    return () => {
      cancelAnimationFrame(initialFocus);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocus);
      if (workspace) workspace.inert = wasInert;
      document.body.style.overflow = overflow;
      const target = focusTarget.current?.() ?? previous;
      if (target?.isConnected) target.focus();
    };
  }, []);
  return createPortal(<div className="side-sheet-layer" data-placement={placement}>
    <div className="side-sheet-backdrop" onClick={onClose} aria-hidden="true" />
    <section ref={panel} className="side-sheet-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="side-sheet-header"><Heading size="medium" as="h2" id={titleId}>{title}</Heading><IconButton icon={CrossIcon} label={placement === 'floating' ? 'Close Notifications' : 'Close side sheet'} appearance="subtle" onClick={onClose} /></header>
      <div className="side-sheet-body">{children}</div>
    </section>
  </div>, document.body);
}
