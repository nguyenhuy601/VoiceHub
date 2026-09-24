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

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

export default function PlanningWorkbookImportPanel({ projectId, canEdit }) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const [dumpText, setDumpText] = useState('');
  const [dumpPreview, setDumpPreview] = useState(null);
  const [pendingXlsxBase64, setPendingXlsxBase64] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);

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

  const downloadTemplate = async (seedFromRa) => {
    try {
      const res = await planningAPI.downloadDumpTemplate(projectId, { seedFromRa });
      const blob = res?.data instanceof Blob ? res.data : new Blob([res?.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = seedFromRa
        ? 'planning-workbook-seed-ra.xlsx'
        : 'planning-workbook-template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(resolveApiErrorMessage(err));
    }
  };

  const confirmImport = async () => {
    if (!pendingXlsxBase64) return;
    setConfirming(true);
    try {
      const res = await planningAPI.bulkDumpArtifacts(projectId, {
        format: 'xlsx',
        base64: pendingXlsxBase64,
        dryRun: false,
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
    } catch (err) {
      toast.error(resolveApiErrorMessage(err));
    } finally {
      setConfirming(false);
    }
  };

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
        <label
          className={`cursor-pointer rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs ${
            uploading ? 'pointer-events-none opacity-50' : ''
          }`}
        >
          {uploading ? t('common.loading') : t('workspace.phase1DumpUploadExcel')}
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            disabled={uploading}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
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
            disabled={!dumpText.trim() || dumpMut.isPending}
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
