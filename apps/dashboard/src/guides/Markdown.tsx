import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { Link } from 'react-router-dom';
import remarkGfm from 'remark-gfm';
import { Code, CodeBlock, SUPPORTED_LANGUAGES } from '@atlaskit/code';
import Heading from '@atlaskit/heading';
import { brandText } from '../brand';
import { articleSections } from './sections';
import { classifyLink } from './content';

const LANGUAGE_ALIASES = new Set<string>(SUPPORTED_LANGUAGES.flatMap((l) => [...l.alias]));

type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['alias'][number];

function languageOf(className: string | undefined): SupportedLanguage {
  const lang = /language-([\w+#-]+)/.exec(className ?? '')?.[1]?.toLowerCase();
  return (lang && LANGUAGE_ALIASES.has(lang) ? lang : 'text') as SupportedLanguage;
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}

/** Renders a docs/ Markdown file with Atlassian typography and code components. */
export function Markdown({ source, file }: { source: string; file: string }) {
  const sections = articleSections(source);
  const components: Components = {
    // The page header already shows the guide title.
    h1: () => null,
    h2: ({ children, node }) => (
      <div className="md-heading md-h2" tabIndex={-1}>
        <Heading size="medium" as="h2" id={sections.find(section => section.line === node?.position?.start.line)?.id}>
          {children}
        </Heading>
      </div>
    ),
    h3: ({ children, node }) => (
      <div className="md-heading md-h3" tabIndex={-1}>
        <Heading size="small" as="h3" id={sections.find(section => section.line === node?.position?.start.line)?.id}>
          {children}
        </Heading>
      </div>
    ),
    h4: ({ children }) => (
      <div className="md-heading md-h4">
        <Heading size="xsmall" as="h4">
          {children}
        </Heading>
      </div>
    ),
    a: ({ href, children }) => {
      const target = classifyLink(file, href);
      if (target.kind === 'anchor') return <a href={target.href}>{children}</a>;
      if (target.kind === 'guide') return <Link to={target.to}>{children}</Link>;
      if (target.kind === 'external') {
        const external = /^https?:/.test(target.href);
        return (
          <a href={target.href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
            {children}
          </a>
        );
      }
      return <span>{children}</span>;
    },
    pre: ({ children }) => {
      const child = Children.toArray(children)[0] as ReactElement<{ className?: string; children?: ReactNode }> | undefined;
      const code = textOf(child?.props.children).replace(/\n$/, '');
      return <CodeBlock text={code} language={languageOf(child?.props.className)} showLineNumbers={false} shouldWrapLongLines />;
    },
    code: ({ children }) => <Code>{children}</Code>,
    table: ({ children }) => (
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Article data table">
        <table>{children}</table>
      </div>
    ),
  };
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {brandText(source)}
      </ReactMarkdown>
    </div>
  );
}
