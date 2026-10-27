import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';

export function EmptyResource({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <EmptyState header={title} description={description} {...(action ? { primaryAction: action } : {})} />;
}
