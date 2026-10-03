/**
 * Planning — suggest & create Test Cases from approved Use Cases (DEC P1-I).
 * Catalog stored as TestCase (Phase 3 QA reuses via listTestCases).
 * One card per use case; steps open in a dialog.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FlaskConical } from 'lucide-react';
import Modal from '../../../../components/Shared/Modal';
import { projectAPI } from '../../../../services/api/projectAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function ucKeyOf(row) {
  return String(row?.sourceUcKey || row?.externalKey || '')
    .trim()
    .toUpperCase();
}

function matchesFilter(row, filterUcKey) {
  if (!filterUcKey) return true;
  return ucKeyOf(row) === filterUcKey.toUpperCase();
}

export default function PlanningTcFromUcPanel({ projectId, readOnly = false }) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const filterUcKey = String(searchParams.get('sourceUcKey') || '').trim();
  const [selected, setSelected] = useState(() => new Set());
  const [openUc, setOpenUc] = useState(null);

  const { data: suggestPayload, isLoading, isError, refetch } = useQuery({
    queryKey: ['testCaseSuggestFromUc', projectId],
    queryFn: async () => unwrap(await projectAPI.suggestTestCasesFromUc(projectId)),
    enabled: Boolean(projectId),
  });

  const suggestions = useMemo(() => {
    const all = Array.isArray(suggestPayload?.suggestions) ? suggestPayload.suggestions : [];
    return all.filter((s) => matchesFilter(s, filterUcKey));
  }, [suggestPayload, filterUcKey]);

  const { data: existing = [] } = useQuery({
    queryKey: ['projectTestCases', projectId],
    queryFn: async () => {
      const raw = unwrap(await projectAPI.listTestCases(projectId));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const existingFiltered = useMemo(
    () => existing.filter((row) => matchesFilter(row, filterUcKey)),
    [existing, filterUcKey]
  );

  const catalogByUc = useMemo(() => {
    const map = new Map();
    for (const row of existingFiltered) {
      const key = ucKeyOf(row) || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return [...map.entries()];
  }, [existingFiltered]);

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(suggestions.map((s) => s.externalKey).filter(Boolean)));
  };

  const createMut = useMutation({
    mutationFn: (items) => projectAPI.createTestCasesFromSuggestions(projectId, items),
    onSuccess: (res) => {
      const data = unwrap(res);
      toast.success(
        t('workspace.phase1TcFromUcCreated', {
          created: data?.created ?? 0,
          skipped: Array.isArray(data?.skipped) ? data.skipped.length : 0,
        })
      );
      setSelected(new Set());
      setOpenUc(null);
      queryClient.invalidateQueries({ queryKey: ['projectTestCases', projectId] });
      queryClient.invalidateQueries({ queryKey: ['testCaseSuggestFromUc', projectId] });
      refetch();
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const selectedItems = suggestions.filter((s) => selected.has(s.externalKey));
  const openSuggestion = suggestions.find((s) => ucKeyOf(s) === openUc) || null;
  const openCatalog = catalogByUc.find(([key]) => key === openUc)?.[1] || null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-base font-semibold">
            <FlaskConical size={16} />
            {t('workspace.phaseNavPlanningTestCases')}
          </h1>
          <p className="text-xs text-muted-foreground">{t('workspace.phase1TcFromUcHint')}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {filterUcKey
              ? t('workspace.phase1TcFilterByUc', { key: filterUcKey })
              : suggestPayload?.message || ''}
            {' · '}
            {t('workspace.phase1TcCatalogCount', { count: existingFiltered.length })}
          </p>
        </div>
        {!readOnly ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-border px-2.5 py-1 text-xs"
              onClick={selectAll}
              disabled={!suggestions.length}
            >
              {t('workspace.phase1TcSelectAll')}
            </button>
            <button
              type="button"
              className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              disabled={!selectedItems.length || createMut.isPending}
              onClick={() => createMut.mutate(selectedItems)}
            >
              {createMut.isPending
                ? t('common.loading')
                : t('workspace.phase1TcCreateSelected', { count: selectedItems.length })}
            </button>
          </div>
        ) : null}
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}
      {isError ? (
        <button type="button" className="text-sm text-destructive" onClick={() => refetch()}>
          {t('common.retry')}
        </button>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('workspace.phase1TcSuggestSection')}
        </h2>
        {!isLoading && !suggestions.length ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/15 px-3 py-6 text-center text-sm text-muted-foreground">
            {t('workspace.phase1TcFromUcEmpty')}
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {suggestions.map((s) => {
              const key = s.externalKey;
              const checked = selected.has(key);
              return (
                <li key={key}>
                  <article className="flex h-full flex-col gap-2 rounded-xl border border-border bg-surface p-3">
                    <div className="flex items-start gap-2">
                      {!readOnly ? (
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          aria-label={s.title || key}
                          onChange={() => toggle(key)}
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[11px] text-muted-foreground">{ucKeyOf(s)}</p>
                        <p className="line-clamp-2 text-sm font-medium text-foreground">{s.title}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="mt-auto self-start rounded-lg border border-border px-2 py-1 text-[11px] text-foreground hover:bg-muted/40"
                      onClick={() => setOpenUc(ucKeyOf(s))}
                    >
                      {t('workspace.phase1TcViewSteps')}
                    </button>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('workspace.phase1TcCatalogSection')}
        </h2>
        {!catalogByUc.length ? (
          <p className="text-xs text-muted-foreground">{t('workspace.phase1EmptySection')}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {catalogByUc.map(([key, rows]) => (
              <li key={key}>
                <button
                  type="button"
                  className="flex h-full w-full flex-col gap-1 rounded-xl border border-border bg-surface p-3 text-left hover:bg-muted/30"
                  onClick={() => setOpenUc(key)}
                >
                  <p className="font-mono text-[11px] text-muted-foreground">{key}</p>
                  <p className="line-clamp-2 text-sm font-medium text-foreground">
                    {rows[0]?.title || key}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {t('workspace.phase1TcCatalogCount', { count: rows.length })}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        isOpen={Boolean(openUc)}
        onClose={() => setOpenUc(null)}
        title={openUc || ''}
        size="lg"
      >
        {openSuggestion ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">{openSuggestion.title}</p>
            <div className="rounded-xl border border-border bg-muted/15 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('workspace.phase1TcViewSteps')}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                {openSuggestion.acceptanceCriteria ||
                  openSuggestion.mainFlow ||
                  openSuggestion.summary ||
                  '—'}
              </p>
            </div>
            {!readOnly ? (
              <button
                type="button"
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                onClick={() => toggle(openSuggestion.externalKey)}
              >
                {selected.has(openSuggestion.externalKey)
                  ? t('workspace.phase1TcSelected')
                  : t('workspace.phase1TcSelect')}
              </button>
            ) : null}
          </div>
        ) : null}
        {openCatalog ? (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {openCatalog.map((row) => (
              <li key={row.id || row._id || row.externalKey} className="px-3 py-2">
                <p className="text-sm font-medium text-foreground">{row.title || '—'}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{row.externalKey}</p>
                {row.summary ? (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{row.summary}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Modal>
    </div>
  );
}
