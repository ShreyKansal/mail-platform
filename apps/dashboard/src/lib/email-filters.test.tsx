import { describe, expect, it } from 'vitest';
import { emailFilterErrors, emailQuery, localDateBoundary, readEmailFilters } from './email-filters';
const empty = readEmailFilters(new URLSearchParams());
describe('email filters', () => {
  it('restores all filters, including the explicit live-only value, from the URL', () => {
    const filters=readEmailFilters(new URLSearchParams('status=QUEUED&after=2026-10-01&before=2026-10-24&source=smtp&api_key_id=key-1&test_mode=false'));
    const query=emailQuery(filters,' receipt ');
    expect(query.get('test_mode')).toBe('false');
    expect(query.get('api_key_id')).toBe('key-1');
    expect(query.get('search')).toBe('receipt');
    expect(query.get('source')).toBe('smtp');
  });
  it('includes the entire selected end date using the following local midnight', () => {
    const query=emailQuery({...empty,after:'2026-10-24',before:'2026-10-24'},'');
    expect(new Date(query.get('created_after')!).getDate()).toBe(24);
    expect(new Date(query.get('created_before')!).getDate()).toBe(25);
    expect(new Date(query.get('created_before')!).getHours()).toBe(0);
    expect(emailFilterErrors({...empty,after:'2026-10-24',before:'2026-10-24'})).toEqual([]);
  });
  it('rejects reversed dates on the end-date field', () => {
    expect(emailFilterErrors({...empty,after:'2026-10-24',before:'2026-10-01'})).toContainEqual({path:'before',message:'End date must be on or after start date.'});
  });
  it('does not crash or send invalid dates from a manually edited URL', () => {
    expect(localDateBoundary('2026-02-30')).toBeUndefined();
    expect(localDateBoundary('invalid')).toBeUndefined();
    expect(emailQuery({...empty,after:'invalid',before:'2026-02-30'},'').has('created_before')).toBe(false);
  });
});
