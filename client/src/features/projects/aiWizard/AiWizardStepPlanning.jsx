import { Sparkles } from 'lucide-react';
import { wizardUi } from '../wizard/projectWizardUi';

/**
 * Step 2 — run AI planning on selected pack.
 */
export default function AiWizardStepPlanning({
  pack,
  busy,
  canRunAi,
  onRunAi,
  t,
}) {
  const planning = pack?.aiPlanning || {};
  const status = String(planning.status || 'none');
  const overlay = planning.overlay || {};
  const llm = overlay.llm || {};
  const statusLabel =
    t(`requirements.aiPlanningStatus.${status}`) || status;

  return (
    <div className="space-y-6">
      <div>
        <h1 className={wizardUi.title}>{t('aiCreateWizard.planningTitle')}</h1>
        <p className={wizardUi.subtitle}>{t('aiCreateWizard.planningSubtitle')}</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium text-foreground">
          {pack?.overview?.requirementName || pack?.sourceFileName || '—'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {statusLabel}
          {overlay.engine ? ` · ${overlay.engine}` : ''}
          {llm.model ? ` · ${llm.model}` : ''}
        </p>
        {llm.staffingStatus ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t('requirements.aiLlmStaffingStatus', { status: llm.staffingStatus })}
          </p>
        ) : null}
        {status === 'failed' ? (
          <p className="mt-2 text-sm text-destructive">
            {overlay.message || t('requirements.aiPlanningFail')}
          </p>
        ) : null}
        {!canRunAi ? (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
            {t('aiCreateWizard.packNotReadyForAi')}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        className={`${wizardUi.primaryBtn} inline-flex items-center gap-2`}
        disabled={busy || !canRunAi}
        onClick={onRunAi}
      >
        <Sparkles className="h-4 w-4" />
        {status === 'ready' || status === 'failed'
          ? t('aiCreateWizard.rerunAi')
          : t('requirements.aiPlanningRun')}
      </button>
      <p className="text-xs text-muted-foreground">{t('requirements.aiPlanningRerunHint')}</p>
    </div>
  );
}
