import { ArrowLeft } from 'lucide-react';
import AiPlanningRunningBanner from '../../requirements/AiPlanningRunningBanner';
import { useAppStrings } from '../../../locales/appStrings';
import { wizardUi } from '../wizard/projectWizardUi';
import useCreateProjectAiWizard from './useCreateProjectAiWizard';
import AiWizardStepSource from './AiWizardStepSource';
import AiWizardStepPlanning from './AiWizardStepPlanning';
import AiWizardStepReview from './AiWizardStepReview';
import AiWizardStepAssign from './AiWizardStepAssign';
import AiWizardStepConfirm from './AiWizardStepConfirm';

function AiWizardPreviewPane({ wizard, t }) {
  const { stepId, pack, overlay } = wizard;

  if (stepId === 'planning') {
    const score = pack?.planningReadiness?.score;
    const status = wizard.busy ? 'pending' : String(pack?.aiPlanning?.status || 'none');
    return (
      <div className="space-y-4">
        <p className={wizardUi.previewLabel}>{t('aiCreateWizard.previewPlanning')}</p>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <p className="text-3xl font-semibold text-foreground">
            {score != null ? `${score}%` : '—'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('requirements.planningScore', { score: score ?? '—' })}
          </p>
          <p className="mt-4 text-sm text-foreground">
            {t(`requirements.aiPlanningStatus.${status}`)}
          </p>
          {wizard.busy ? (
            <div className="mt-4">
              <AiPlanningRunningBanner t={t} />
            </div>
          ) : null}
          <p className={wizardUi.previewHint}>{t('aiCreateWizard.previewPlanningHint')}</p>
        </div>
      </div>
    );
  }

  if (stepId === 'review') {
    const roles = Array.isArray(overlay.roles) ? overlay.roles : [];
    const gaps = Array.isArray(overlay.gaps) ? overlay.gaps : [];
    return (
      <div className="space-y-4">
        <p className={wizardUi.previewLabel}>{t('aiCreateWizard.previewReview')}</p>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <ul className="space-y-2 text-sm text-foreground">
            {roles.map((r) => (
              <li key={r.roleKey}>
                {r.roleKey} ×{r.requiredCount}
              </li>
            ))}
          </ul>
          {roles.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('aiCreateWizard.noOverlayYet')}</p>
          ) : null}
          {gaps.length > 0 ? (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
              {t('requirements.aiPlanningGaps', { count: gaps.length })}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (stepId === 'assign') {
    const leaves = Array.isArray(overlay.leafAssignments) ? overlay.leafAssignments : [];
    const assigned = leaves.filter((row) => {
      const ext = String(row.externalId || '').trim();
      return ext && String(wizard.leafAssignMap?.[ext] || '').trim();
    }).length;
    return (
      <div className="space-y-4">
        <p className={wizardUi.previewLabel}>{t('aiCreateWizard.previewAssign')}</p>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <p className="text-3xl font-semibold text-foreground">
            {assigned}/{leaves.length}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('aiCreateWizard.assignProgress', { assigned, total: leaves.length })}
          </p>
          <p className={wizardUi.previewHint}>{t('aiCreateWizard.previewAssignHint')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className={wizardUi.previewLabel}>{t('aiCreateWizard.previewConfirm')}</p>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <p className="text-sm font-medium text-foreground">
          {wizard.confirmForm.title || '—'}
        </p>
        <p className="mt-2 text-sm text-muted-foreground line-clamp-4">
          {wizard.confirmForm.description || t('aiCreateWizard.noDescription')}
        </p>
        <p className="mt-4 text-xs text-muted-foreground">{t('aiCreateWizard.assignLaterHint')}</p>
      </div>
    </div>
  );
}

/**
 * Full-screen AI Create Project Wizard — Source → Planning → Review → Assign → Confirm.
 */
export default function CreateProjectAiWizard({
  organizationId,
  onCreated,
  onCancel,
  backLabel = '',
}) {
  const { t } = useAppStrings();
  const wizard = useCreateProjectAiWizard({ organizationId, onCreated });

  const isLast = wizard.step >= wizard.steps.length - 1;
  const stepNum = wizard.step + 1;
  const hidePreviewPane = wizard.stepId === 'source';
  const planningStatus = String(wizard.pack?.aiPlanning?.status || 'none');
  const planningBlocksNext =
    wizard.stepId === 'planning' &&
    (wizard.busy || planningStatus === 'pending' || planningStatus === 'none');
  const anyBusy = wizard.busy || wizard.enrichBusy;
  const sourceBlocksNext = wizard.stepId === 'source' && !wizard.packId;
  const headerBackLabel = backLabel || t('adminTasks.wizardBackToHub') || 'Back';

  const onHeaderBack = () => {
    if (wizard.step > 0) {
      wizard.goBack();
      return;
    }
    onCancel?.();
  };

  const slideClass =
    wizard.slideDir === 'forward'
      ? 'animate-[wizardSlideInRight_220ms_ease-out]'
      : 'animate-[wizardSlideInLeft_220ms_ease-out]';

  if (wizard.accessLoading) {
    return (
      <div className={wizardUi.emptyPage}>
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (!wizard.access?.canRunAiPlanning) {
    return (
      <div className={wizardUi.emptyPage}>
        <p className="text-sm text-muted-foreground">{t('aiCreateWizard.noAccess')}</p>
        {onCancel ? (
          <button type="button" className={wizardUi.link} onClick={onCancel}>
            {headerBackLabel}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={wizardUi.shell}>
      <style>{`
        @keyframes wizardSlideInRight {
          from { opacity: 0; transform: translateX(28px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes wizardSlideInLeft {
          from { opacity: 0; transform: translateX(-28px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <div
        className={
          hidePreviewPane
            ? 'flex min-h-0 flex-1 flex-col'
            : 'flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-2'
        }
      >
        <div className={hidePreviewPane ? `${wizardUi.formPane} lg:border-r-0` : wizardUi.formPane}>
          <header className="shrink-0 px-5 pt-5 sm:px-8 sm:pt-8">
            <button type="button" onClick={onHeaderBack} className={wizardUi.backLink}>
              <ArrowLeft className="h-4 w-4" />
              {wizard.step > 0 ? t('common.back') || 'Back' : headerBackLabel}
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
            <div key={`${wizard.step}-${wizard.slideDir}`} className={slideClass}>
              {wizard.stepId === 'source' ? (
                <AiWizardStepSource
                  approvedPacks={wizard.approvedPacks}
                  packsLoading={wizard.packsLoading}
                  packsError={wizard.packsError}
                  pack={wizard.pack}
                  busy={wizard.busy}
                  onSelectPack={wizard.selectApprovedPack}
                  onRetryPacks={wizard.loadApprovedPacks}
                  t={t}
                />
              ) : null}
              {wizard.stepId === 'planning' ? (
                <AiWizardStepPlanning
                  pack={wizard.pack}
                  busy={wizard.busy}
                  canRunAi={wizard.canRunAiOnPack}
                  canApproveStaffing={wizard.access?.canRunAiPlanning}
                  onRunAi={wizard.runAiPlanning}
                  onApproveStaffing={wizard.approveStaffing}
                  onDiscardStaffing={wizard.discardStaffing}
                  t={t}
                />
              ) : null}
              {wizard.stepId === 'review' ? (
                <AiWizardStepReview
                  pack={wizard.pack}
                  busy={wizard.busy || wizard.enrichBusy}
                  enrichBusy={wizard.enrichBusy}
                  canApproveStaffing={wizard.access?.canRunAiPlanning}
                  canRunEnrich={wizard.access?.canRunAiPlanning}
                  onApproveStaffing={wizard.approveStaffing}
                  onDiscardStaffing={wizard.discardStaffing}
                  onRunEnrich={wizard.runEnrich}
                  t={t}
                />
              ) : null}
              {wizard.stepId === 'assign' ? (
                <AiWizardStepAssign
                  overlay={wizard.overlay}
                  leafAssignMap={wizard.leafAssignMap}
                  roleFilter={wizard.assignRoleFilter}
                  onRoleFilterChange={wizard.setAssignRoleFilter}
                  onAssignChange={wizard.patchLeafAssign}
                  onApplyAiSuggestions={wizard.applyAiLeafSuggestions}
                  busy={wizard.busy}
                  t={t}
                />
              ) : null}
              {wizard.stepId === 'confirm' ? (
                <AiWizardStepConfirm
                  confirmForm={wizard.confirmForm}
                  patchConfirmForm={wizard.patchConfirmForm}
                  pack={wizard.pack}
                  t={t}
                />
              ) : null}
            </div>
          </div>

          <footer className={wizardUi.footer}>
            <p className={wizardUi.stepMeta}>
              {t('aiCreateWizard.stepOf', { n: stepNum, total: wizard.steps.length })}
            </p>
            <div className="flex gap-2">
              {wizard.step > 0 ? (
                <button
                  type="button"
                  className={wizardUi.secondaryBtn}
                  onClick={wizard.goBack}
                  disabled={anyBusy}
                >
                  {t('common.back') || 'Back'}
                </button>
              ) : onCancel ? (
                <button
                  type="button"
                  className={wizardUi.secondaryBtn}
                  onClick={onCancel}
                  disabled={anyBusy}
                >
                  {t('common.cancel')}
                </button>
              ) : null}
              {!isLast ? (
                <button
                  type="button"
                  className={wizardUi.primaryBtn}
                  onClick={wizard.goNext}
                  disabled={anyBusy || planningBlocksNext || sourceBlocksNext}
                >
                  {t('common.next') || 'Next'}
                </button>
              ) : (
                <button
                  type="button"
                  className={wizardUi.primaryBtn}
                  onClick={wizard.createProject}
                  disabled={anyBusy}
                >
                  {wizard.busy ? t('aiCreateWizard.createProjectImporting') : t('aiCreateWizard.createCta')}
                </button>
              )}
            </div>
          </footer>
        </div>

        {hidePreviewPane ? null : (
          <div className={wizardUi.previewPane}>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(56,189,248,0.08),transparent_50%)] dark:bg-[radial-gradient(ellipse_at_top_right,rgba(56,189,248,0.12),transparent_50%)]" />
            <div className="relative min-h-0 flex-1 overflow-y-auto">
              <AiWizardPreviewPane wizard={wizard} t={t} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
