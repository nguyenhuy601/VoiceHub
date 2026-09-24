/**
 * Shared Phase 1 collapsible section card (Approval hubs, Resource, etc.).
 */
import { useState } from 'react';

export default function Phase1CollapsibleCard({
  title,
  summary,
  defaultOpen = false,
  toneClass = '',
  headerAside = null,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl border shadow-sm ${toneClass || 'border-border bg-surface'}`}
    >
      <div className="flex w-full items-start gap-2 px-3.5 py-2.5 hover:bg-muted/25">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="block text-sm font-semibold">{title}</span>
          {!open && summary ? (
            <span className="mt-0.5 block text-[11px] text-muted-foreground">{summary}</span>
          ) : null}
        </button>
        {headerAside ? <div className="flex shrink-0 flex-wrap items-center gap-1.5">{headerAside}</div> : null}
        <button
          type="button"
          className="shrink-0 rounded border border-border/60 px-1.5 py-0.5 text-xs text-muted-foreground"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'collapse' : 'expand'}
        >
          {open ? '▾' : '▸'}
        </button>
      </div>
      {open ? (
        <div
          className="min-h-0 max-h-[min(36rem,70vh)] overflow-y-auto overscroll-contain border-t border-border/60 px-3.5 py-3 [scrollbar-gutter:stable]"
          onWheel={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
