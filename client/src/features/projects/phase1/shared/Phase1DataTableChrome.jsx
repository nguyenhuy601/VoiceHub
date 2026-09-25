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

/**
 * Soft sky toolbar — lavender kind badge | search + Cột bảng + Thêm (mock).
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
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 ${C.toolbar} ${C.toolbarDark}`}
    >
      <div className="min-w-0">
        <h1 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#262626] dark:text-slate-100 sm:text-[15px]">
          {kind ? (
            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-[#EFE8FD] px-2 font-mono text-[11px] font-bold text-[#531DAB]">
              {kind}
            </span>
          ) : null}
          <span className="truncate">{title}</span>
        </h1>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] text-[#8C8C8C] dark:text-slate-400">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative inline-flex min-w-[10rem] flex-1 items-center sm:flex-none">
          <Search
            className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-[#BFBFBF]"
            aria-hidden
          />
          <input
            className="w-full rounded-full border border-[#D9D9D9] bg-white py-1.5 pl-9 pr-3 text-sm text-[#262626] shadow-sm outline-none placeholder:text-[#BFBFBF] focus:border-[#1677FF] focus:ring-1 focus:ring-[#1677FF] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 sm:w-52"
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

/** «Cột bảng» — white pill, light gray border (not heavy black). */
export function Phase1ColumnsTriggerButton({ label, expanded, onClick }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 rounded-full border border-[#D9D9D9] bg-white px-3 py-1.5 text-sm text-[#262626] shadow-sm hover:bg-[#FAFAFA] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      aria-expanded={expanded}
      aria-haspopup="listbox"
      onClick={onClick}
    >
      <Settings2 className="h-3.5 w-3.5 text-[#595959]" aria-hidden />
      {label}
    </button>
  );
}

/**
 * Sortable light-blue header — slightly deeper than toolbar; dark label text.
 */
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
  const base = `whitespace-nowrap border-b border-[#A8C8DE] px-3 py-2.5 text-left text-[11px] font-semibold tracking-wide ${C.thead} ${C.theadDark} ${C.theadText} dark:border-sky-800 dark:text-sky-100`;
  const stickyCls = sticky
    ? `sticky left-0 z-20 ${C.thead} ${C.theadDark} shadow-[2px_0_0_0_rgba(168,200,222,0.9)]`
    : '';

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
        className="inline-flex max-w-full items-center gap-1 rounded px-0.5 py-0.5 text-[#1E3A4C] hover:bg-[#B5D4EA]/70 dark:text-sky-100 dark:hover:bg-sky-800/40"
        onClick={() => onSort(sortId)}
      >
        <span className="truncate">{label}</span>
        {active ? (
          sortDir === 'desc' ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-[#3D6A80]" aria-hidden />
          ) : (
            <ChevronUp className="h-3 w-3 shrink-0 text-[#3D6A80]" aria-hidden />
          )
        ) : (
          <span className="inline-flex h-3.5 w-3 shrink-0 flex-col text-[#7A9EB3]" aria-hidden>
            <ChevronUp className="-mb-1 h-2.5 w-2.5" strokeWidth={2.5} />
            <ChevronDown className="h-2.5 w-2.5" strokeWidth={2.5} />
          </span>
        )}
      </button>
    </th>
  );
}

/** Footer right: «Trang 1 / 1 (3 mục)» + square chevrons. */
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
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#E8E8E8] bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
      <span className="text-xs text-[#8C8C8C] dark:text-slate-400">{pageLabel}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-[#D9D9D9] bg-[#FAFAFA] text-[#595959] disabled:opacity-35 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
          disabled={!canPrev}
          aria-label="prev"
          onClick={() => onPageChange?.(page - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-[#D9D9D9] bg-[#FAFAFA] text-[#595959] disabled:opacity-35 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
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
