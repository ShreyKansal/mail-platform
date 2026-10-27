export const EMAIL_FILTER_KEYS = ['status', 'after', 'before', 'api_key_id', 'source', 'test_mode'] as const;
export type EmailFilters = Record<(typeof EMAIL_FILTER_KEYS)[number], string>;
export function readEmailFilters(params: URLSearchParams): EmailFilters {
  return Object.fromEntries(EMAIL_FILTER_KEYS.map(key=>[key, params.get(key) ?? ''])) as EmailFilters;
}
export function localDateBoundary(value: string, nextDay = false): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year!, month! - 1, day!);
  if (date.getFullYear() !== year || date.getMonth() !== month! - 1 || date.getDate() !== day) return undefined;
  if (nextDay) date.setDate(date.getDate() + 1);
  return date.toISOString();
}
export function emailFilterErrors(filters: EmailFilters) {
  const errors: Array<{path: string; message: string}> = [];
  if (filters.after && !localDateBoundary(filters.after)) errors.push({path:'after',message:'Enter a valid start date.'});
  if (filters.before && !localDateBoundary(filters.before)) errors.push({path:'before',message:'Enter a valid end date.'});
  if (filters.after && filters.before && filters.after > filters.before) errors.push({path:'before',message:'End date must be on or after start date.'});
  return errors;
}
export function emailQuery(filters: EmailFilters, search: string) {
  const params = new URLSearchParams({limit:'25'});
  if (search.trim()) params.set('search',search.trim());
  for (const key of ['status','source','api_key_id','test_mode'] as const) if (filters[key]) params.set(key,filters[key]);
  const after = localDateBoundary(filters.after);
  const before = localDateBoundary(filters.before, true);
  if (after) params.set('created_after',after);
  if (before) params.set('created_before',before);
  return params;
}
