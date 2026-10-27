import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';
interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> { minimumRows?: number; isDisabled?: boolean; isRequired?: boolean; isInvalid?: boolean; }
export default forwardRef<HTMLTextAreaElement, Props>(function Textarea({ minimumRows = 3, isDisabled, isRequired, isInvalid, className, ...props }, ref) {
  return <textarea ref={ref} {...props} rows={props.rows ?? minimumRows} disabled={isDisabled || props.disabled} required={isRequired || props.required} aria-invalid={isInvalid || undefined} className={cn('product-textarea flex w-full rounded-md border border-input bg-card px-3 py-2 font-sans text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50', isInvalid && 'border-destructive', className)} />;
});
