import { isValidElement, useId, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from './icons';
import Button from './controls/Button';
import { Table as PrimitiveTable, TableHeader, TableHead, TableBody, TableRow, TableCell, TableCaption } from './ui/table';
import { Inline } from '@atlaskit/primitives';
import { ErrorBlock } from './feedback';
import { FilterSelect } from './FilterSelect';
import Textfield from './controls/Textfield';
import { EmptyState } from './EmptyState';

function searchText(content: ReactNode): string {
  if (typeof content === 'string' || typeof content === 'number') return String(content);
  if (Array.isArray(content)) return content.map(searchText).join(' ');
  if (isValidElement<{children?:ReactNode}>(content)) return searchText(content.props.children);
  return '';
}

export interface Column {
  key: string;
  content: string;
  isSortable?: boolean;
  width?: number;
  align?: 'start' | 'end';
}

export interface Row {
  key: string;
  /** One entry per column: rendered content plus the value used for sorting. */
  cells: Array<{ content: ReactNode; sortValue?: string | number }>;
}

export interface CursorPagination {
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

export interface TableProps {
  label: string;
  columns: Column[];
  rows: Row[] | undefined;
  isLoading: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyView: ReactElement;
  pagination?: CursorPagination;
  caption?: ReactNode;
  toolbar?: ReactNode;
  /** Small embedded tables can omit the result footer. */
  compact?: boolean;
  /** Search the complete loaded collection; cursor lists use server filters instead. */
  searchable?: boolean;
}

/** Shared shadcn table with local sorting and server-side cursor pagination. */
export function Table({ label, columns: inputColumns, rows, isLoading, error, onRetry, emptyView, pagination, caption, toolbar, compact = false, searchable = false }: TableProps) {
  const columns = inputColumns.map(column => ({ ...column, align: column.align ?? (column.key === 'actions' ? 'end' : 'start') }));
  const [sort, setSort] = useState<{ index: number; direction: 1 | -1 }>();
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  const statusId = useId();
  const [search, setSearch] = useState('');
  const query = searchable && !pagination ? search.trim().toLocaleLowerCase() : '';
  const ordered = (rows ?? []).filter(row=>!query || row.cells.some(cell=>`${cell.sortValue ?? ''} ${searchText(cell.content)}`.toLocaleLowerCase().includes(query)));
  if (sort) ordered.sort((a, b) => {
    const av = a.cells[sort.index]?.sortValue ?? '';
    const bv = b.cells[sort.index]?.sortValue ?? '';
    return sort.direction * (typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true }));
  });
  // Cursor lists are already paged by the API. Never invent a total for them.
  const local = !pagination && !compact;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(ordered.length / pageSize) - 1));
  const start = local ? currentPage * pageSize : 0;
  const visible = local ? ordered.slice(start, start + pageSize) : ordered;
  const previous = local ? currentPage > 0 : !!pagination?.hasPrevious;
  const next = local ? start + pageSize < ordered.length : !!pagination?.hasNext;
  const move = (direction: -1 | 1) => {
    if (local) setPage(currentPage + direction);
    else if (direction < 0) pagination?.onPrevious(); else pagination?.onNext();
    if (scroll.current) { scroll.current.scrollTop = 0; scroll.current.scrollLeft = 0; }
    scroll.current?.focus({preventScroll:true});
  };
  const hasRows = !!rows?.length;
  const minimumWidth = columns.reduce((width, column) => width + (column.key === 'actions' ? 80 : ['name', 'email', 'subject', 'url', 'domain', 'route'].includes(column.key) ? 220 : 160), 0);
  return (
    <div className="data-table">
      {toolbar && <div className="table-toolbar">{toolbar}</div>}
      {searchable && !pagination && <div className="table-search"><div className="table-search-input"><Search size={16} aria-hidden /><Textfield type="search" aria-label={`Search ${label.toLowerCase()}`} placeholder={`Search ${label.toLowerCase()}…`} value={search} onChange={event=>{setSearch(event.currentTarget.value);setPage(0);}} /></div>{query && <Button appearance="subtle" spacing="compact" onClick={()=>{setSearch('');setPage(0);}}>Clear search</Button>}</div>}
      {!!error && <div className="table-error"><ErrorBlock title={hasRows ? 'Could not refresh results' : `Unable to load ${label.toLowerCase()}`} error={error} {...(onRetry ? { onRetry } : {})} /></div>}
      {!error || hasRows ? !isLoading && ordered.length === 0 ? <div className="table-empty">{query ? <EmptyState header="No matching results" description="Try a different name or clear your search." /> : emptyView}</div> : <div ref={scroll} className="table-scroll" role="region" aria-label={`${label} table`} tabIndex={0} aria-describedby={statusId} style={{ '--table-min-width': `${minimumWidth}px` } as CSSProperties}>
        <PrimitiveTable aria-label={label} aria-busy={isLoading} className="product-table">
          {caption && <TableCaption>{caption}</TableCaption>}
          <TableHeader><TableRow>{columns.map((column, index) => <TableHead key={column.key} className="product-table-heading" style={{ width: column.width ? column.width + '%' : undefined, textAlign: column.align === 'end' ? 'right' : 'left' }} aria-sort={sort?.index === index ? sort.direction === 1 ? 'ascending' : 'descending' : undefined}>
            {column.isSortable ? <button className="product-table-sort" title={pagination ? 'Sort results on this page' : 'Sort results'} onClick={() => {setPage(0);setSort({ index, direction: sort?.index === index && sort.direction === 1 ? -1 : 1 });}}><span className="table-heading-label" title={column.content}>{column.content}</span>{sort?.index === index ? sort.direction === 1 ? <ArrowUp size={16} aria-hidden /> : <ArrowDown size={16} aria-hidden /> : <ArrowUpDown size={16} aria-hidden />}</button> : <span className="table-heading-label" title={column.content}>{column.content}</span>}
          </TableHead>)}</TableRow></TableHeader>
          <TableBody>{isLoading ? Array.from({length:6},(_,row)=><TableRow key={row} aria-hidden="true">{columns.map(column=><TableCell key={column.key} className="product-table-cell"><span className={'table-skeleton skeleton-'+row} /></TableCell>)}</TableRow>) : visible.map(row => <TableRow key={row.key}>{row.cells.map((cell, index) => <TableCell key={columns[index]?.key ?? index} className="product-table-cell"><div className={'table-cell-content align-' + (columns[index]?.align ?? 'start')} title={searchText(cell.content) || undefined}>{typeof cell.content === 'string' || typeof cell.content === 'number' ? <span className="table-cell-text" title={String(cell.content)}>{cell.content}</span> : cell.content}</div></TableCell>)}</TableRow>)}</TableBody>
        </PrimitiveTable>
      </div> : null}
      <span id={statusId} className="sr-only" role="status">{isLoading ? `Loading ${label.toLowerCase()}` : error ? 'Data could not be refreshed.' : `${visible.length} results displayed.${pagination && sort ? ' Sorting applies to this page.' : ''}`}</span>
      {!compact && !isLoading && visible.length > 0 && (
        <nav className="table-footer" aria-label={`${label} pages`}>
          <span>{local ? `${start + 1}–${start + visible.length} of ${ordered.length.toLocaleString()} results` : `${rows!.length.toLocaleString()} results on this page`}</span>
          <Inline space="space.100" alignInline="end">
            {local && ordered.length > 25 && <FilterSelect aria-label={`${label} rows per page`} value={pageSize} options={[25,50,100].map(value=>({value,label:`${value} per page`}))} onChange={event=>{setPageSize(Number(event.currentTarget.value));setPage(0);if(scroll.current)scroll.current.scrollTop=0;}} />}
            {(previous || next) && <><Button isDisabled={!previous} onClick={()=>move(-1)}><ChevronLeft size={16} aria-hidden />Previous</Button><Button isDisabled={!next} onClick={()=>move(1)}>Next<ChevronRight size={16} aria-hidden /></Button></>}
          </Inline>
        </nav>
      )}
    </div>
  );
}
