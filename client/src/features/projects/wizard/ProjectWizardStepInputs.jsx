import { useRef } from 'react';
import { FileUp, Loader2, X } from 'lucide-react';
import { wizardUi } from './projectWizardUi';
import {
  MAX_FILES_PER_GROUP,
  validateIntakeFile,
} from './projectWizardInputFiles';

function FileRow({ file, onRemove, disabled, statusHint }) {
  return (
    <li className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-foreground">{file.name}</span>
        <button
          type="button"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          onClick={onRemove}
          disabled={disabled}
          aria-label="Remove"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {statusHint ? (
        <p
          className={`mt-1 text-[11px] ${
            statusHint.tone === 'ok'
              ? 'text-emerald-700 dark:text-emerald-400'
              : statusHint.tone === 'warn'
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-muted-foreground'
          }`}
        >
          {statusHint.text}
        </p>
      ) : null}
    </li>
  );
}

function UploadZone({
  label,
  required,
  accept,
  multiple,
  files,
  onAdd,
  onRemoveAt,
  onClearSingle,
  t,
  hint,
  disabled,
  busy,
  statusHint,
}) {
  const inputRef = useRef(null);
  const list = multiple ? (Array.isArray(files) ? files : []) : files ? [files] : [];

  const onPick = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!picked.length || disabled) return;
    const accepted = [];
    for (const f of picked) {
      const v = validateIntakeFile(f);
      if (!v.ok) continue;
      accepted.push(f);
    }
    if (accepted.length) onAdd(accepted);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className={wizardUi.fieldLabel}>
          {label}
          {required ? <span className="ml-0.5 text-destructive">*</span> : null}
        </p>
        {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      </div>
      <button
        type="button"
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/10 px-4 py-6 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-foreground disabled:opacity-60"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
        {busy
          ? t('adminTasks.wizardIntakeParsing') || 'Đang đọc file…'
          : t('adminTasks.wizardInputsPick') || 'Chọn file'}
      </button>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        multiple={Boolean(multiple)}
        onChange={onPick}
        disabled={disabled}
      />
      {list.length ? (
        <ul className="space-y-1.5">
          {list.map((f, i) => (
            <FileRow
              key={`${f.name}-${f.size}-${i}`}
              file={f}
              disabled={disabled}
              statusHint={!multiple && i === 0 ? statusHint : null}
              onRemove={() => (multiple ? onRemoveAt(i) : onClearSingle())}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Step Import Project Inputs — raw customer files (also used on intake step 1). */
export default function ProjectWizardStepInputs({
  form,
  patchForm,
  onRequirementSelected,
  intakeBusy = false,
  requirementIntakeStatus = 'idle',
  t,
}) {
  const intake = form.intakeFiles || { requirement: null, customerFiles: [], references: [] };

  const setIntake = (partial) => {
    patchForm({ intakeFiles: { ...intake, ...partial } });
  };

  const accept =
    '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.zip';

  const requirementStatusHint =
    requirementIntakeStatus === 'autofilled'
      ? {
          tone: 'ok',
          text:
            t('adminTasks.wizardIntakeStatusAutofilled') ||
            'Đã tự điền thông tin từ file.',
        }
      : requirementIntakeStatus === 'kept_manual'
        ? {
            tone: 'warn',
            text:
              t('adminTasks.wizardIntakeStatusKeptManual') ||
              'File đã giữ để đính kèm — chưa tự điền; nhập tay các trường bên dưới.',
          }
        : requirementIntakeStatus === 'parsing'
          ? {
              tone: 'muted',
              text: t('adminTasks.wizardIntakeParsing') || 'Đang đọc file…',
            }
          : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className={wizardUi.title}>
          {t('adminTasks.wizardIntakeTitle') || 'Import & thông tin dự án'}
        </h1>
        <p className={wizardUi.subtitle}>
          {t('adminTasks.wizardIntakeHint') ||
            'Tải Customer Requirement Raw để tự điền thông tin. Các mục không có trong file vẫn nhập tay bên dưới.'}
        </p>
      </div>

      <UploadZone
        label={t('adminTasks.wizardInputsRequirement') || 'Customer Requirement'}
        required
        accept={accept}
        multiple={false}
        files={intake.requirement}
        disabled={intakeBusy}
        busy={intakeBusy}
        statusHint={requirementStatusHint}
        onAdd={(files) => {
          const file = files[0] || null;
          setIntake({ requirement: file });
          if (file && typeof onRequirementSelected === 'function') {
            onRequirementSelected(file);
          }
        }}
        onClearSingle={() => {
          setIntake({ requirement: null });
          if (typeof onRequirementSelected === 'function') onRequirementSelected(null);
        }}
        t={t}
      />

      <UploadZone
        label={t('adminTasks.wizardInputsCustomerFiles') || 'Customer Files'}
        accept={accept}
        multiple
        files={intake.customerFiles}
        disabled={intakeBusy}
        hint={t('adminTasks.wizardInputsMaxFiles', { n: MAX_FILES_PER_GROUP })}
        onAdd={(files) => {
          const next = [...(intake.customerFiles || []), ...files].slice(0, MAX_FILES_PER_GROUP);
          setIntake({ customerFiles: next });
        }}
        onRemoveAt={(i) => {
          const next = (intake.customerFiles || []).filter((_, idx) => idx !== i);
          setIntake({ customerFiles: next });
        }}
        t={t}
      />

      <UploadZone
        label={t('adminTasks.wizardInputsReferences') || 'Reference / Attachments'}
        accept={accept}
        multiple
        files={intake.references}
        disabled={intakeBusy}
        hint={t('adminTasks.wizardInputsMaxFiles', { n: MAX_FILES_PER_GROUP })}
        onAdd={(files) => {
          const next = [...(intake.references || []), ...files].slice(0, MAX_FILES_PER_GROUP);
          setIntake({ references: next });
        }}
        onRemoveAt={(i) => {
          const next = (intake.references || []).filter((_, idx) => idx !== i);
          setIntake({ references: next });
        }}
        t={t}
      />
    </div>
  );
}
