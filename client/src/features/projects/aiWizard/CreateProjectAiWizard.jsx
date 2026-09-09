import { ArrowLeft } from 'lucide-react';
import { useAppStrings } from '../../../locales/appStrings';
import { wizardUi } from '../wizard/projectWizardUi';
import AiAnalysisBlueprintWizard from '../../requirements/AiAnalysisBlueprintWizard';
import { useAiAnalysisBlueprintWizard } from '../../requirements/useAiAnalysisBlueprintWizard';
import { areAllAnalysisJobsConfirmed } from '../../requirements/aiAnalysisWizardConstants';
import { isProjectDateRangeInvalid } from '../hub/projectHubUtils';
import useCreateProjectAiWizard from './useCreateProjectAiWizard';
import AiWizardStepSource from './AiWizardStepSource';
import AiWizardStepConfirm from './AiWizardStepConfirm';

/**
 * Full-screen AI Create Project Wizard — Source → AI Analysis → Confirm (full-width, no side pane).
 */
export default function CreateProjectAiWizard({
  organizationId,
  onCreated,
  onCancel,
  backLabel = '',
}) {
  const { t } = useAppStrings();
  const wizard = useCreateProjectAiWizard({ organizationId, onCreated });
  const analysisEnabled =
    Boolean(wizard.packId) && (wizard.stepId === 'analysis' || wizard.stepId === 'confirm');
  const analysis = useAiAnalysisBlueprintWizard({
    organizationId,
    packId: wizard.packId,
    enabled: analysisEnabled,
  });

  const isLast = wizard.step >= wizard.steps.length - 1;
  const stepNum = wizard.step + 1;
  const allAnalysisConfirmed = areAllAnalysisJobsConfirmed(analysis.summary?.jobs);
  const analysisBlocksNext =
    wizard.stepId === 'analysis' && (!allAnalysisConfirmed || analysis.busy || !analysis.summary);
  const anyBusy = wizard.busy || analysis.busy;
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

      <div className="flex min-h-0 flex-1 flex-col">
        <div className={`${wizardUi.formPane} lg:border-r-0`}>
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
              {wizard.stepId === 'analysis' ? (
                <div className="mx-auto w-full max-w-[90rem]">
                  <AiAnalysisBlueprintWizard
                    organizationId={organizationId}
                    packId={wizard.packId}
                    controller={analysis}
                    onContinue={wizard.goNext}
                  />
                </div>
              ) : null}
              {wizard.stepId === 'confirm' ? (
                <div className="mx-auto w-full max-w-5xl">
                  <AiWizardStepConfirm
                    confirmForm={wizard.confirmForm}
                    patchConfirmForm={wizard.patchConfirmForm}
                    pack={wizard.pack}
                    t={t}
                  />
                </div>
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
                  disabled={anyBusy || analysisBlocksNext || sourceBlocksNext}
                >
                  {t('common.next') || 'Next'}
                </button>
              ) : (
                <button
                  type="button"
                  className={wizardUi.primaryBtn}
                  onClick={wizard.createProject}
                  disabled={
                    anyBusy ||
                    isProjectDateRangeInvalid(
                      wizard.confirmForm?.startDate,
                      wizard.confirmForm?.dueDate
                    )
                  }
                >
                  {wizard.busy
                    ? t('aiCreateWizard.createProjectImporting')
                    : t('aiCreateWizard.createCta')}
                </button>
              )}
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
