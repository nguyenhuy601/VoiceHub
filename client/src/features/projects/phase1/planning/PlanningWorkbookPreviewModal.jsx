/**
 * Modal: dry-run Excel import preview grouped by Planning kind cards.
 */
import { useEffect, useMemo, useState } from 'react';
import Modal from '../../../../components/Shared/Modal';
import { useAppStrings } from '../../../../locales/appStrings';
import { kindChipClass } from '../shared/phase1UiTokens';

const KIND_ORDER = Object.freeze([
  'WBS',
  'ARCHITECTURE',
  'RESOURCE',
  'DEPENDENCY',
  'SCHEDULE',
  'MILESTONE',
  'RELEASE',
  'RISK',
]);

function groupByKind(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const kind = String(row.kind || 'OTHER').toUpperCase();
    if (!map.has(kind)) map.set(kind, []);
    map.get(kind).push(row);
  }
  const ordered = [];
  for (const kind of KIND_ORDER) {
    if (map.has(kind)) {
      ordered.push({ kind, items: map.get(kind) });
      map.delete(kind);
    }
  }
  for (const [kind, items] of map) {
    ordered.push({ kind, items });
  }
  return ordered;
}

function PreviewItemCard({ item, t }) {
  return (
    <li className="rounded-lg border border-border/60 bg-background px-2.5 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-mono text-[11px] font-semibold text-foreground">
          {item.externalKey || '—'}
        </span>
        <span className="min-w-0 flex-1 break-words text-sm font-medium text-foreground">
          {item.title || '—'}
        </span>
      </div>
      {item.parentExternalKey ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {t('workspace.phase1DumpPreviewParent', { key: item.parentExternalKey })}
        </p>
      ) : null}
      {item.summary ? (
        <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-muted-foreground">
          {item.summary}
        </p>
      ) : null}
      {item.sheet ? (
        <p className="mt-1 text-[10px] text-muted-foreground/80">
          {t('workspace.phase1DumpPreviewSheetRow', {
            sheet: item.sheet,
            row: item.row || '—',
          })}
        </p>
      ) : null}
    </li>
  );
}

export default function PlanningWorkbookPreviewModal({
  open,
  preview,
  confirming = false,
  onClose,
  onConfirm,
}) {
  const { t } = useAppStrings();
  const [expanded, setExpanded] = useState(() => new Set());

  const groups = useMemo(
    () => groupByKind(Array.isArray(preview?.preview) ? preview.preview : []),
    [preview]
  );

  const createCount = Number(preview?.wouldCreate ?? preview?.preview?.length ?? 0);
  const skipCount = Number(preview?.wouldSkip ?? preview?.skipped ?? 0);
  const errors = Array.isArray(preview?.errors) ? preview.errors : [];
  const skippedItems = Array.isArray(preview?.skippedItems) ? preview.skippedItems : [];
  const canConfirm = Boolean(createCount > 0) && errors.length === 0 && !confirming;

  const toggleKind = (kind) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  useEffect(() => {
    if (!open || !groups.length) return;
    setExpanded(new Set(groups.map((g) => g.kind)));
  }, [open, preview, groups]);

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t('workspace.phase1DumpPreviewModalTitle')}
      size="lg"
      fill
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p className="min-w-0 text-[11px] leading-snug text-muted-foreground sm:max-w-[55%]">
            {t('workspace.phase1DumpPreviewTitle', {
              count: createCount,
              skipped: skipCount,
            })}
          </p>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <button
              type="button"
              className="w-full rounded-lg border border-border px-3 py-2 text-xs sm:w-auto sm:py-1.5"
              onClick={onClose}
              disabled={confirming}
            >
              {t('workspace.phase1DumpCancelPreview')}
            </button>
            <button
              type="button"
              className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50 sm:w-auto sm:py-1.5"
              disabled={!canConfirm}
              onClick={onConfirm}
            >
              {confirming
                ? t('common.loading')
                : t('workspace.phase1DumpConfirmImport')}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain pr-0.5">
        <p className="text-xs leading-snug text-muted-foreground">
          {t('workspace.phase1DumpPreviewModalHint')}
        </p>

        {errors.length ? (
          <div className="shrink-0 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2">
            <p className="text-xs font-semibold text-destructive">
              {t('workspace.phase1DumpPreviewErrors', { count: errors.length })}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-destructive/90">
              {t('workspace.phase1DumpPreviewErrorsHint')}
            </p>
            <ul className="mt-1.5 max-h-[min(28dvh,10rem)] space-y-0.5 overflow-y-auto text-[11px] text-destructive/90">
              {errors.slice(0, 20).map((err, i) => {
                const msg =
                  typeof err === 'string'
                    ? err
                    : err?.message || err?.code || JSON.stringify(err);
                const loc = [err?.sheet, err?.row]
                  .filter((x) => x != null && x !== '')
                  .join(' · ');
                return (
                  <li key={`err-${i}`} className="break-words">
                    {loc ? `${loc} — ${msg}` : msg}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {groups.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {groups.map(({ kind, items }) => {
              const isOpen = expanded.has(kind);
              return (
                <section
                  key={kind}
                  className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-3 py-2 text-left hover:bg-muted/35"
                    onClick={() => toggleKind(kind)}
                    aria-expanded={isOpen}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={kindChipClass(kind)}>{kind}</span>
                      <span className="truncate text-xs font-medium text-foreground">
                        {t('workspace.phase1DumpPreviewGroupCount', {
                          kind,
                          count: items.length,
                        })}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground" aria-hidden>
                      {isOpen ? '▾' : '▸'}
                    </span>
                  </button>
                  {isOpen ? (
                    <ul className="max-h-[min(40dvh,14rem)] space-y-1.5 overflow-y-auto p-2.5 sm:max-h-56">
                      {items.map((item) => (
                        <PreviewItemCard
                          key={`${kind}:${item.externalKey}`}
                          item={item}
                          t={t}
                        />
                      ))}
                    </ul>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
            {t('workspace.phase1DumpPreviewEmpty')}
          </p>
        )}

        {skippedItems.length ? (
          <section className="shrink-0 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5">
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">
              {t('workspace.phase1DumpPreviewSkippedTitle', { count: skippedItems.length })}
            </p>
            <ul className="mt-1.5 max-h-[min(20dvh,6rem)] space-y-0.5 overflow-y-auto text-[11px] text-muted-foreground">
              {skippedItems.slice(0, 40).map((s) => (
                <li key={`skip-${s.kind}:${s.externalKey}`} className="break-words">
                  <span className="font-mono text-foreground">{s.kind}</span> · {s.externalKey}
                  {s.message ? ` — ${s.message}` : ''}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
