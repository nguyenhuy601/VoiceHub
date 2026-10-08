import { useRef, useState } from 'react';
import { CheckCircle2, FileUp, Loader2, Wand2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { intakeUi } from './intakeUi';
import IntakeSection from './IntakeSection';
import { validateIntakeFile } from '../wizard/projectWizardInputFiles';
import { requirementAPI } from '../../../services/api/requirementAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';

async function downloadBlobAsFile(blobLike, fileName, failMsg) {
  const blob =
    blobLike instanceof Blob
      ? blobLike
      : new Blob([blobLike?.data ?? blobLike], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
  if (blob.type && blob.type.includes('application/json')) {
    const text = await blob.text();
    let msg = failMsg;
    try {
      const parsed = JSON.parse(text);
      msg = parsed.message || msg;
    } catch {
      /* ignore */
    }
    const err = new Error(msg);
    try {
      const parsed = JSON.parse(text);
      err.errorCode = parsed.errorCode;
    } catch {
      /* ignore */
    }
    throw err;
  }
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

function guessDownloadName(blobLike, fallback) {
  return fallback || 'Customer_Requirement_Raw.xlsx';
}

export default function RequirementSourceSection({
  organizationId,
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
  const normalizeInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [normalizeBusy, setNormalizeBusy] = useState(false);
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

  const onNormalizePick = async (picked) => {
    const f = picked?.[0];
    if (!f || normalizeBusy || intakeBusy) return;
    const name = String(f.name || '').toLowerCase();
    if (!name.endsWith('.xlsx')) {
      toast.error(
        t('adminTasks.intakeNormalizeNeedXlsx') || 'Chỉ chấp nhận file .xlsx để chuẩn hóa.'
      );
      return;
    }
    if (!organizationId) {
      toast.error(t('adminTasks.intakeNormalizeNeedOrg') || 'Thiếu organizationId.');
      return;
    }
    setNormalizeBusy(true);
    try {
      const blob = await requirementAPI.normalizeToCustomerRaw(organizationId, f);
      const outName = guessDownloadName(blob, 'Customer_Requirement_Raw_neway_trang_chu.xlsx');
      await downloadBlobAsFile(
        blob,
        outName,
        t('adminTasks.intakeNormalizeFail') || 'Chuẩn hóa dữ liệu thất bại.'
      );
      toast.success(
        t('adminTasks.intakeNormalizeOk') ||
          'Đã tải Customer Requirement Raw. Tiếp theo: Import Raw bên dưới.'
      );
    } catch (err) {
      let msg =
        t('adminTasks.intakeNormalizeFail') || 'Chuẩn hóa dữ liệu thất bại.';
      const data = err?.response?.data ?? err?.data;
      if (data instanceof Blob) {
        try {
          const parsed = JSON.parse(await data.text());
          if (parsed?.message) msg = parsed.message;
        } catch {
          /* ignore */
        }
      } else {
        msg =
          resolveApiErrorMessage(err, {
            fallback: err?.message || msg,
          }) ||
          err?.message ||
          msg;
      }
      toast.error(msg);
    } finally {
      setNormalizeBusy(false);
    }
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

  const busy = intakeBusy || normalizeBusy;

  return (
    <IntakeSection
      index={1}
      sectionId="intake-section-requirements"
      title={t('adminTasks.intakeSectionRequirements') || 'Requirements'}
      subtitle={t('adminTasks.wizardInputsRequirement') || 'Customer Requirement Raw'}
      status={sectionStatus}
      t={t}
    >
      <div className="space-y-5">
        <div id="intake-field-normalize">
          <p className={intakeUi.fieldLabel}>
            {t('adminTasks.intakeNormalizeTitle') || 'Chuẩn hóa dữ liệu'}
          </p>
          <p className="mb-2 text-xs text-muted-foreground">
            {t('adminTasks.intakeNormalizeHint') ||
              'File Excel khách (vd. bảng mô tả) → tải về Customer Requirement Raw. Mục thiếu để trống. Không dùng AI.'}
          </p>
          <button
            type="button"
            className={`${intakeUi.uploadZone} w-full`}
            onClick={() => !busy && normalizeInputRef.current?.click()}
            disabled={busy}
          >
            {normalizeBusy ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : (
              <Wand2 className="h-5 w-5" />
            )}
            <span className="font-medium text-foreground">
              {normalizeBusy
                ? t('adminTasks.intakeNormalizeBusy') || 'Đang chuẩn hóa…'
                : t('adminTasks.intakeNormalizePick') || 'Chọn file khách (.xlsx)'}
            </span>
            <span className="text-xs">
              {t('adminTasks.intakeNormalizePickHint') ||
                'Sau khi tải Raw, dùng bước Import bên dưới.'}
            </span>
          </button>
          <input
            ref={normalizeInputRef}
            type="file"
            className="hidden"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              onNormalizePick(Array.from(e.target.files || []));
              e.target.value = '';
            }}
            disabled={busy}
          />
        </div>

        <div id="intake-field-requirement">
          <p className={intakeUi.fieldLabel}>
            {t('adminTasks.wizardInputsRequirement') || 'Customer Requirement Raw'}
            <span className="ml-0.5 text-destructive">*</span>
          </p>
          <p className="mb-2 text-xs text-muted-foreground">
            {t('adminTasks.intakeRawImportHint') ||
              'Import file Raw đúng template để tự điền thông tin dự án.'}
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
              onClick={() => !busy && inputRef.current?.click()}
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
                  disabled={busy}
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
            disabled={busy}
          />
          {showErrors && fieldError ? <p className={intakeUi.fieldError}>{fieldError}</p> : null}
        </div>
      </div>
    </IntakeSection>
  );
}
