/**
 * Workbook import (Excel) — primary Planning data path (DEC Workbook-first).
 * Used on Planning Overview; not on Approval page.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { planningAPI } from '../../../../services/api/planningAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import PlanningWorkbookPreviewModal from './PlanningWorkbookPreviewModal';

function intakeLockStorageKey(projectId) {
  return `vh-planning-intake:${projectId}`;
}

function readIntakeLock(projectId) {
  if (!projectId || typeof sessionStorage === 'undefined') return null;
  try {
    const value = sessionStorage.getItem(intakeLockStorageKey(projectId));
    return value === 'seed' || value === 'upload' ? value : null;
  } catch {
    return null;
  }
}

function writeIntakeLock(projectId, mode) {
  if (!projectId || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(intakeLockStorageKey(projectId), mode);
  } catch {
    /* private mode */
  }
}

export default function PlanningWorkbookImportPanel({
  projectId,
  canEdit,
  planningRowCount = 0,
  summaryLoading = false,
}) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const [dumpText, setDumpText] = useState('');
  const [dumpPreview, setDumpPreview] = useState(null);
  const [pendingXlsxBase64, setPendingXlsxBase64] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [intakeLock, setIntakeLock] = useState(() => readIntakeLock(projectId));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['planningArtifacts', projectId] });
    queryClient.invalidateQueries({ queryKey: ['planningBaselines', projectId] });
    queryClient.invalidateQueries({ queryKey: ['planningSummary', projectId] });
    queryClient.invalidateQueries({ queryKey: ['projectAnalysisGaps', String(projectId)] });
  };

  const clearPreview = () => {
    setDumpPreview(null);
    setPendingXlsxBase64(null);
  };

  const notifyDumpAssignee = (data) => {
    const ar = data?.assigneeReport?.summary;
    const unresolved = Number(ar?.unresolved || 0) + Number(ar?.ambiguous || 0);
    if (unresolved > 0) {
      toast.error(
        t('workspace.phase1DumpAssigneeWarn', {
          matched: ar?.matched ?? 0,
          unresolved,
        })
      );
    } else if (Number(ar?.matched || 0) > 0) {
      toast.success(t('workspace.phase1DumpAssigneeOk', { matched: ar.matched }));
    }
  };

  const dumpMut = useMutation({
    mutationFn: () =>
      planningAPI.bulkDumpArtifacts(projectId, {
        format: dumpText.trim().startsWith('[') ? 'json' : 'csv',
        text: dumpText,
      }),
    onSuccess: (res) => {
      const data = unwrap(res);
      invalidate();
      setDumpText('');
      toast.success(
        t('workspace.phase1DumpOk', {
          created: data?.created ?? 0,
          skipped: data?.skipped ?? 0,
        })
      );
      notifyDumpAssignee(data);
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  if (!canEdit) {
    return (
      <p className="text-xs text-muted-foreground">{t('workspace.phase1DumpNeedEditPerm')}</p>
    );
  }

  const seedFromRa = async () => {
    if (!projectId || seeding || intakeLock === 'upload' || dumpPreview || hasPlanningRows) return;
    setSeeding(true);
    try {
      const data = unwrap(await planningAPI.seedDraftsFromRa(projectId));
      invalidate();
      toast.success(
        t('workspace.phase1DumpSeedFromRaOk', {
          created: data?.created ?? 0,
          skipped: data?.skipped ?? 0,
        })
      );
      writeIntakeLock(projectId, 'seed');
      setIntakeLock('seed');
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, {
          t,
          fallback: t('workspace.phase1DumpSeedFromRaFail'),
        })
      );
    } finally {
      setSeeding(false);
    }
  };

  const downloadTemplate = async (seedFromRaFile) => {
    try {
      const res = await planningAPI.downloadDumpTemplate(projectId, { seedFromRa: seedFromRaFile });
      const blob =
        res instanceof Blob
          ? res
          : new Blob([res?.data ?? res], {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
      if (blob.type && blob.type.includes('application/json')) {
        const text = await blob.text();
        let msg = 'Không tải được workbook.';
        try {
          const parsed = JSON.parse(text);
          msg = parsed.message || msg;
        } catch {
          /* keep fallback */
        }
        throw new Error(msg);
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = seedFromRaFile
        ? 'planning-workbook-seed-ra.xlsx'
        : 'planning-workbook-template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(resolveApiErrorMessage(err));
    }
  };

  const confirmImport = async (suggestionDecisions) => {
    if (!pendingXlsxBase64) return;
    setConfirming(true);
    try {
      const decisions = Array.isArray(suggestionDecisions) ? suggestionDecisions : [];
      const res = await planningAPI.bulkDumpArtifacts(projectId, {
        format: 'xlsx',
        base64: pendingXlsxBase64,
        dryRun: false,
        ...(decisions.length ? { suggestionDecisions: decisions } : {}),
      });
      const data = unwrap(res);
      invalidate();
      clearPreview();
      toast.success(
        t('workspace.phase1DumpOk', {
          created: data?.created ?? 0,
          skipped: data?.skipped ?? 0,
        })
      );
      notifyDumpAssignee(data);
      writeIntakeLock(projectId, 'upload');
      setIntakeLock('upload');
    } catch (err) {
      toast.error(resolveApiErrorMessage(err));
    } finally {
      setConfirming(false);
    }
  };

  const hasPlanningRows = Number(planningRowCount) > 0;
  const rowsBlockWrites = summaryLoading || hasPlanningRows;
  const uploadChosen = !hasPlanningRows && (intakeLock === 'upload' || Boolean(dumpPreview));
  const seedDisabled = seeding || uploading || confirming || uploadChosen || rowsBlockWrites;
  const uploadDisabled =
    uploading || seeding || confirming || intakeLock === 'seed' || rowsBlockWrites;
  const lockNote = hasPlanningRows
    ? t('workspace.phase1DumpLockHasRows')
    : intakeLock === 'seed'
      ? t('workspace.phase1DumpLockAfterSeed')
      : uploadChosen
        ? t('workspace.phase1DumpLockAfterUpload')
        : '';

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t('workspace.phase1DumpHint')}</p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className="rounded-lg border border-border px-2.5 py-1.5 text-xs"
          onClick={() => downloadTemplate(false)}
        >
          {t('workspace.phase1DumpDownloadTemplate')}
        </button>
        <button
          type="button"
          className="rounded-lg border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-xs font-medium text-primary"
          onClick={() => downloadTemplate(true)}
        >
          {t('workspace.phase1DumpDownloadSeedRa')}
        </button>
        <button
          type="button"
          className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          onClick={seedFromRa}
          disabled={seedDisabled}
          title={
            hasPlanningRows
              ? t('workspace.phase1DumpLockHasRows')
              : uploadChosen
                ? t('workspace.phase1DumpLockAfterUpload')
                : undefined
          }
        >
          {seeding ? t('common.loading') : t('workspace.phase1DumpSeedFromRa')}
        </button>
        <label
          className={`rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs ${
            uploadDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
          }`}
          title={
            hasPlanningRows
              ? t('workspace.phase1DumpLockHasRows')
              : intakeLock === 'seed'
                ? t('workspace.phase1DumpLockAfterSeed')
                : undefined
          }
        >
          {uploading ? t('common.loading') : t('workspace.phase1DumpUploadExcel')}
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            disabled={uploadDisabled}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file || hasPlanningRows || intakeLock === 'seed') return;
              setUploading(true);
              try {
                const buf = await file.arrayBuffer();
                const bytes = new Uint8Array(buf);
                let binary = '';
                bytes.forEach((b) => {
                  binary += String.fromCharCode(b);
                });
                const base64 = btoa(binary);
                const res = await planningAPI.bulkDumpArtifacts(projectId, {
                  format: 'xlsx',
                  base64,
                  dryRun: true,
                });
                const data = unwrap(res);
                setPendingXlsxBase64(base64);
                setDumpPreview(data);
                notifyDumpAssignee(data);
              } catch (err) {
                clearPreview();
                toast.error(resolveApiErrorMessage(err));
              } finally {
                setUploading(false);
              }
            }}
          />
        </label>
      </div>
      {lockNote ? <p className="text-[11px] text-muted-foreground">{lockNote}</p> : null}

      <button
        type="button"
        className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {showAdvanced
          ? t('workspace.phase1DumpAdvancedHide')
          : t('workspace.phase1DumpAdvancedShow')}
      </button>
      {showAdvanced ? (
        <div className="space-y-1.5 rounded-lg border border-dashed border-border/80 px-2.5 py-2">
          <p className="text-[11px] text-muted-foreground">{t('workspace.phase1DumpAdvancedHint')}</p>
          <textarea
            className="min-h-[56px] w-full rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-[11px]"
            placeholder={t('workspace.phase1DumpPlaceholder')}
            value={dumpText}
            onChange={(e) => setDumpText(e.target.value)}
          />
          <button
            type="button"
            className="rounded-lg bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-50"
            disabled={!dumpText.trim() || dumpMut.isPending || hasPlanningRows || summaryLoading}
            onClick={() => dumpMut.mutate()}
          >
            {t('workspace.phase1DumpSubmit')}
          </button>
        </div>
      ) : null}

      <PlanningWorkbookPreviewModal
        open={Boolean(dumpPreview)}
        preview={dumpPreview}
        confirming={confirming}
        onClose={clearPreview}
        onConfirm={confirmImport}
      />
    </div>
  );
}
