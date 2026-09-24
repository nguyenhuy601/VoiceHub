/**
 * P2 HITL — suggest Task cards from published WBS (and UC gap).
 * Confirm creates board cards under Epic; Cancel does nothing.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ListTodo } from 'lucide-react';
import Modal from '../../../../components/Shared/Modal';
import { planningAPI } from '../../../../services/api/planningAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

const VIEW_WBS = 'from_wbs';
const VIEW_UC = 'from_uc_gap';

export default function PlanningSuggestTasksModal({ projectId, open, onClose }) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const [view, setView] = useState(VIEW_WBS);
  const [selected, setSelected] = useState(() => new Set());

  const { data: suggestPayload, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['planningSuggestWorkItems', projectId, view],
    queryFn: async () =>
      unwrap(
        await planningAPI.suggest(projectId, {
          kind: 'WORK_ITEM',
          view,
        })
      ),
    enabled: Boolean(projectId && open),
  });

  const suggestions = useMemo(
    () => (Array.isArray(suggestPayload?.suggestions) ? suggestPayload.suggestions : []),
    [suggestPayload]
  );

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(suggestions.map((s) => s.key).filter(Boolean)));
  }, [open, view, suggestions]);

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(suggestions.map((s) => s.key).filter(Boolean)));
  };

  const confirmMut = useMutation({
    mutationFn: (items) =>
      planningAPI.confirmSuggestions(projectId, {
        kind: 'WORK_ITEM',
        view,
        suggestions: items,
      }),
    onSuccess: (res) => {
      const data = unwrap(res);
      toast.success(
        t('workspace.phase1SuggestTasksCreated', {
          created: data?.created ?? 0,
          skipped: Array.isArray(data?.skipped) ? data.skipped.length : 0,
        })
      );
      queryClient.invalidateQueries({ queryKey: ['planningSuggestWorkItems', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectBoard'] });
      queryClient.invalidateQueries({ queryKey: ['projectTasks'] });
      refetch();
      onClose?.();
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const selectedItems = suggestions.filter((s) => selected.has(s.key));

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <ListTodo size={16} />
          {t('workspace.phase1SuggestTasksTitle')}
        </span>
      }
      size="lg"
    >
      <div className="flex max-h-[70vh] flex-col gap-3">
        <p className="text-xs text-muted-foreground">{t('workspace.phase1SuggestTasksHint')}</p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded border px-2 py-1 text-xs ${
              view === VIEW_WBS ? 'border-primary bg-primary/10 font-semibold' : 'border-border'
            }`}
            onClick={() => setView(VIEW_WBS)}
          >
            {t('workspace.phase1SuggestTasksViewWbs')}
          </button>
          <button
            type="button"
            className={`rounded border px-2 py-1 text-xs ${
              view === VIEW_UC ? 'border-primary bg-primary/10 font-semibold' : 'border-border'
            }`}
            onClick={() => setView(VIEW_UC)}
          >
            {t('workspace.phase1SuggestTasksViewUc')}
          </button>
          <button
            type="button"
            className="ml-auto rounded border border-border px-2 py-1 text-xs"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {t('common.refresh')}
          </button>
        </div>

        <p className="text-[11px] text-muted-foreground">{suggestPayload?.message || ''}</p>

        {isLoading ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}

        {!isLoading && !suggestions.length ? (
          <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
            {t('workspace.phase1SuggestTasksEmpty')}
          </p>
        ) : null}

        <ul className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border/60">
          {suggestions.map((s) => {
            const key = s.key;
            const checked = selected.has(key);
            return (
              <li key={key} className="flex flex-wrap items-start gap-2 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked}
                  onChange={() => toggle(key)}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.title}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {s.sourceFrKey || s.sourceUcKey || s.sourceWbsArtifactId || key}
                    {s.epicTitle ? ` · ${s.epicTitle}` : ''}
                  </p>
                  {s.reason === 'unscoped_epic' ? (
                    <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                      {t('workspace.phase1SuggestTasksUnscopedEpic')}
                    </p>
                  ) : null}
                  {s.summary ? (
                    <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{s.summary}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-2">
          <button
            type="button"
            className="rounded border border-border px-2 py-1 text-xs"
            onClick={selectAll}
            disabled={!suggestions.length}
          >
            {t('workspace.phase1TcSelectAll')}
          </button>
          <button type="button" className="rounded border border-border px-2 py-1 text-xs" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="rounded bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            disabled={!selectedItems.length || confirmMut.isPending}
            onClick={() => confirmMut.mutate(selectedItems)}
          >
            {confirmMut.isPending
              ? t('common.loading')
              : t('workspace.phase1SuggestTasksConfirm', { count: selectedItems.length })}
          </button>
        </div>
      </div>
    </Modal>
  );
}
