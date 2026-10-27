import type { EmptyStateProps } from '@atlaskit/empty-state';
import { createElement } from 'react';
import { Loader2 } from './icons';

function resourceIllustration(header: unknown) {
  const text = typeof header === 'string' ? header.toLowerCase() : '';
  if (/matching|search|filter|results/.test(text)) return 'search';
  if (/automation|workflow|run|event|webhook/.test(text)) return 'automation';
  if (/email|message|broadcast|campaign|notification/.test(text)) return 'mail';
  return 'resources';
}

/** Shared decorative artwork; the heading and action carry the accessible meaning. */
export function EmptyState({ header, description, primaryAction, secondaryAction, tertiaryAction, buttonGroupLabel, headingLevel = 2, imageUrl, renderImage, maxImageWidth, maxImageHeight, imageWidth, imageHeight, width, testId, isLoading }: EmptyStateProps) {
  const illustration = resourceIllustration(header);
  return <div className={'resource-empty product-empty' + (width === 'narrow' ? ' resource-empty-narrow' : '')} data-testid={testId} aria-busy={isLoading || undefined}>
    {imageUrl ? <img src={imageUrl} alt="" width={imageWidth} height={imageHeight} style={{maxWidth: maxImageWidth ?? 160, maxHeight: maxImageHeight ?? 160}} /> : renderImage ? renderImage({maxImageWidth, maxImageHeight, imageWidth, imageHeight}) : <img className="resource-empty-illustration" src={`/illustrations/${illustration}.png?v=calm-blue`} alt="" width={264} height={216} decoding="async" />}
    {createElement(`h${Math.max(2, Math.min(6, headingLevel))}`, {className:'resource-empty-title'}, header)}
    {description && <div className="resource-empty-description">{description}</div>}
    {(primaryAction || secondaryAction || tertiaryAction || isLoading) && <div role="group" aria-label={buttonGroupLabel ?? 'Next steps'} className="resource-empty-actions">{primaryAction}{secondaryAction}{tertiaryAction}{isLoading && <span role="status" aria-label="Loading"><Loader2 size={18} className="animate-spin" aria-hidden /></span>}</div>}
  </div>;
}
