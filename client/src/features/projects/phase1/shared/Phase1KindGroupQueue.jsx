/**
 * Group review-queue items by kind into nested collapsible cards.
 */
import { useMemo, useState } from 'react';
import { useAppStrings } from '../../../../locales/appStrings';
import { kindChipClass } from './phase1UiTokens';

const PLANNING_KIND_ORDER = Object.freeze([
  'WBS',
  'ARCHITECTURE',
  'RESOURCE',
  'DEPENDENCY',
  'SCHEDULE',
  'MILESTONE',
  'RELEASE',
  'RISK',
]);

export function groupItemsByKind(items, preferredOrder = PLANNING_KIND_ORDER) {
  const map = new Map();
  for (const item of items || []) {
    const kind = String(item?.kind || 'OTHER').toUpperCase();
    if (!map.has(kind)) map.set(kind, []);
    map.get(kind).push(item);
  }
  const ordered = [];
  for (const kind of preferredOrder) {
    if (map.has(kind)) {
      ordered.push({ kind, items: map.get(kind) });
      map.delete(kind);
    }
  }
  for (const [kind, kindItems] of map) {
    ordered.push({ kind, items: kindItems });
  }
  return ordered;
}

function KindGroupCard({ kind, items, defaultOpen = false, renderItem }) {
  const { t } = useAppStrings();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="flex max-h-[min(22rem,55vh)] flex-col overflow-hidden rounded-xl border border-border/70 bg-background shadow-sm">
      <button
        type="button"
        className="flex w-full shrink-0 items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/30"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className={kindChipClass(kind)}>{kind}</span>
          <span className="text-xs font-medium text-foreground">
            {t('workspace.phase1QueueKindGroup', { kind, count: items.length })}
          </span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? (
        <ul
          className="min-h-0 flex-1 divide-y divide-border/50 overflow-y-auto overscroll-contain border-t border-border/60 [scrollbar-gutter:stable]"
          onWheel={(e) => e.stopPropagation()}
        >
          {items.map((item) => (
            <li key={String(item.id || item._id)} className="px-2.5 py-1.5">
              {renderItem(item)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * @param {{
 *   items: object[],
 *   kindOrder?: string[],
 *   openKindIfCountAtMost?: number,
 *   renderItem: (item: object) => import('react').ReactNode,
 *   emptyLabel?: string,
 * }} props
 */
export default function Phase1KindGroupQueue({
  items,
  kindOrder = PLANNING_KIND_ORDER,
  openKindIfCountAtMost = 4,
  renderItem,
  emptyLabel,
}) {
  const groups = useMemo(() => groupItemsByKind(items, kindOrder), [items, kindOrder]);

  if (!groups.length) {
    return emptyLabel ? (
      <p className="px-1 py-2 text-sm text-muted-foreground">{emptyLabel}</p>
    ) : null;
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {groups.map(({ kind, items: kindItems }) => (
        <KindGroupCard
          key={kind}
          kind={kind}
          items={kindItems}
          defaultOpen={kindItems.length <= openKindIfCountAtMost && groups.length <= 3}
          renderItem={renderItem}
        />
      ))}
    </div>
  );
}
