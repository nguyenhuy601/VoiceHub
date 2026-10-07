import { useRef, useState } from 'react';
import { CheckCircle2, FileUp, Loader2, X } from 'lucide-react';
import { intakeUi } from './intakeUi';
import IntakeSection from './IntakeSection';
import { validateIntakeFile } from '../wizard/projectWizardInputFiles';

export default function RequirementSourceSection({
  form,
  patchForm,
  onRequirementSelected,
  intakeBusy,
  requirementIntakeStatus,
  fieldError,
  showErrors,
  sectionMeta,
  t,
}) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const file = form.intakeFiles?.requirement || null;

  const setFile = (next) => {
    patchForm({ intakeFiles: { ...form.intakeFiles, requirement: next } });
    if (typeof onRequirementSelected === 'function') onRequirementSelected(next);
  };

  const onPick = (picked) => {
    const f = picked?.[0];
    if (!f) return;
    const v = validateIntakeFile(f);
    if (!v.ok) return;
    setFile(f);
  };

  const statusHint =
    requirementIntakeStatus === 'autofilled'
      ? t('adminTasks.wizardIntakeStatusAutofilled') ||
        'Đã tự điền thông tin từ file.'
      : requirementIntakeStatus === 'kept_manual'
        ? t('adminTasks.wizardIntakeStatusKeptManual') ||
          'File đã giữ — chưa tự điền; nhập tay các trường bên dưới.'
        : null;

  const sectionStatus =
    sectionMeta?.hint === 'error' ? 'error' : sectionMeta?.complete ? 'complete' : 'pending';

  return (
    <IntakeSection
      index={1}
      sectionId="intake-section-requirements"
      title={t('adminTasks.intakeSectionRequirements') || 'Requirements'}
      subtitle={t('adminTasks.wizardInputsRequirement') || 'Customer Requirement Raw'}
      status={sectionStatus}
      t={t}
    >
      <div id="intake-field-requirement">
        <p className={intakeUi.fieldLabel}>
          {t('adminTasks.wizardInputsRequirement') || 'Customer Requirement Raw'}
          <span className="ml-0.5 text-destructive">*</span>
        </p>
        {!file ? (
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              onPick(Array.from(e.dataTransfer?.files || []));
            }}
            onClick={() => !intakeBusy && inputRef.current?.click()}
            className={`${intakeUi.uploadZone} ${dragOver ? intakeUi.uploadZoneActive : ''} ${
              showErrors && fieldError ? intakeUi.inputError : ''
            }`}
          >
            {intakeBusy ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : (
              <FileUp className="h-5 w-5" />
            )}
            <span className="font-medium text-foreground">
              {intakeBusy
                ? t('adminTasks.wizardIntakeParsing') || 'Đang đọc file…'
                : t('adminTasks.intakeUploadTitle') || 'Upload requirement'}
            </span>
            <span className="text-xs">
              {t('adminTasks.intakeUploadHint') ||
                'Thả file .xlsx vào đây hoặc Browse — Customer Requirement Raw'}
            </span>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="truncate">{file.name}</span>
                </p>
                {intakeBusy ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('adminTasks.intakeParsingDetail') ||
                      'Đang đọc Customer Requirement Raw…'}
                  </p>
                ) : statusHint ? (
                  <p
                    className={`mt-2 text-xs ${
                      requirementIntakeStatus === 'autofilled'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {statusHint}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('adminTasks.intakeFileAttached') || 'File đã đính kèm.'}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                onClick={() => setFile(null)}
                disabled={intakeBusy}
                aria-label={t('common.remove') || 'Remove'}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.zip"
          onChange={(e) => {
            onPick(Array.from(e.target.files || []));
            e.target.value = '';
          }}
          disabled={intakeBusy}
        />
        {showErrors && fieldError ? <p className={intakeUi.fieldError}>{fieldError}</p> : null}
      </div>
    </IntakeSection>
  );
}
