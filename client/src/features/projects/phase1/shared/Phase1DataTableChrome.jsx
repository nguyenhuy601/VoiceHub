import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Plus,
  Search,
  Settings2,
} from 'lucide-react';
import { PHASE1_TABLE_COLORS as C } from './phase1TableColors';

const FOCUS_BTN =
  'transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Soft toolbar — kind badge | search + columns + primary.
 */
export function Phase1DataTableToolbar({
  kind,
  title,
  subtitle,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  columnsSlot,
  primaryLabel,
  onPrimary,
  extraActions,
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3.5 py-2.5 ${C.toolbar}`}
    >
      <div className="min-w-0">
        <h1 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground sm:text-[15px]">
          {kind ? (
            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-primary/10 px-2 font-mono text-[11px] font-bold text-primary">
              {kind}
            </span>
          ) : null}
          <span className="truncate">{title}</span>
        </h1>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative inline-flex min-w-[10rem] flex-1 items-center sm:flex-none">
          <Search
            className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-muted-foreground"
            aria-hidden
          />
          <input
            className={`w-full rounded-full border border-border bg-background py-1.5 pl-9 pr-3 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring sm:w-52 ${FOCUS_BTN}`}
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange?.(e.target.value)}
          />
        </label>
        {columnsSlot}
        {extraActions}
        {onPrimary && primaryLabel ? (
          <button
            type="button"
            className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-sm font-medium shadow-sm ${C.primaryBtn}`}
            onClick={onPrimary}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {primaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function Phase1ColumnsTriggerButton({ label, expanded, onClick }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-sm text-foreground shadow-sm hover:bg-muted ${FOCUS_BTN}`}
      aria-expanded={expanded}
      aria-haspopup="listbox"
      onClick={onClick}
    >
      <Settings2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      {label}
    </button>
  );
}

export function Phase1SortableTh({
  label,
  sortId,
  activeSortId,
  sortDir,
  onSort,
  sticky = false,
  className = '',
}) {
  const active = Boolean(sortId) && sortId === activeSortId;
  const canSort = typeof onSort === 'function' && Boolean(sortId);
  const base = `whitespace-nowrap border-b border-border px-3 py-2.5 text-left text-[11px] font-semibold tracking-wide ${C.thead} ${C.theadText}`;
  const stickyCls = sticky ? `sticky left-0 z-20 ${C.thead} shadow-sm` : '';

  if (!canSort) {
    return (
      <th className={`${base} ${stickyCls} ${className}`} scope="col">
        {label}
      </th>
    );
  }

  return (
    <th
      className={`${base} ${stickyCls} ${className}`}
      scope="col"
      aria-sort={active ? `${sortDir}ending` : 'none'}
    >
      <button
        type="button"
        className={`inline-flex max-w-full items-center gap-1 rounded px-0.5 py-0.5 text-foreground hover:bg-primary/10 ${FOCUS_BTN}`}
        onClick={() => onSort(sortId)}
      >
        <span className="truncate">{label}</span>
        {active ? (
          sortDir === 'desc' ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronUp className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
          )
        ) : (
          <span className="inline-flex h-3.5 w-3 shrink-0 flex-col text-muted-foreground" aria-hidden>
            <ChevronUp className="-mb-1 h-2.5 w-2.5" strokeWidth={2.5} />
            <ChevronDown className="h-2.5 w-2.5" strokeWidth={2.5} />
          </span>
        )}
      </button>
    </th>
  );
}

export function Phase1TablePagination({
  page,
  pageCount,
  total,
  onPageChange,
  pageLabel,
  disabled = false,
}) {
  const canPrev = !disabled && page > 1;
  const canNext = !disabled && page < pageCount;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface px-3 py-2">
      <span className="text-xs text-muted-foreground">{pageLabel}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={`inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-muted text-foreground disabled:opacity-35 ${FOCUS_BTN}`}
          disabled={!canPrev}
          aria-label="prev"
          onClick={() => onPageChange?.(page - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={`inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-muted text-foreground disabled:opacity-35 ${FOCUS_BTN}`}
          disabled={!canNext}
          aria-label="next"
          onClick={() => onPageChange?.(page + 1)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
