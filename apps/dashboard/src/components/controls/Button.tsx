import { forwardRef, type ButtonHTMLAttributes, type ElementType } from 'react';
import { Loader2 } from '../icons';
import { Button as Primitive } from '../ui/button';
import { cn } from '../../lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  appearance?: 'default' | 'primary' | 'subtle' | 'link' | 'subtle-link' | 'danger' | 'warning' | 'discovery';
  spacing?: 'default' | 'compact' | 'none';
  isDisabled?: boolean;
  isLoading?: boolean;
  isSelected?: boolean;
  shouldFitContainer?: boolean;
  iconBefore?: ElementType;
  iconAfter?: ElementType;
}
export default forwardRef<HTMLButtonElement, ButtonProps>(function Button({ appearance = 'default', spacing, isDisabled, isLoading, isSelected, shouldFitContainer, iconBefore: Before, iconAfter: After, children, className, ...props }, ref) {
  const variant = appearance === 'primary' || appearance === 'discovery' ? 'default' : appearance === 'danger' ? 'destructive' : appearance === 'subtle' ? 'ghost' : appearance.includes('link') ? 'link' : 'secondary';
  return <Primitive ref={ref} type="button" {...props} variant={variant} size={spacing === 'compact' ? 'sm' : 'default'} disabled={isDisabled || isLoading || props.disabled} aria-busy={isLoading || undefined} className={cn('product-button', shouldFitContainer && 'w-full', isSelected && 'bg-accent', spacing === 'none' && 'h-auto p-0', className)}>
    {isLoading ? <Loader2 className="animate-spin" aria-hidden /> : Before ? <Before label="" size="medium" /> : null}{children}{After && <After label="" size="medium" />}
  </Primitive>;
});
