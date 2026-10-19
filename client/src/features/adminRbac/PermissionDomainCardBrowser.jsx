import { useEffect, useId, useMemo, useRef } from 'react';
import { Search } from 'lucide-react';

import { domainIconForKey } from './permissionDomainIcons';

/**
 * Catalog browser: domain tiles on top + focused detail panel below (scroll-to on select).
 *
 * @param {{
 *   domains: Array<{ key: string, label: string, total?: number, selected?: number }>,
 *   activeKey: string,
 *   onSelect: (key: string) => void,
 *   searchValue?: string,
 *   onSearchChange?: (value: string) => void,
 *   searchLabel?: string,
 *   searchPlaceholder?: string,
 *   navTitle?: string,
 *   pickHint?: string,
 *   emptyNav?: string,
 *   detailHeading?: string,
 *   summary?: import('react').ReactNode,
 *   children?: import('react').ReactNode,
 *   detailRef?: import('react').RefObject<HTMLElement | null>,
 * }} props
 */
export default function PermissionDomainCardBrowser({
  domains = [],
  activeKey = '',
  onSelect,
  searchValue = '',
  onSearchChange,
  searchLabel,
  searchPlaceholder,
  navTitle,
  pickHint,
  emptyNav,
  detailHeading,
  summary = null,
  children = null,
  detailRef = null,
}) {
  const listId = useId();
  const panelRef = useRef(null);
  const resolvedDetailRef = detailRef || panelRef;

  const active = useMemo(
    () => domains.find((d) => String(d.key) === String(activeKey)) || null,
    [domains, activeKey]
  );

  useEffect(() => {
    if (!activeKey || !resolvedDetailRef.current) return;
    const el = resolvedDetailRef.current;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  }, [activeKey, resolvedDetailRef]);

  return (
    <div className="space-y-4">
      {summary}

      {typeof onSearchChange === 'function' ? (
        <label className="flex flex-col gap-1.5 text-sm">
          {searchLabel ? (
            <span className="font-medium text-foreground">{searchLabel}</span>
          ) : null}
          <span className="relative block max-w-xl">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder || undefined}
              className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-3 text-sm shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
              aria-controls={listId}
            />
          </span>
        </label>
      ) : null}

      <div>
        {navTitle ? (
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {navTitle}
          </p>
        ) : null}
        <div
          id={listId}
          role="listbox"
          aria-label={navTitle || undefined}
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4"
        >
          {domains.map((domain) => {
            const selected = domain.key === activeKey;
            const total = Number(domain.total) || 0;
            const picked = Number(domain.selected);
            const hasPickCount = Number.isFinite(picked);
            const Icon = domainIconForKey(domain.key);
            return (
              <button
                key={domain.key}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onSelect?.(domain.key)}
                className={`group flex min-h-[4.5rem] flex-col items-start justify-between gap-2 rounded-xl border px-3 py-3 text-left shadow-sm transition-[border-color,background-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${
                  selected
                    ? 'border-primary bg-primary-subtle shadow-md ring-1 ring-primary/20'
                    : 'border-border bg-card hover:-translate-y-0.5 hover:border-primary/30 hover:bg-muted/40 hover:shadow-md motion-reduce:hover:translate-y-0'
                }`}
              >
                <span className="flex w-full items-start justify-between gap-2">
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
                      selected
                        ? 'bg-primary/15 text-primary'
                        : 'bg-muted text-muted-foreground group-hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span
                    className={`inline-flex min-w-[1.75rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                      selected
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {hasPickCount ? `${picked}/${total}` : total || '—'}
                  </span>
                </span>
                <span
                  className={`text-sm leading-snug ${
                    selected ? 'font-semibold text-foreground' : 'font-medium text-foreground'
                  }`}
                >
                  {domain.label}
                </span>
              </button>
            );
          })}
        </div>
        {!domains.length ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            {emptyNav}
          </p>
        ) : null}
      </div>

      <section
        ref={resolvedDetailRef}
        className="rounded-2xl border border-border bg-gradient-to-b from-card to-muted/20 p-4 shadow-sm sm:p-5"
        aria-live="polite"
      >
        {active ? (
          <div className="space-y-4">
            <header className="flex flex-wrap items-end justify-between gap-2 border-b border-border/70 pb-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {detailHeading || navTitle}
                </p>
                <h3 className="mt-0.5 text-base font-semibold text-foreground sm:text-lg">
                  {active.label}
                </h3>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
                {Number.isFinite(Number(active.selected))
                  ? `${active.selected}/${active.total || 0}`
                  : `${active.total || 0}`}
              </span>
            </header>
            {children}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">{pickHint}</p>
        )}
      </section>
    </div>
  );
}
