import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Table, type Row} from './Table';

afterEach(cleanup);
const columns = [{key:'name',content:'Name',isSortable:true}];
const rows: Row[] = Array.from({length:73},(_,i)=>({key:String(i),cells:[{content:`Record ${i+1}`,sortValue:i+1}]}));
const base = {label:'Resources',columns,isLoading:false,emptyView:<p>No resources</p>};
HTMLElement.prototype.scrollTo = vi.fn();

describe('large resource tables',()=>{
  it('bounds local rows, navigates without losing records and resets on size change',()=>{
    render(<Table {...base} rows={rows} />);
    expect(screen.getAllByRole('row')).toHaveLength(26);
    expect(screen.getByText('1–25 of 73 results')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Next'}));
    expect(screen.getByText('26–50 of 73 results')).toBeTruthy();
    expect(screen.getByRole('region',{name:'Resources table'})).toBe(document.activeElement);
    fireEvent.change(screen.getByRole('combobox',{name:'Resources rows per page'}),{target:{value:'100'}});
    expect(screen.getAllByRole('row')).toHaveLength(74);
    expect(screen.getByText('1–73 of 73 results')).toBeTruthy();
  });
  it('sorts all local rows before slicing and clamps after the collection shrinks',()=>{
    const view=render(<Table {...base} rows={rows} />);
    fireEvent.click(screen.getByRole('button',{name:'Name'}));
    fireEvent.click(screen.getByRole('button',{name:'Name'}));
    expect(within(screen.getAllByRole('row')[1]!).getByText('Record 73')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Next'}));
    view.rerender(<Table {...base} rows={rows.slice(0,2)} />);
    expect(screen.getByText('1–2 of 2 results')).toBeTruthy();
  });
  it('delegates cursor navigation without slicing or fabricating dataset totals',()=>{
    const onNext=vi.fn();
    render(<Table {...base} rows={rows.slice(0,50)} pagination={{hasPrevious:false,hasNext:true,onPrevious:vi.fn(),onNext}} />);
    expect(screen.getAllByRole('row')).toHaveLength(51);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('50 results on this page')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Next'}));expect(onNext).toHaveBeenCalledOnce();
  });
  it('keeps last-known rows visible when a background refresh fails',()=>{
    render(<Table {...base} rows={rows.slice(0,2)} error={new Error('Refresh unavailable')} onRetry={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Record 1')).toBeTruthy();
    expect(screen.getByRole('button',{name:'Try again'})).toBeTruthy();
  });
  it('searches the complete collection across pages and distinguishes filtered empty',()=>{
    render(<Table {...base} rows={rows} searchable />);
    fireEvent.change(screen.getByRole('searchbox',{name:'Search resources'}),{target:{value:'Record 73'}});
    expect(screen.getByText('Record 73')).toBeTruthy();
    expect(screen.getByText('1–1 of 1 results')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'),{target:{value:'missing resource'}});
    expect(screen.getByRole('heading',{name:'No matching results'})).toBeTruthy();
    expect(screen.queryByText('No resources')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Clear search'}));
    expect(screen.getByText('1–25 of 73 results')).toBeTruthy();
  });
});
