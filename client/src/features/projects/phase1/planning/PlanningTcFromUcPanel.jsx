/**
 * Planning — suggest & create Test Cases from approved Use Cases (DEC P1-I).
 * Catalog stored as TestCase (Phase 3 QA reuses via listTestCases).
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FlaskConical } from 'lucide-react';
import { projectAPI } from '../../../../services/api/projectAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

export default function PlanningTcFromUcPanel({ projectId, readOnly = false }) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const filterUcKey = String(searchParams.get('sourceUcKey') || '').trim();
  const [selected, setSelected] = useState(() => new Set());

  const { data: suggestPayload, isLoading, refetch } = useQuery({
    queryKey: ['testCaseSuggestFromUc', projectId],
    queryFn: async () => unwrap(await projectAPI.suggestTestCasesFromUc(projectId)),
    enabled: Boolean(projectId),
  });

  const suggestions = useMemo(() => {
    const all = Array.isArray(suggestPayload?.suggestions) ? suggestPayload.suggestions : [];
    if (!filterUcKey) return all;
    return all.filter(
      (s) =>
        String(s.sourceUcKey || s.externalKey || '')
          .trim()
          .toUpperCase() === filterUcKey.toUpperCase() ||
        String(s.sourceUcKey || '')
          .trim()
          .toUpperCase() === filterUcKey.toUpperCase()
    );
  }, [suggestPayload, filterUcKey]);

  const { data: existing = [] } = useQuery({
    queryKey: ['projectTestCases', projectId],
    queryFn: async () => {
      const raw = unwrap(await projectAPI.listTestCases(projectId));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const existingFiltered = useMemo(() => {
    if (!filterUcKey) return existing;
    return existing.filter(
      (row) =>
        String(row.sourceUcKey || '')
          .trim()
          .toUpperCase() === filterUcKey.toUpperCase()
    );
  }, [existing, filterUcKey]);

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
      queryClient.invalidateQueries({ queryKey: ['projectTestCases', projectId] });
      queryClient.invalidateQueries({ queryKey: ['testCaseSuggestFromUc', projectId] });
      refetch();
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const selectedItems = suggestions.filter((s) => selected.has(s.externalKey));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-base font-semibold">
            <FlaskConical size={16} />
            {t('workspace.phaseNavPlanningTestCases')}
          </h1>
          <p className="text-xs text-muted-foreground">{t('workspace.phase1TcFromUcHint')}</p>
          {filterUcKey ? (
            <p className="mt-1 text-[11px] font-medium text-foreground">
              {t('workspace.phase1TcFilterByUc', { key: filterUcKey })} ·{' '}
              {t('workspace.phase1TcCatalogCount', { count: existingFiltered.length })}
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {suggestPayload?.message || ''} ·{' '}
              {t('workspace.phase1TcCatalogCount', { count: existing.length })}
            </p>
          )}
        </div>
        {!readOnly ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded border border-border px-2 py-1 text-xs"
              onClick={selectAll}
              disabled={!suggestions.length}
            >
              {t('workspace.phase1TcSelectAll')}
            </button>
            <button
              type="button"
              className="rounded bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
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

      {!isLoading && !suggestions.length ? (
        <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
          {t('workspace.phase1TcFromUcEmpty')}
        </p>
      ) : null}

      <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
        {suggestions.map((s) => {
          const key = s.externalKey;
          const checked = selected.has(key);
          return (
            <li key={key} className="flex flex-wrap items-start gap-2 px-3 py-2 text-sm">
              {!readOnly ? (
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked}
                  onChange={() => toggle(key)}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{s.title}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{key}</p>
                {s.acceptanceCriteria || s.mainFlow ? (
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                    {s.acceptanceCriteria || s.mainFlow}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
