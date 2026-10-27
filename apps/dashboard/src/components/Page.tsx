import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Heading from '@atlaskit/heading';
import { Box, Inline, Stack, Text, xcss } from '@atlaskit/primitives';
import { pageTitle } from '../brand';

export interface Crumb { text: string; href?: string; }
export interface PageProps {
  title: string;
  /** Accepted for existing callers; trails are no longer rendered. */
  crumbs?: Crumb[];
  description?: ReactNode;
  route?: string;
  actions?: ReactNode;
  layout?: 'default' | 'editor' | 'reading';
  status?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}
const tabBodyStyles = xcss({ width: '100%' });
export function TabBody({ children }: { children: ReactNode }) {
  return <Box paddingBlockStart="space.200" xcss={tabBodyStyles}><Stack space="space.200">{children}</Stack></Box>;
}

/** Page title and actions. The editor has a dedicated title slot. */
export function Page({ title, description, actions, children, layout = 'default', status, aside }: PageProps) {
  const [titleHost, setTitleHost] = useState<HTMLElement | null>(null);
  const [actionsHost, setActionsHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTitleHost(document.getElementById('editor-header-title'));
    setActionsHost(document.getElementById('editor-header-actions'));
  }, [layout]);
  useEffect(() => { document.title = pageTitle(title); }, [title]);
  const headerActions = actions ? <Inline space="space.100" shouldWrap>{actions}</Inline> : undefined;
  const pageHeader = <header className="page-header">
    <div className="page-header-row"><Heading size={layout === 'reading' ? 'xlarge' : 'medium'} as="h1">{title}</Heading>{status}{headerActions && <div className="page-header-actions">{headerActions}</div>}</div>
    {typeof description === 'string' ? <div className="page-description"><Text as="p" color="color.text.subtle">{description}</Text></div> : description}
  </header>;
  if (layout === 'reading') return <div className="page-frame page-frame-reading"><div className="page-reading-main">{pageHeader}<div className="page-body">{children}</div></div>{aside}</div>;
  return <div className={layout === 'editor' ? 'page-frame page-frame-editor' : 'page-frame'}>
    {layout === 'editor' ? <>{titleHost ? createPortal(<div className="editor-title"><Heading as="h1" size="xsmall">{title}</Heading>{status}</div>, titleHost) : <Heading as="h1" size="xsmall">{title}</Heading>}{actionsHost && createPortal(headerActions, actionsHost)}</> : pageHeader}
    <div className="page-body">{children}</div>
  </div>;
}
