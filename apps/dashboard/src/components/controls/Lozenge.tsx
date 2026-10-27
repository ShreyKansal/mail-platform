import type { ReactNode } from 'react';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
type Appearance = 'default' | 'inprogress' | 'moved' | 'new' | 'removed' | 'success';
export default function Lozenge({ children, appearance = 'default', isBold }: { children: ReactNode; appearance?: Appearance; isBold?: boolean }) {
  return <Badge variant="secondary" data-appearance={appearance} className={cn('product-badge rounded-full border-0 px-1.5 text-xs shadow-none', isBold && 'font-semibold')}>{children}</Badge>;
}
