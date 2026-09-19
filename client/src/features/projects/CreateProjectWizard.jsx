import { ArrowLeft } from 'lucide-react';
import ProjectWizardStepName from './wizard/ProjectWizardStepName';
import ProjectWizardStepTeam from './wizard/ProjectWizardStepTeam';
import ProjectWizardStepMode from './wizard/ProjectWizardStepMode';
import ProjectWizardStepInputs from './wizard/ProjectWizardStepInputs';
import ProjectWizardStepConfirm from './wizard/ProjectWizardStepConfirm';
import useCreateProjectWizard from './wizard/useCreateProjectWizard';
import { PROJECT_WIZARD_STEPS } from './wizard/projectWizardConstants';
import { wizardUi } from './wizard/projectWizardUi';
import { useAppStrings } from '../../locales/appStrings';
import { deliveryPhaseLabelKey } from '../../utils/projectPhaseNav';
import ProjectWizardRosterPreview from './wizard/ProjectWizardRosterPreview';

/**
 * Full-screen Project Create Wizard — Intake (import + identity + roster) → Mode (Phase 1).
 */
export default function CreateProjectWizard({
  organizationId,
  variant = 'collaborate',
  initialValues = null,
  resetKey = 0,
  onCreated,
  onCancel,
  scopeLabel = 'ORG',
  backLabel = '',
}) {
  const { t } = useAppStrings();
  const wizard = useCreateProjectWizard({
    organizationId,
    initialValues,
    resetKey,
    onCreated,
    scopeLabel,
  });

  const isLast = wizard.step >= PROJECT_WIZARD_STEPS.length - 1;
  const stepNum = wizard.step + 1;

  const headerBackLabel =
    backLabel ||
    (variant === 'admin'
      ? t('adminTasks.wizardBackToAdmin') || 'Back to projects'
      : t('adminTasks.wizardBackToHub') || 'Back to workspaces');

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

  const stepTitles = {
    intake: t('adminTasks.wizardIntakeTitle') || 'Import & project info',
    mode: t('adminTasks.wizardModeTitle') || 'Analysis Mode',
  };

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

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-2">
        <div className={wizardUi.formPane}>
          <header className="shrink-0 px-5 pt-5 sm:px-8 sm:pt-8">
            <button type="button" onClick={onHeaderBack} className={wizardUi.backLink}>
              <ArrowLeft className="h-4 w-4" />
              {wizard.step > 0 ? t('common.back') || 'Back' : headerBackLabel}
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
            <div key={`${wizard.step}-${wizard.slideDir}`} className={slideClass}>
              {wizard.stepId === 'intake' ? (
                <div className="space-y-8">
                  <ProjectWizardStepInputs
                    form={wizard.form}
                    patchForm={wizard.patchForm}
                    onRequirementSelected={wizard.applyRequirementFile}
                    intakeBusy={wizard.intakeBusy}
                    t={t}
                  />
                  <ProjectWizardStepName form={wizard.form} patchForm={wizard.patchForm} t={t} />
                  <ProjectWizardStepTeam
                    orgId={organizationId}
                    form={wizard.form}
                    setIntakeSlot={wizard.setIntakeSlot}
                    t={t}
                  />
                </div>
              ) : null}
              {wizard.stepId === 'mode' ? (
                <ProjectWizardStepMode form={wizard.form} patchForm={wizard.patchForm} t={t} />
              ) : null}
            </div>
          </div>

          <footer className={wizardUi.footer}>
            <p className={wizardUi.stepMeta}>
              {t('adminTasks.wizardStepOf', { n: stepNum, total: PROJECT_WIZARD_STEPS.length }) ||
                `Step ${stepNum} of ${PROJECT_WIZARD_STEPS.length}`}
            </p>
            <div className="flex gap-2">
              {wizard.step > 0 ? (
                <button
                  type="button"
                  className={wizardUi.secondaryBtn}
                  onClick={wizard.goBack}
                  disabled={wizard.busy || wizard.intakeBusy}
                >
                  {t('common.back') || 'Back'}
                </button>
              ) : onCancel ? (
                <button
                  type="button"
                  className={wizardUi.secondaryBtn}
                  onClick={onCancel}
                  disabled={wizard.busy || wizard.intakeBusy}
                >
                  {t('common.cancel')}
                </button>
              ) : null}
              {!isLast ? (
                <button
                  type="button"
                  className={wizardUi.primaryBtn}
                  onClick={wizard.goNext}
                  disabled={wizard.busy || wizard.intakeBusy}
                >
                  {t('common.next') || 'Next'}
                </button>
              ) : (
                <button
                  type="button"
                  className={wizardUi.primaryBtn}
                  onClick={wizard.submit}
                  disabled={wizard.busy || wizard.intakeBusy}
                >
                  {wizard.busy ? t('common.saving') : t('adminTasks.wizardCreate') || 'Create'}
                </button>
              )}
            </div>
          </footer>
        </div>

        <div className={wizardUi.previewPane}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(56,189,248,0.08),transparent_50%)] dark:bg-[radial-gradient(ellipse_at_top_right,rgba(56,189,248,0.12),transparent_50%)]" />
          <div className="relative mb-4 space-y-2">
            <p className={wizardUi.previewLabel}>
              {t('adminTasks.wizardPreviewLabel') || 'Preview'}
            </p>
            <p className={wizardUi.previewHint}>
              {wizard.stepId === 'intake'
                ? t('adminTasks.wizardPreviewMembersHint')
                : t('adminTasks.wizardPhase1PreviewHint')}
            </p>
            <span className="inline-flex rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {t(deliveryPhaseLabelKey('requirement_analysis'))}
            </span>
          </div>
          {wizard.stepId === 'intake' ? (
            <ProjectWizardRosterPreview
              title={wizard.form.title}
              projectCode={wizard.form.projectCode}
              intakeSlots={wizard.form.intakeSlots}
              seedMembers={wizard.form.seedMembers}
              catalogRoles={wizard.catalogRoles}
              onClearSlot={wizard.clearIntakeSlot}
              t={t}
            />
          ) : (
            <div className="relative min-h-0 flex-1">
              <ProjectWizardStepConfirm form={wizard.form} t={t} />
              <ol className="mt-6 space-y-2 px-1 text-sm text-muted-foreground">
                {PROJECT_WIZARD_STEPS.map((id, i) => (
                  <li
                    key={id}
                    className={
                      i === wizard.step
                        ? 'font-semibold text-foreground'
                        : i < wizard.step
                          ? 'opacity-70'
                          : ''
                    }
                  >
                    {i + 1}. {stepTitles[id] || id}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
