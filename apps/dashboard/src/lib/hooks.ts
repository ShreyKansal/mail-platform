import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { api, ApiError, type Session } from './api';

export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: () => api.get<Session>('/auth/session'),
    retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2,
    staleTime: 60_000,
  });
}

/** UI hint only: the API enforces every permission server-side. */
export function useCan(permission: string): boolean {
  const { data } = useSession();
  return !!data?.permissions.includes(permission);
}

/** Cursor stack for server-side pagination (the API is keyset-paginated). */
export function useCursorPages(scope?: string) {
  const [stack, setStack] = useState<Array<string | undefined>>([undefined]);
  const [currentScope, setCurrentScope] = useState(scope);
  const currentStack = currentScope === scope ? stack : [undefined];
  if (currentScope !== scope) {
    setCurrentScope(scope);
    setStack([undefined]);
  }
  const cursor = currentStack[currentStack.length - 1];
  return {
    cursor,
    hasPrevious: currentStack.length > 1,
    next: (c: string | null) => {
      if (c) setStack((s) => [...s, c]);
    },
    previous: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
    reset: useCallback(() => setStack([undefined]), []),
  };
}

export const formatDate = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleString() : '—');

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return fmt.format(-Math.round(diff), 'second');
  if (abs < 3600) return fmt.format(-Math.round(diff / 60), 'minute');
  if (abs < 86400) return fmt.format(-Math.round(diff / 3600), 'hour');
  return fmt.format(-Math.round(diff / 86400), 'day');
}
