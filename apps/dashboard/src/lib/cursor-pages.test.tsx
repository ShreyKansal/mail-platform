import {act, renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {useCursorPages} from './hooks';
describe('filter-scoped cursor pages',()=>{
  it('starts on the first page when applied filters change',()=>{
    const {result,rerender}=renderHook(({scope})=>useCursorPages(scope),{initialProps:{scope:'status=QUEUED'}});
    act(()=>result.current.next('queued-cursor'));expect(result.current.cursor).toBe('queued-cursor');
    rerender({scope:'status=FAILED'});expect(result.current.cursor).toBeUndefined();expect(result.current.hasPrevious).toBe(false);
    act(()=>result.current.next('failed-cursor'));expect(result.current.cursor).toBe('failed-cursor');
    act(()=>result.current.previous());expect(result.current.cursor).toBeUndefined();
  });
});
