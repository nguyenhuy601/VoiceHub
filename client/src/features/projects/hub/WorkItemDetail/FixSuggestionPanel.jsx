import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { projectAPI } from '../../../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import { FIGMA_ORG_TASK_MODAL_INPUT } from '../../../../components/Organization/figmaOrganizationClasses';
import { useWorkItemDetail } from './WorkItemDetailContext';

function normalizeFixSuggestion(raw) {
  if (!raw || typeof raw !== 'object') {
    return { status: 'none', text: '' };
  }
  const status = String(raw.status || 'none').toLowerCase();
  return {
    status: ['none', 'pending', 'accepted', 'rejected'].includes(status) ? status : 'none',
    text: String(raw.text || '').trim(),
  };
}

function statusBadgeClass(status) {
  if (status === 'pending') return 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200';
  if (status === 'accepted') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200';
  if (status === 'rejected') return 'border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200';
  return 'border-border bg-muted text-muted-foreground';
}

/**
 * Bug-only: đề xuất / chấp nhận / từ chối bản sửa (API fix-suggestion).
 */
export default function FixSuggestionPanel() {
  const {
    workItem,
    issueId,
    projectId,
    isPlanning,
    t,
    canUpdateTask,
    patchLocalWorkItem,
    onRefresh,
  } = useWorkItemDetail();

  const issueType = String(workItem?.issueType || workItem?.type || '').toLowerCase();
  const isBug = issueType === 'bug';
  const suggestion = normalizeFixSuggestion(workItem?.fixSuggestion);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const applyTaskPatch = useCallback(
    (task) => {
      if (!task || typeof task !== 'object') return;
      const next = {
        fixSuggestion: task.fixSuggestion || { status: 'none', text: '' },
        ...(task.retestStatus != null ? { retestStatus: task.retestStatus } : {}),
      };
      patchLocalWorkItem?.(next);
    },
    [patchLocalWorkItem]
  );

  const propose = useCallback(async () => {
    const text = String(draft || '').trim();
    if (!text || !projectId || !issueId) return;
    setBusy(true);
    try {
      const res = await projectAPI.proposeFixSuggestion(projectId, issueId, { text });
      const task = res?.data?.data ?? res?.data ?? res;
      applyTaskPatch(task);
      setDraft('');
      toast.success(t('workspace.phaseQaFixSuggestProposed'));
      if (typeof onRefresh === 'function') await onRefresh();
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('workspace.phaseQaFixSuggestProposeFail') })
      );
    } finally {
      setBusy(false);
    }
  }, [draft, projectId, issueId, applyTaskPatch, onRefresh, t]);

  const decide = useCallback(
    async (decision) => {
      if (!projectId || !issueId) return;
      setBusy(true);
      try {
        const res = await projectAPI.decideFixSuggestion(projectId, issueId, { decision });
        const task = res?.data?.data ?? res?.data ?? res;
        applyTaskPatch(task);
        toast.success(
          decision === 'accept'
            ? t('workspace.phaseQaFixSuggestAccepted')
            : t('workspace.phaseQaFixSuggestRejected')
        );
        if (typeof onRefresh === 'function') await onRefresh();
      } catch (error) {
        toast.error(
          resolveApiErrorMessage(error, { t, fallback: t('workspace.phaseQaFixSuggestDecideFail') })
        );
      } finally {
        setBusy(false);
      }
    },
    [projectId, issueId, applyTaskPatch, onRefresh, t]
  );

  if (isPlanning || !isBug || !issueId) return null;

  const canEdit = Boolean(canUpdateTask);
  const showPropose =
    canEdit && (suggestion.status === 'none' || suggestion.status === 'rejected');
  const showDecide = canEdit && suggestion.status === 'pending';

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('workspace.phaseQaFixSuggestTitle')}
        </p>
        {suggestion.status !== 'none' ? (
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(
              suggestion.status
            )}`}
          >
            {t(`workspace.phaseQaFixSuggestStatus_${suggestion.status}`)}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{t('workspace.phaseQaFixSuggestHint')}</p>

      {suggestion.text ? (
        <div className="mt-2 whitespace-pre-wrap rounded-md border border-border bg-background px-2.5 py-2 text-xs text-foreground">
          {suggestion.text}
        </div>
      ) : null}

      {showPropose ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={draft}
            disabled={busy}
            rows={3}
            maxLength={4000}
            placeholder={t('workspace.phaseQaFixSuggestPh')}
            className={`${FIGMA_ORG_TASK_MODAL_INPUT} min-h-[4.5rem] resize-y py-1.5 text-xs`}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            type="button"
            disabled={busy || !String(draft || '').trim()}
            onClick={() => void propose()}
            className="rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/15 disabled:opacity-50"
          >
            {busy ? t('common.loading') : t('workspace.phaseQaFixSuggestPropose')}
          </button>
        </div>
      ) : null}

      {showDecide ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide('accept')}
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-500/15 disabled:opacity-50 dark:text-emerald-200"
          >
            {t('workspace.phaseQaFixSuggestAccept')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide('reject')}
            className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-rose-800 hover:bg-rose-500/15 disabled:opacity-50 dark:text-rose-200"
          >
            {t('workspace.phaseQaFixSuggestReject')}
          </button>
        </div>
      ) : null}

      {!canEdit ? (
        <p className="mt-2 text-[11px] text-muted-foreground">{t('workspace.phaseQaFixSuggestReadOnly')}</p>
      ) : null}
    </div>
  );
}
