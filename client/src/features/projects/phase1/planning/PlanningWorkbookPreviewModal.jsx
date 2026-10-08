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
        <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
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

function suggestionKey(item) {
  return `${item.kind}|${item.externalKey}|${item.field}`;
}

function canApplySuggestion(item) {
  if (item?.field === 'startDate') return false;
  if (item?.verdict !== 'blank_suggest' && item?.verdict !== 'revise') return false;
  if (item.field === 'endDate') return Boolean(item.suggestedValue);
  if (item.field === 'assignee') return Boolean(item.assignee?.userId && item.assignee?.email);
  return false;
}

function fieldLabel(item, t) {
  if (item?.field === 'assignee') return t('workspace.phase1DumpSuggestAssignee');
  return t('workspace.phase1DumpSuggestDueDate');
}

function suggestedText(item) {
  if (item?.field === 'assignee') {
    const person = item.assignee;
    if (!person?.email) return '—';
    return person.displayName ? `${person.displayName} (${person.email})` : person.email;
  }
  return item?.suggestedValue || '—';
}

function SuggestionGroup({ title, items, applyMap, onToggle, t }) {
  if (!items.length) return null;
  return (
    <section className="rounded-xl border border-border bg-surface px-3 py-2.5">
      <p className="text-xs font-semibold text-foreground">
        {title} · {items.length}
      </p>
      <ul className="mt-1.5 max-h-64 space-y-1 overflow-y-auto text-[11px]">
        {items.map((item) => {
          const key = suggestionKey(item);
          const actionable = canApplySuggestion(item);
          return (
            <li key={key} className="flex items-start gap-2 rounded-lg px-1 py-1">
              {actionable ? (
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={Boolean(applyMap[key])}
                  onChange={(event) => onToggle(key, event.target.checked)}
                  aria-label={t('workspace.phase1DumpSuggestLine', {
                    key: item.externalKey,
                    field: fieldLabel(item, t),
                    excel: item.excelValue || '—',
                    suggested: suggestedText(item),
                  })}
                />
              ) : (
                <span className="mt-0.5 inline-block w-3.5" aria-hidden />
              )}
              <span className="min-w-0 text-muted-foreground">
                <span className="font-mono text-foreground">{item.externalKey}</span>
                {' · '}
                {item.basis === 'fs_predecessor'
                  ? t('workspace.scheduleWarnFsPredecessor')
                  : fieldLabel(item, t)}
                {item.basis === 'fs_predecessor' ? null : (
                  <>
                    {' · '}
                    {item.excelValue || '—'}
                    {' → '}
                    {suggestedText(item)}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function buildSuggestionDecisions(suggestions, applyMap) {
  return (Array.isArray(suggestions) ? suggestions : [])
    .filter((item) => item?.verdict === 'blank_suggest' || item?.verdict === 'revise')
    .map((item) => ({
      kind: item.kind,
      externalKey: item.externalKey,
      field: item.field,
      apply: canApplySuggestion(item) && Boolean(applyMap[suggestionKey(item)]),
    }));
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
  const [applyMap, setApplyMap] = useState({});

  const groups = useMemo(
    () => groupByKind(Array.isArray(preview?.preview) ? preview.preview : []),
    [preview]
  );
  const suggestions = useMemo(
    () => (Array.isArray(preview?.fieldSuggestions) ? preview.fieldSuggestions : []),
    [preview]
  );
  const keepRows = suggestions.filter((item) => item.verdict === 'keep');
  const applyRows = suggestions.filter((item) => item.verdict === 'blank_suggest');
  const reviseRows = suggestions.filter((item) => item.verdict === 'revise');

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

  useEffect(() => {
    if (!open) return;
    const next = {};
    for (const item of suggestions) {
      if (item.verdict !== 'blank_suggest' && item.verdict !== 'revise') continue;
      next[suggestionKey(item)] = item.verdict === 'blank_suggest';
    }
    setApplyMap(next);
  }, [open, suggestions]);

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t('workspace.phase1DumpPreviewModalTitle')}
      size="lg"
      fill
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {t('workspace.phase1DumpPreviewTitle', {
              count: createCount,
              skipped: skipCount,
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-1.5 text-xs"
              onClick={onClose}
              disabled={confirming}
            >
              {t('workspace.phase1DumpCancelPreview')}
            </button>
            <button
              type="button"
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              disabled={!canConfirm}
              onClick={() => onConfirm(buildSuggestionDecisions(suggestions, applyMap))}
            >
              {confirming
                ? t('common.loading')
                : t('workspace.phase1DumpConfirmImport')}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
        <p className="text-xs text-muted-foreground">
          {t('workspace.phase1DumpPreviewModalHint')}
        </p>

        {errors.length ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2">
            <p className="text-xs font-semibold text-destructive">
              {t('workspace.phase1DumpPreviewErrors', { count: errors.length })}
            </p>
            <ul className="mt-1.5 max-h-28 space-y-0.5 overflow-y-auto text-[11px] text-destructive/90">
              {errors.slice(0, 20).map((err, i) => (
                <li key={`err-${i}`}>
                  {[err.sheet, err.row, err.message || err.code || JSON.stringify(err)]
                    .filter(Boolean)
                    .join(' · ')}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <SuggestionGroup
          title={t('workspace.phase1DumpSuggestKeep')}
          items={keepRows}
          applyMap={applyMap}
          onToggle={(key, checked) => setApplyMap((prev) => ({ ...prev, [key]: checked }))}
          t={t}
        />
        <SuggestionGroup
          title={t('workspace.phase1DumpSuggestApply')}
          items={applyRows}
          applyMap={applyMap}
          onToggle={(key, checked) => setApplyMap((prev) => ({ ...prev, [key]: checked }))}
          t={t}
        />
        <SuggestionGroup
          title={t('workspace.phase1DumpSuggestRevise')}
          items={reviseRows}
          applyMap={applyMap}
          onToggle={(key, checked) => setApplyMap((prev) => ({ ...prev, [key]: checked }))}
          t={t}
        />

        {groups.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.map(({ kind, items }) => {
              const isOpen = expanded.has(kind);
              return (
                <section
                  key={kind}
                  className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-3 py-2 text-left hover:bg-muted/35"
                    onClick={() => toggleKind(kind)}
                    aria-expanded={isOpen}
                  >
                    <span className="flex items-center gap-2">
                      <span className={kindChipClass(kind)}>{kind}</span>
                      <span className="text-xs font-medium text-foreground">
                        {t('workspace.phase1DumpPreviewGroupCount', {
                          kind,
                          count: items.length,
                        })}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground" aria-hidden>
                      {isOpen ? '▾' : '▸'}
                    </span>
                  </button>
                  {isOpen ? (
                    <ul className="max-h-56 space-y-1.5 overflow-y-auto p-2.5">
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
          <section className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5">
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">
              {t('workspace.phase1DumpPreviewSkippedTitle', { count: skippedItems.length })}
            </p>
            <ul className="mt-1.5 max-h-24 space-y-0.5 overflow-y-auto text-[11px] text-muted-foreground">
              {skippedItems.slice(0, 40).map((s) => (
                <li key={`skip-${s.kind}:${s.externalKey}`}>
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
