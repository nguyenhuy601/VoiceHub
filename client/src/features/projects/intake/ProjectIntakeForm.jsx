import RequirementSourceSection from './RequirementSourceSection';
import ProjectInformationSection from './ProjectInformationSection';
import CoreTeamSection from './CoreTeamSection';
import AnalysisMethodSection from './AnalysisMethodSection';

export default function ProjectIntakeForm({
  organizationId,
  wizard,
  fieldErrors,
  showErrors,
  sectionMeta,
  t,
}) {
  return (
    <>
      <RequirementSourceSection
        form={wizard.form}
        patchForm={wizard.patchForm}
        onRequirementSelected={wizard.applyRequirementFile}
        intakeBusy={wizard.intakeBusy}
        requirementIntakeStatus={wizard.requirementIntakeStatus}
        fieldError={fieldErrors.requirement}
        showErrors={showErrors}
        sectionMeta={sectionMeta.requirements}
        t={t}
      />
      <ProjectInformationSection
        form={wizard.form}
        patchForm={wizard.patchForm}
        fieldErrors={fieldErrors}
        showErrors={showErrors}
        sectionMeta={sectionMeta.information}
        t={t}
      />
      <CoreTeamSection
        orgId={organizationId}
        form={wizard.form}
        setIntakeSlot={wizard.setIntakeSlot}
        fieldErrors={fieldErrors}
        showErrors={showErrors}
        sectionMeta={sectionMeta.team}
        t={t}
      />
      <AnalysisMethodSection
        form={wizard.form}
        patchForm={wizard.patchForm}
        fieldError={fieldErrors.analysisMode}
        showErrors={showErrors}
        sectionMeta={sectionMeta.analysis}
        t={t}
      />
    </>
  );
}
