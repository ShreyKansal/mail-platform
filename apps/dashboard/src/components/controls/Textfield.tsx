import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { Input } from '../ui/input';
import { cn } from '../../lib/utils';
interface Props extends InputHTMLAttributes<HTMLInputElement> { isCompact?: boolean; isDisabled?: boolean; isRequired?: boolean; isInvalid?: boolean; elemBeforeInput?: ReactNode; elemAfterInput?: ReactNode; }
export default forwardRef<HTMLInputElement, Props>(function Textfield({ isCompact, isDisabled, isRequired, isInvalid, elemBeforeInput, elemAfterInput, className, ...props }, ref) {
  return <div className="relative w-full min-w-0">{elemBeforeInput && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">{elemBeforeInput}</span>}<Input ref={ref} {...props} disabled={isDisabled || props.disabled} required={isRequired || props.required} aria-invalid={isInvalid || undefined} className={cn('bg-card', isCompact && 'h-8', elemBeforeInput && 'pl-10', elemAfterInput && 'pr-9', isInvalid && 'border-destructive', className)} />{elemAfterInput && <span className="absolute inset-y-0 right-3 flex items-center">{elemAfterInput}</span>}</div>;
});
