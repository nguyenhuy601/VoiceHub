/**
 * Import Set upload wizard — Raw → Analysis preview → Confirm → Done (DEC P1-A/J + UX polish).
 * Uses existing analysisAPI routes only.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Upload, CheckCircle2, FileSpreadsheet, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../../../../components/Shared/Modal';
import { analysisAPI } from '../../../../services/api/analysisAPI';
import { requirementAPI } from '../../../../services/api/requirementAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

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
    throw new Error(msg);
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

const ALL_STEPS = ['raw', 'analysis', 'confirm', 'done'];

function draftHasRaw(set, rawNameFallback = '') {
  return Boolean(
    set?.rawDocument?.filename ||
      set?.rawDocument?.id ||
      set?.rawDocumentId ||
      rawNameFallback
  );
}

export default function ImportSetUploadWizard({
  open,
  onClose,
  projectId,
  organizationId,
  draftSet = null,
  onCompleted,
  onOpenReviews,
}) {
  const { t } = useAppStrings();
  const rawRef = useRef(null);
  const analysisRef = useRef(null);
  const wasOpenRef = useRef(false);
  const [step, setStep] = useState('raw');
  const [busy, setBusy] = useState(false);
  const [localDraft, setLocalDraft] = useState(draftSet);
  const [preview, setPreview] = useState(null);
  const [rawName, setRawName] = useState(draftSet?.rawDocument?.filename || '');
  const [confirmResult, setConfirmResult] = useState(null);

  const hasRaw = draftHasRaw(localDraft, rawName);
  const setIdForHint = String(localDraft?.id || draftSet?.id || '{setId}');

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    const justClosed = !open && wasOpenRef.current;
    wasOpenRef.current = open;

    if (justClosed) {
      setStep('raw');
      setPreview(null);
      setConfirmResult(null);
      setBusy(false);
      return;
    }
    if (!open) return;

    setLocalDraft(draftSet);
    setRawName(draftSet?.rawDocument?.filename || '');
    if (justOpened) {
      setPreview(null);
      setConfirmResult(null);
      // Đã có Raw trên draft → nhảy thẳng bước Analysis (không bắt tải Raw lại).
      setStep(draftHasRaw(draftSet) ? 'analysis' : 'raw');
    }
  }, [open, draftSet]);

  const resetAndClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const onDownloadTemplate = useCallback(
    async (variant, fileName) => {
      if (!organizationId || busy) return;
      setBusy(true);
      try {
        const res = await requirementAPI.downloadTemplate(organizationId, { variant });
        await downloadBlobAsFile(res, fileName, t('workspace.phase1DownloadTemplateFail'));
        toast.success(t('workspace.phase1DownloadTemplateOk'));
      } catch (err) {
        toast.error(resolveApiErrorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [busy, organizationId, t]
  );

  const onAttachRaw = useCallback(
    async (file) => {
      if (!file || !projectId) return;
      setBusy(true);
      try {
        const attached = unwrap(await analysisAPI.attachRawImportSet(projectId, file));
        setLocalDraft(attached);
        setRawName(file.name || attached?.rawDocument?.filename || '');
        toast.success(t('workspace.phase1RawAttached'));
        setStep('analysis');
      } catch (err) {
        const msg = resolveApiErrorMessage(err);
        // Slot Raw đã đầy (mở lại wizard) → coi như xong bước 1.
        if (/đã có file Raw|SLOT_RAW_TAKEN|already has/i.test(String(msg || ''))) {
          toast.success(t('workspace.phase1RawAlreadyAttached'));
          setLocalDraft((prev) => prev || draftSet);
          setRawName((n) => n || draftSet?.rawDocument?.filename || file.name || '');
          setStep('analysis');
        } else {
          toast.error(msg);
        }
      } finally {
        setBusy(false);
      }
    },
    [draftSet, projectId, t]
  );

  const onPickAnalysis = useCallback(
    async (file) => {
      if (!file || !projectId) return;
      if (!hasRaw) {
        toast.error(t('workspace.phase1NeedRawFirst'));
        return;
      }
      setBusy(true);
      try {
        const prev = unwrap(await analysisAPI.previewAnalysisImport(projectId, file));
        if (prev?.templateType && prev.templateType !== 'RequirementAnalysis') {
          toast.error(t('workspace.phase1ExpectAnalysisFile'));
          return;
        }
        setPreview({
          ...prev,
          importSetId: localDraft?.id || draftSet?.id || null,
          pendingFileName: file.name,
        });
        toast.success(t('workspace.phase1ImportPreviewReady'));
        setStep('confirm');
      } catch (err) {
        toast.error(resolveApiErrorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [draftSet?.id, hasRaw, localDraft?.id, projectId, t]
  );

  const onConfirm = useCallback(async () => {
    if (!preview?.sessionId || !projectId) return;
    setBusy(true);
    try {
      const res = await analysisAPI.confirmAnalysisImport(projectId, {
        sessionId: preview.sessionId,
        importSetId: preview.importSetId || localDraft?.id || draftSet?.id || undefined,
      });
      const data = unwrap(res);
      if (data?.gateEnabled && data?.importSetStatus === 'pending_review') {
        toast.success(t('workspace.phase1ImportStaged'));
      } else {
        toast.success(t('workspace.phase1ImportDone', { count: data?.seeded || 0 }));
      }
      setConfirmResult(data);
      setStep('done');
      onCompleted?.(data);
    } catch (err) {
      toast.error(resolveApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [draftSet?.id, localDraft?.id, onCompleted, preview, projectId, t]);

  const stepIndex = ALL_STEPS.indexOf(step);
  const isDone = step === 'done';

  return (
    <Modal
      isOpen={open}
      onClose={resetAndClose}
      closable={!busy}
      title={t('workspace.phase1ImportWizardTitle')}
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {t('workspace.phase1ImportWizardStep', {
              n: Math.max(1, stepIndex + 1),
              total: ALL_STEPS.length,
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            {!isDone && step !== 'raw' ? (
              <button
                type="button"
                className="rounded border border-border px-3 py-1.5 text-sm"
                disabled={busy}
                onClick={() => setStep(step === 'confirm' ? 'analysis' : 'raw')}
              >
                {t('common.back')}
              </button>
            ) : null}
            {isDone ? (
              <>
                <button
                  type="button"
                  className="rounded border border-border px-3 py-1.5 text-sm"
                  onClick={resetAndClose}
                >
                  {t('workspace.phase1ImportWizardCloseDone')}
                </button>
                {typeof onOpenReviews === 'function' ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
                    onClick={() => {
                      onOpenReviews(confirmResult);
                      resetAndClose();
                    }}
                  >
                    {t('workspace.phase1ImportWizardOpenReviews')}
                    <ArrowRight size={14} />
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="rounded border border-border px-3 py-1.5 text-sm"
                  disabled={busy}
                  onClick={resetAndClose}
                >
                  {t('common.cancel')}
                </button>
                {step === 'confirm' ? (
                  <button
                    type="button"
                    className="rounded bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                    disabled={busy || !preview?.sessionId}
                    onClick={onConfirm}
                  >
                    {busy ? t('common.loading') : t('workspace.phase1ConfirmImport')}
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <ol className="flex flex-wrap gap-2 text-[11px]">
          {ALL_STEPS.map((s, i) => (
            <li
              key={s}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                i === stepIndex
                  ? 'bg-primary/15 text-primary'
                  : i < stepIndex
                    ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {i < stepIndex ? <CheckCircle2 size={12} /> : null}
              {t(`workspace.phase1ImportWizardStep_${s}`)}
            </li>
          ))}
        </ol>

        <p className="rounded-md border border-border/60 bg-muted/15 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          {t('workspace.phase1ImportWizardStorageHint')
            .replace('{projectId}', String(projectId || '{projectId}'))
            .replace('{setId}', setIdForHint)}
        </p>

        {step === 'raw' ? (
          <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            {hasRaw ? (
              <>
                <p className="text-sm text-foreground">{t('workspace.phase1RawAlreadyAttached')}</p>
                {rawName ? (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <FileSpreadsheet size={12} />
                    {rawName}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
                  onClick={() => setStep('analysis')}
                >
                  <ArrowRight size={12} />
                  {t('workspace.phase1ImportWizardContinueAnalysis')}
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{t('workspace.phase1ImportWizardRawHint')}</p>
                <div className="flex flex-wrap gap-2">
                  {organizationId ? (
                    <button
                      type="button"
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded border border-border bg-surface px-2 py-1 text-xs font-medium"
                      onClick={() => onDownloadTemplate('raw', 'Customer_Requirement_Raw.xlsx')}
                    >
                      <Download size={12} />
                      {t('workspace.phase1DownloadRawTemplate')}
                    </button>
                  ) : null}
                  <input
                    ref={rawRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) onAttachRaw(f);
                    }}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                    onClick={() => rawRef.current?.click()}
                  >
                    <Upload size={12} />
                    {busy ? t('common.loading') : t('workspace.phase1UploadRaw')}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}

        {step === 'analysis' ? (
          <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-sm text-muted-foreground">
              {t('workspace.phase1ImportWizardAnalysisHint')}
            </p>
            <div className="flex flex-wrap gap-2">
              {organizationId ? (
                <button
                  type="button"
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded border border-border bg-surface px-2 py-1 text-xs font-medium"
                  onClick={() => onDownloadTemplate('analysis', 'Requirement_Analysis.xlsx')}
                >
                  <Download size={12} />
                  {t('workspace.phase1DownloadAnalysisTemplate')}
                </button>
              ) : null}
              <input
                ref={analysisRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) onPickAnalysis(f);
                }}
              />
              <button
                type="button"
                disabled={busy || !hasRaw}
                className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                onClick={() => analysisRef.current?.click()}
              >
                <Upload size={12} />
                {busy ? t('common.loading') : t('workspace.phase1UploadAnalysis')}
              </button>
            </div>
          </div>
        ) : null}

        {step === 'confirm' && preview ? (
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-sm font-medium">{t('workspace.phase1ImportWizardConfirmHint')}</p>
            <p className="text-xs text-muted-foreground">
              {preview.pendingFileName || 'Analysis.xlsx'} ·{' '}
              {t('workspace.phase1ImportPreviewMeta', {
                sheets: Array.isArray(preview.sheets) ? preview.sheets.length : preview.sheetCount || '—',
                issues: Array.isArray(preview.issues) ? preview.issues.length : 0,
              })}
            </p>
            {Array.isArray(preview.issues) && preview.issues.length > 0 ? (
              <ul className="max-h-32 list-disc overflow-y-auto pl-4 text-[11px] text-amber-800 dark:text-amber-200">
                {preview.issues.slice(0, 12).map((issue, idx) => (
                  <li key={idx}>{String(issue.message || issue.code || issue)}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                {t('workspace.phase1ImportPreviewClean')}
              </p>
            )}
          </div>
        ) : null}

        {isDone ? (
          <div className="space-y-3 rounded-lg border border-emerald-500/35 bg-emerald-500/5 p-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {t('workspace.phase1ImportWizardDoneTitle')}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('workspace.phase1ImportWizardDoneBody')}
                </p>
                {confirmResult?.seeded != null ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t('workspace.phase1ImportDone', { count: confirmResult.seeded })}
                  </p>
                ) : null}
              </div>
            </div>
            <ol className="space-y-1.5 text-xs">
              <li className="rounded border border-border/60 bg-background px-2.5 py-1.5">
                {t('workspace.phase1ImportWizardDoneGateBa')}
              </li>
              <li className="rounded border border-border/60 bg-background px-2.5 py-1.5">
                {t('workspace.phase1ImportWizardDoneGateTech')}
              </li>
              <li className="rounded border border-border/60 bg-background px-2.5 py-1.5">
                {t('workspace.phase1ImportWizardDoneGatePo')}
              </li>
            </ol>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
