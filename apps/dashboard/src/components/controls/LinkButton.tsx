import { forwardRef, type AnchorHTMLAttributes, type ElementType } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import type { ButtonProps } from './Button';
type Props = AnchorHTMLAttributes<HTMLAnchorElement> & Pick<ButtonProps, 'appearance' | 'spacing' | 'shouldFitContainer'> & { href: string; iconBefore?: ElementType; iconAfter?: ElementType; isDisabled?: boolean };
export default forwardRef<HTMLAnchorElement, Props>(function LinkButton({ href, appearance, spacing, shouldFitContainer, iconBefore: Before, iconAfter: After, isDisabled, children, className, ...props }, ref) {
  const variant = appearance === 'primary' ? 'default' : appearance === 'subtle' ? 'ghost' : appearance?.includes('link') ? 'link' : 'secondary';
  const content = <>{Before && <Before label="" size="medium" />}{children}{After && <After label="" size="medium" />}</>;
  const shared = { ...props, ref, className: cn('product-button', shouldFitContainer && 'w-full', isDisabled && 'pointer-events-none opacity-50', className), 'aria-disabled': isDisabled || undefined };
  return <Button asChild variant={variant} size={spacing === 'compact' ? 'sm' : 'default'}>{href.startsWith('/') && !href.startsWith('//') && !props.download && !href.startsWith('/docs/') ? <Link {...shared} to={href}>{content}</Link> : <a {...shared} href={href}>{content}</a>}</Button>;
});
