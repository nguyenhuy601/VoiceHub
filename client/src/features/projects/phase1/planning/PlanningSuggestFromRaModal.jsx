/**
 * Suggest PlanningArtifact drafts from RA (WBS/…); confirm creates drafts — HITL.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Sparkles } from 'lucide-react';
import Modal from '../../../../components/Shared/Modal';
import { planningAPI } from '../../../../services/api/planningAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import { kindChipClass } from '../shared/phase1UiTokens';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function suggestionKey(s, index) {
  return String(s?.externalKey || s?.key || `idx-${index}`);
}

export default function PlanningSuggestFromRaModal({
  projectId,
  kind,
  open,
  onClose,
  canEdit = false,
}) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(() => new Set());

  const {
    data: suggestPayload,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['planningSuggestFromRa', projectId, kind],
    queryFn: async () => unwrap(await planningAPI.suggest(projectId, { kind })),
    enabled: Boolean(projectId && kind && open),
  });

  const suggestions = useMemo(
    () => (Array.isArray(suggestPayload?.suggestions) ? suggestPayload.suggestions : []),
    [suggestPayload]
  );

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(suggestions.map((s, i) => suggestionKey(s, i))));
  }, [open, suggestions]);

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(suggestions.map((s, i) => suggestionKey(s, i))));
  };

  const clearAll = () => setSelected(new Set());

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['planningArtifacts', projectId, kind] });
    queryClient.invalidateQueries({ queryKey: ['planningArtifacts', projectId] });
    queryClient.invalidateQueries({ queryKey: ['planningSummary', projectId] });
    queryClient.invalidateQueries({ queryKey: ['projectAnalysisGaps', String(projectId)] });
    queryClient.invalidateQueries({ queryKey: ['planningSuggestFromRa', projectId, kind] });
  };

  const confirmMut = useMutation({
    mutationFn: (items) => planningAPI.confirmSuggestions(projectId, { suggestions: items }),
    onSuccess: (res) => {
      const data = unwrap(res);
      invalidate();
      toast.success(
        t('workspace.phase1AiSuggestConfirmed', {
          count: data?.created ?? 0,
        })
      );
      onClose?.();
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const selectedItems = suggestions.filter((s, i) => selected.has(suggestionKey(s, i)));

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <Sparkles size={16} className="text-primary" aria-hidden />
          {t('workspace.phase1AiSuggestPanel', { count: suggestions.length })}
        </span>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="rounded border border-border px-2.5 py-1.5 text-xs"
              onClick={selectAll}
              disabled={!suggestions.length}
            >
              {t('workspace.phase1TcSelectAll')}
            </button>
            <button
              type="button"
              className="rounded border border-border px-2.5 py-1.5 text-xs"
              onClick={clearAll}
              disabled={!selected.size}
            >
              {t('workspace.phase1AiSuggestClearSelection')}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="rounded border border-border px-2.5 py-1.5 text-xs"
              onClick={onClose}
            >
              {t('common.cancel')}
            </button>
            {canEdit ? (
              <button
                type="button"
                className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                disabled={confirmMut.isPending || selectedItems.length === 0}
                onClick={() => confirmMut.mutate(selectedItems)}
              >
                {confirmMut.isPending
                  ? t('common.loading')
                  : t('workspace.phase1AiSuggestConfirmSelected')}
              </button>
            ) : null}
          </div>
        </div>
      }
    >
      <div className="flex max-h-[min(70vh,32rem)] flex-col gap-3">
        <p className="text-xs text-muted-foreground">{t('workspace.phase1AiSuggestModalHint')}</p>
        <p className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          {t('workspace.phase1AiSuggestWorkbookHint')}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <span className={kindChipClass(kind)}>{kind}</span>
          <button
            type="button"
            className="ml-auto rounded border border-border px-2 py-1 text-xs"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {t('common.refresh')}
          </button>
        </div>

        {isLoading ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}

        {isError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
            <p>{resolveApiErrorMessage(error) || t('common.error')}</p>
            <button
              type="button"
              className="mt-2 text-xs underline"
              onClick={() => refetch()}
            >
              {t('common.retry')}
            </button>
          </div>
        ) : null}

        {!isLoading && !isError && !suggestions.length ? (
          <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
            {suggestPayload?.message || t('workspace.phase1AiSuggestEmpty')}
          </p>
        ) : null}

        {suggestions.length ? (
          <ul className="min-h-0 flex-1 divide-y divide-border/50 overflow-y-auto rounded-xl border border-border/70 bg-surface">
            {suggestions.map((s, i) => {
              const key = suggestionKey(s, i);
              const checked = selected.has(key);
              return (
                <li key={key}>
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-muted/30">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={() => toggle(key)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className={kindChipClass(s.kind || kind)}>
                          {s.kind || kind}
                        </span>
                        <span className="font-mono text-[11px] text-primary">{s.externalKey}</span>
                      </span>
                      <span className="mt-0.5 block text-sm font-medium text-foreground">
                        {s.title || '—'}
                      </span>
                      {s.summary ? (
                        <span className="mt-0.5 block line-clamp-2 text-[11px] text-muted-foreground">
                          {s.summary}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </Modal>
  );
}
