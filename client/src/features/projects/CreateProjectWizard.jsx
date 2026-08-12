import { ArrowLeft } from 'lucide-react';
import ProjectWizardStepName from './wizard/ProjectWizardStepName';
import ProjectWizardStepSetup from './wizard/ProjectWizardStepSetup';
import ProjectWizardStepTeam from './wizard/ProjectWizardStepTeam';
import ProjectWizardPreview from './wizard/ProjectWizardPreview';
import useCreateProjectWizard from './wizard/useCreateProjectWizard';
import { PROJECT_WIZARD_STEPS } from './wizard/projectWizardConstants';
import { wizardUi } from './wizard/projectWizardUi';
import { useAppStrings } from '../../locales/appStrings';

/**
 * Full-screen Project Setup Wizard — Name → Setup → Team (split form + live preview).
 * Colors follow ThemeContext (light/dark) via semantic tokens.
 *
 * @param {{
 *   organizationId: string,
 *   variant?: 'collaborate'|'admin',
 *   initialValues?: object,
 *   resetKey?: number|string,
 *   onCreated?: (result: object) => void,
 *   onCancel?: () => void,
 *   scopeLabel?: string,
 *   backLabel?: string,
 * }} props
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
  const inSetupSub = Boolean(wizard.setupPanel);

  const headerBackLabel =
    backLabel ||
    (variant === 'admin'
      ? t('adminTasks.wizardBackToAdmin') || 'Back to projects'
      : t('adminTasks.wizardBackToHub') || 'Back to workspaces');

  const onHeaderBack = () => {
    if (inSetupSub) {
      wizard.setSetupPanel('');
      return;
    }
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
              {inSetupSub
                ? t('adminTasks.wizardBackToSetup') || 'Back to setup'
                : wizard.step > 0
                  ? t('common.back') || 'Back'
                  : headerBackLabel}
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
            <div key={`${wizard.step}-${wizard.setupPanel}-${wizard.slideDir}`} className={slideClass}>
              {wizard.stepId === 'name' ? (
                <ProjectWizardStepName form={wizard.form} patchForm={wizard.patchForm} t={t} />
              ) : null}
              {wizard.stepId === 'setup' ? (
                <ProjectWizardStepSetup
                  form={wizard.form}
                  patchForm={wizard.patchForm}
                  setupPanel={wizard.setupPanel}
                  setSetupPanel={wizard.setSetupPanel}
                  t={t}
                />
              ) : null}
              {wizard.stepId === 'team' ? (
                <ProjectWizardStepTeam
                  orgId={organizationId}
                  form={wizard.form}
                  patchForm={wizard.patchForm}
                  catalogRoles={wizard.catalogRoles}
                  addSeedMember={wizard.addSeedMember}
                  removeSeedMember={wizard.removeSeedMember}
                  defaultMemberRole={wizard.defaultMemberRole}
                  t={t}
                />
              ) : null}
            </div>
          </div>

          <footer className={wizardUi.footer}>
            <p className={wizardUi.stepMeta}>
              {t('adminTasks.wizardStepOf', { n: stepNum, total: PROJECT_WIZARD_STEPS.length }) ||
                `Step ${stepNum} of ${PROJECT_WIZARD_STEPS.length}`}
            </p>
            <div className="flex gap-2">
              {wizard.step > 0 || inSetupSub ? (
                <button
                  type="button"
                  className={wizardUi.secondaryBtn}
                  onClick={wizard.goBack}
                  disabled={wizard.busy}
                >
                  {t('common.back') || 'Back'}
                </button>
              ) : onCancel ? (
                <button
                  type="button"
                  className={wizardUi.secondaryBtn}
                  onClick={onCancel}
                  disabled={wizard.busy}
                >
                  {t('common.cancel')}
                </button>
              ) : null}
              {!isLast || inSetupSub ? (
                <button
                  type="button"
                  className={wizardUi.primaryBtn}
                  onClick={wizard.goNext}
                  disabled={wizard.busy}
                >
                  {inSetupSub
                    ? t('adminTasks.wizardDoneSubpanel') || 'Done'
                    : t('common.next') || 'Next'}
                </button>
              ) : (
                <button
                  type="button"
                  className={wizardUi.primaryBtn}
                  onClick={wizard.submit}
                  disabled={wizard.busy}
                >
                  {wizard.busy ? t('common.saving') : t('adminTasks.wizardCreate') || 'Create'}
                </button>
              )}
            </div>
          </footer>
        </div>

        <div className={wizardUi.previewPane}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(56,189,248,0.08),transparent_50%)] dark:bg-[radial-gradient(ellipse_at_top_right,rgba(56,189,248,0.12),transparent_50%)]" />
          <div className="relative mb-4">
            <p className={wizardUi.previewLabel}>
              {t('adminTasks.wizardPreviewLabel') || 'Preview'}
            </p>
            <p className={wizardUi.previewHint}>
              {t('adminTasks.wizardPreviewHint') || 'Board cập nhật khi bạn đổi Statuses / Views.'}
            </p>
          </div>
          <div className="relative min-h-0 flex-1">
            <ProjectWizardPreview
              title={wizard.form.title}
              projectCode={wizard.form.projectCode}
              columns={wizard.previewColumns}
              enabledViews={wizard.form.enabledViews}
              workTypes={wizard.form.workTypes}
              t={t}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
