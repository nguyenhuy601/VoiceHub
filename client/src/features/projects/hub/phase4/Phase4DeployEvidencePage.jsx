import { ExternalLink } from 'lucide-react';
import { useAppStrings } from '../../../../locales/appStrings';
import usePhase4Handover from './usePhase4Handover';
import Phase4SectionCard from './Phase4SectionCard';

/**
 * Phase 4 Deploy evidence — Ops outside app; HITL URL + verify tick. No Deploy button.
 */
export default function Phase4DeployEvidencePage({ projectId }) {
  const { t } = useAppStrings();
  const {
    isLoading,
    checklist,
    evidence,
    draft,
    setEvidenceDraft,
    canPhase,
    uatPassed,
    busy,
    saveEvidence,
    setChecklistItem,
    releaseLabel,
  } = usePhase4Handover(projectId);

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">{t('common.loading')}</p>;
  }

  const verified = Boolean(checklist.deployment_verified);
  const updateDraft = (patch) =>
    setEvidenceDraft((prev) => ({ ...(prev || evidence), ...patch }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-3 sm:p-4">
      <Phase4SectionCard
        title={t('workspace.phaseDeployOutsideTitle')}
        description={t('workspace.phaseDeployOutsideBody')}
        aside={
          releaseLabel ? (
            <span className="rounded-md border border-border/60 px-2 py-0.5 text-[10px] font-semibold tabular-nums">
              {releaseLabel}
            </span>
          ) : null
        }
      >
        {!uatPassed ? (
          <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-200">
            {t('workspace.phaseDeployWaitUat')}
          </p>
        ) : (
          <ol className="list-inside list-decimal space-y-0.5 text-[11px] text-muted-foreground">
            <li>{t('workspace.phaseDeployStep1')}</li>
            <li>{t('workspace.phaseDeployStep2')}</li>
            <li>{t('workspace.phaseDeployStep3')}</li>
          </ol>
        )}
        <p className="mt-2 text-[11px] font-medium text-muted-foreground">
          {t('workspace.phase4NoDeployHint')}
        </p>
      </Phase4SectionCard>

      <Phase4SectionCard
        title={t('workspace.phaseNavDeployEvidence')}
        description={t('workspace.phaseDeployVerifyHint')}
      >
        {!uatPassed || !canPhase ? (
          <p className="text-[11px] text-muted-foreground">
            {!uatPassed
              ? t('workspace.phaseDeployWaitUat')
              : t('workspace.phaseHandoverChecklistPmOnly')}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[11px]">
              <span className="font-semibold text-foreground">
                {t('workspace.phaseDeployEvidenceEnv')}
              </span>
              <select
                className="rounded-md border border-border/70 bg-background px-2 py-1.5 text-xs text-foreground shadow-sm outline-none focus:border-primary"
                value={draft.env || 'production'}
                disabled={busy}
                onChange={(e) => updateDraft({ env: e.target.value })}
              >
                <option value="production">production</option>
                <option value="staging">staging</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] sm:col-span-2">
              <span className="font-semibold text-foreground">
                {t('workspace.phaseDeployEvidenceUrl')}
              </span>
              <input
                type="url"
                className="rounded-md border border-border/70 bg-background px-2 py-1.5 text-xs text-foreground shadow-sm outline-none focus:border-primary"
                placeholder="https://…"
                value={draft.pipelineUrl}
                disabled={busy}
                onChange={(e) => updateDraft({ pipelineUrl: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] sm:col-span-2">
              <span className="font-semibold text-foreground">
                {t('workspace.phaseDeployEvidenceNotes')}
              </span>
              <textarea
                rows={3}
                className="rounded-md border border-border/70 bg-background px-2 py-1.5 text-xs text-foreground shadow-sm outline-none focus:border-primary"
                placeholder={t('workspace.phaseDeployEvidenceNotesPh')}
                value={draft.notes}
                disabled={busy}
                onChange={(e) => updateDraft({ notes: e.target.value })}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveEvidence()}
                className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-50 dark:text-amber-100"
              >
                {busy ? t('common.loading') : t('workspace.phaseDeployEvidenceSave')}
              </button>
              {evidence.at && evidence.pipelineUrl ? (
                <a
                  href={evidence.pipelineUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary hover:underline"
                >
                  {t('workspace.phaseDeployEvidenceSavedAt')}
                  <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                </a>
              ) : null}
            </div>
          </div>
        )}

        <div className="mt-3 border-t border-border/60 pt-3">
          <label
            className={`flex items-start gap-2 rounded-xl border px-2.5 py-2.5 text-sm ${
              verified
                ? 'border-emerald-500/40 bg-emerald-500/10'
                : 'border-border/70 bg-muted/15'
            }`}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={verified}
              disabled={!canPhase || busy || !uatPassed}
              onChange={(e) => void setChecklistItem('deployment_verified', e.target.checked)}
            />
            <span>
              <span className="font-semibold text-foreground">
                {t('workspace.phaseQaChecklist_deployment_verified')}
              </span>
              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                {t('workspace.phaseDeployVerifyNeedUrl')}
              </span>
            </span>
          </label>
        </div>
      </Phase4SectionCard>
    </div>
  );
}
