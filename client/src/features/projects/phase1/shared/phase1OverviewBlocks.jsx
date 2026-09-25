/**
 * Shared Phase 1 overview building blocks (RA overview + Planning overview).
 */
import { useMemo, useState } from 'react';
import { buildPhase1ModulePath } from '../nav/phase1NavConfig';
import { kindChipClass } from './phase1UiTokens';

export const PHASE1_OVERVIEW_CARD =
  'relative z-0 w-full shrink-0 rounded-xl border border-border bg-surface shadow-sm';
export const PHASE1_OVERVIEW_CARD_PAD = 'px-3.5 py-3 sm:px-4 sm:py-3.5';

export function normalizeByKind(byKind) {
  if (!byKind) return {};
  if (Array.isArray(byKind)) {
    return Object.fromEntries(
      byKind
        .filter((row) => row && row.kind && Number(row.count) > 0)
        .map((row) => [String(row.kind).toUpperCase(), Number(row.count)])
    );
  }
  return byKind;
}

export function sortedKindEntries(byKind, order) {
  const entries = Object.entries(normalizeByKind(byKind)).filter(([, n]) => Number(n) > 0);
  entries.sort((a, b) => {
    const ia = order.indexOf(a[0]);
    const ib = order.indexOf(b[0]);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  return entries;
}

export function Phase1OverviewMark({ ok }) {
  return (
    <span
      className={
        ok
          ? 'inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/15 text-[10px] font-bold text-emerald-700 dark:text-emerald-300'
          : 'inline-flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground'
      }
      aria-hidden
    >
      {ok ? '✓' : '—'}
    </span>
  );
}

export function Phase1OverviewSection({ index, title, children, action }) {
  return (
    <section className="w-full shrink-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
            {index}
          </span>
          {title}
        </h2>
        {action || null}
      </div>
      <div className={`${PHASE1_OVERVIEW_CARD} ${PHASE1_OVERVIEW_CARD_PAD}`}>{children}</div>
    </section>
  );
}

export function Phase1KindNavChip({
  kind,
  count,
  resolvePath,
  projectId,
  organizationId,
  navigate,
  emphasize,
}) {
  const moduleSeg = resolvePath(kind);
  return (
    <button
      type="button"
      disabled={!moduleSeg}
      title={moduleSeg ? `${kind}: ${count ?? 0}` : undefined}
      className={`${kindChipClass(kind)} transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${
        emphasize ? 'ring-1 ring-amber-500/50' : ''
      }`}
      onClick={() => {
        if (!moduleSeg) return;
        navigate(buildPhase1ModulePath(projectId, moduleSeg, { organizationId }));
      }}
    >
      {kind}
      <span className="opacity-80">{count ?? 0}</span>
    </button>
  );
}

/** Attention block scoped to analysis or planning (inbox by kind). */
export function Phase1ReviewAttentionBlock({
  attention,
  kindOrder,
  resolvePath,
  reviewsPath,
  projectId,
  organizationId,
  navigate,
  t,
}) {
  const pending = attention?.pendingReview || { total: 0, byKind: {} };
  const changes = attention?.changesRequested || { total: 0, byKind: {} };
  const pendingTotal = Number(pending.total || 0);
  const changesTotal = Number(changes.total || 0);
  const total = pendingTotal + changesTotal;

  const [tab, setTab] = useState(() =>
    pendingTotal > 0 || changesTotal === 0 ? 'pending' : 'changes'
  );

  const active = tab === 'changes' ? changes : pending;
  const kinds = useMemo(
    () => sortedKindEntries(active.byKind, kindOrder),
    [active.byKind, kindOrder]
  );

  if (!total) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-2">
        <p className="text-xs text-muted-foreground">{t('workspace.phase1AttentionEmpty')}</p>
        <button
          type="button"
          className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted"
          onClick={() =>
            navigate(buildPhase1ModulePath(projectId, reviewsPath, { organizationId }))
          }
        >
          {t('workspace.phase1GoReviews')}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.04] px-3 py-2.5 dark:bg-amber-950/15">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">
          {t('workspace.phase1AttentionSummary', {
            pending: pendingTotal,
            changes: changesTotal,
          })}
        </p>
        <button
          type="button"
          className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted"
          onClick={() =>
            navigate(buildPhase1ModulePath(projectId, reviewsPath, { organizationId }))
          }
        >
          {t('workspace.phase1GoReviews')}
        </button>
      </div>

      <div
        className="mt-2 inline-flex rounded-lg border border-border bg-background p-0.5"
        role="tablist"
        aria-label={t('workspace.phase1AttentionTitle')}
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'pending'}
          className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
            tab === 'pending'
              ? 'bg-amber-500/15 text-amber-950 dark:text-amber-100'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setTab('pending')}
        >
          {t('workspace.phase1AttentionPending')}
          <span className="ml-1 tabular-nums opacity-80">{pendingTotal}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'changes'}
          className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
            tab === 'changes'
              ? 'bg-orange-500/15 text-orange-950 dark:text-orange-100'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setTab('changes')}
        >
          {t('workspace.phase1AttentionChanges')}
          <span className="ml-1 tabular-nums opacity-80">{changesTotal}</span>
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {kinds.length ? (
          kinds.map(([kind, count]) => (
            <Phase1KindNavChip
              key={`${tab}-${kind}`}
              kind={kind}
              count={count}
              resolvePath={resolvePath}
              projectId={projectId}
              organizationId={organizationId}
              navigate={navigate}
              emphasize
            />
          ))
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {tab === 'changes'
              ? t('workspace.phase1AttentionChangesEmpty')
              : t('workspace.phase1AttentionPendingEmpty')}
          </p>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">{t('workspace.phase1AttentionKindHint')}</p>
    </div>
  );
}
