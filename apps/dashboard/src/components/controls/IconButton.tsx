import { forwardRef, type ElementType } from 'react';
import Button, { type ButtonProps } from './Button';
import { cn } from '../../lib/utils';
export default forwardRef<HTMLButtonElement, ButtonProps & { icon: ElementType; label: string }>(function IconButton({ icon: Icon, label, className, ...props }, ref) {
  return <Button ref={ref} {...props} aria-label={label} className={cn('h-8 w-8 shrink-0 p-0', className)}><Icon label="" size="medium" /></Button>;
});
