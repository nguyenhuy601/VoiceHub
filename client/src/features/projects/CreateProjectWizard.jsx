import { useMemo } from 'react';
import useCreateProjectWizard from './wizard/useCreateProjectWizard';
import { useAppStrings } from '../../locales/appStrings';
import { intakeKeyframes, intakeUi } from './intake/intakeUi';
import WizardHeader from './intake/WizardHeader';
import WizardActionBar from './intake/WizardActionBar';
import ProjectIntakeLayout from './intake/ProjectIntakeLayout';
import ProjectIntakeForm from './intake/ProjectIntakeForm';
import {
  buildIntakeSectionMeta,
  intakeErrorCount,
} from './intake/projectIntakeValidation';
import IntakeSubmitOverlay from './intake/IntakeSubmitOverlay';

/**
 * Enterprise Project Intake Workspace — single-page Phase 1 birth (AI or manual).
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

  const showErrors = wizard.validationAttempted;
  const fieldErrors = wizard.fieldErrors;
  const sectionMeta = useMemo(
    () => buildIntakeSectionMeta(wizard.form, fieldErrors, showErrors),
    [wizard.form, fieldErrors, showErrors]
  );
  const issueCount = showErrors ? intakeErrorCount(fieldErrors) : 0;
  const ready =
    issueCount === 0 &&
    sectionMeta.requirements.complete &&
    sectionMeta.information.complete &&
    sectionMeta.team.complete &&
    sectionMeta.analysis.complete;

  const headerBackLabel =
    backLabel ||
    (variant === 'admin'
      ? t('adminTasks.wizardBackToAdmin') || 'Back to projects'
      : t('adminTasks.wizardBackToHub') || 'Back to workspaces');

  const onHeaderBack = () => {
    if (wizard.busy || wizard.intakeBusy) return;
    if (wizard.step > 0) {
      wizard.goBack();
      return;
    }
    onCancel?.();
  };

  const onIssueClick = () => {
    wizard.focusFirstIntakeError(fieldErrors);
  };

  const createLabel =
    t('adminTasks.intakeCreateDraft') || t('adminTasks.wizardCreate') || 'Create draft';

  const submitPhaseLabels = {
    creating_project: t('adminTasks.intakeSubmitCreatingProject'),
    creating_pack: t('adminTasks.intakeSubmitCreatingPack'),
    uploading: t('adminTasks.intakeSubmitUploading'),
    opening_workspace: t('adminTasks.intakeSubmitOpeningProject'),
  };
  const savingLabel =
    (wizard.busy && submitPhaseLabels[wizard.submitPhase]) || t('common.saving');

  return (
    <div className={intakeUi.shell}>
      <style>{intakeKeyframes}</style>
      <IntakeSubmitOverlay phase={wizard.submitPhase} t={t} />
      <WizardHeader
        backLabel={headerBackLabel}
        onBack={onHeaderBack}
        title={t('adminTasks.intakePageTitle') || 'Create a new project'}
        subtitle={
          t('adminTasks.intakePageSubtitle') ||
          'Thiết lập nền tảng dự án trước khi vào Requirement Analysis.'
        }
        t={t}
      />
      <ProjectIntakeLayout
        form={wizard.form}
        fieldErrors={fieldErrors}
        showErrors={showErrors}
        onIssueClick={onIssueClick}
        t={t}
        formContent={
          <ProjectIntakeForm
            organizationId={organizationId}
            wizard={wizard}
            fieldErrors={fieldErrors}
            showErrors={showErrors}
            sectionMeta={sectionMeta}
            t={t}
          />
        }
      />
      <WizardActionBar
        ready={ready}
        issueCount={issueCount}
        onCancel={onCancel}
        onCreate={wizard.submit}
        busy={wizard.busy}
        intakeBusy={wizard.intakeBusy}
        createLabel={createLabel}
        savingLabel={savingLabel}
        t={t}
      />
    </div>
  );
}
