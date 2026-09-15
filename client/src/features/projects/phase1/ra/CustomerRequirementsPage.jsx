import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Upload, FileText, Download, Trash2, RotateCcw } from 'lucide-react';
import { analysisAPI } from '../../../../services/api/analysisAPI';
import { requirementAPI } from '../../../../services/api/requirementAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

async function downloadBlobAsFile(blobLike, fileName, t, skFail) {
  const blob =
    blobLike instanceof Blob
      ? blobLike
      : new Blob([blobLike?.data ?? blobLike], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
  if (blob.type && blob.type.includes('application/json')) {
    const text = await blob.text();
    let msg = skFail;
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

function ImportSetCard({
  set,
  t,
  canMutate,
  onTrash,
  onRestore,
  trashPending,
  restorePending,
}) {
  const isTrash = set.status === 'trashed';
  return (
    <li className="flex flex-col gap-2 border-b border-border px-4 py-3 text-sm last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">
          {t('workspace.phase1ImportSetStatus')}: {set.status}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          Raw: {set.rawDocument?.filename || '—'} · Analysis:{' '}
          {set.analysisDocument?.filename || '—'} · artifacts={set.artifactCount ?? 0}
        </p>
      </div>
      {canMutate ? (
        <div className="flex shrink-0 gap-2">
          {isTrash ? (
            <button
              type="button"
              disabled={restorePending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium"
              onClick={() => onRestore(set.id)}
            >
              <RotateCcw size={14} />
              {t('workspace.phase1RestoreImportSet')}
            </button>
          ) : (
            <button
              type="button"
              disabled={trashPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-destructive"
              onClick={() => onTrash(set.id)}
            >
              <Trash2 size={14} />
              {t('workspace.phase1TrashImportSet')}
            </button>
          )}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Customer Requirements — Import Set (Raw + Analysis) + trash/restore.
 */
export default function CustomerRequirementsPage({ projectId, organizationId, readOnly = false }) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const rawRef = useRef(null);
  const analysisRef = useRef(null);
  const { capabilities } = useProjectCapabilities(projectId);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const canUpload = capabilities.canImportAnalysis && !readOnly;
  const canDownload = Boolean(organizationId);

  const invalidateSets = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['analysisImportSets', projectId] });
    queryClient.invalidateQueries({ queryKey: ['customerDocuments', projectId] });
    queryClient.invalidateQueries({ queryKey: ['analysisArtifacts', projectId] });
    queryClient.invalidateQueries({ queryKey: ['projectAnalysisGaps', projectId] });
  }, [projectId, queryClient]);

  const { data: sets = [], isLoading } = useQuery({
    queryKey: ['analysisImportSets', projectId],
    queryFn: async () => {
      const raw = unwrap(await analysisAPI.listImportSets(projectId));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const activeSet = useMemo(() => sets.find((s) => s.status === 'active') || null, [sets]);
  const draftSet = useMemo(() => sets.find((s) => s.status === 'draft') || null, [sets]);
  const trashSets = useMemo(() => sets.filter((s) => s.status === 'trashed'), [sets]);

  const onDownloadTemplate = useCallback(
    async (variant, fileName) => {
      if (!organizationId || busy) return;
      setBusy(true);
      try {
        const res = await requirementAPI.downloadTemplate(organizationId, { variant });
        await downloadBlobAsFile(res, fileName, t, t('workspace.phase1DownloadTemplateFail'));
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
        await analysisAPI.attachRawImportSet(projectId, file);
        toast.success(t('workspace.phase1RawAttached'));
        invalidateSets();
      } catch (err) {
        toast.error(resolveApiErrorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [invalidateSets, projectId, t]
  );

  const onPickAnalysis = useCallback(
    async (file) => {
      if (!file || !organizationId) return;
      const hasRaw = Boolean(draftSet?.rawDocument?.filename || draftSet?.rawDocumentId);
      if (!hasRaw) {
        toast.error(t('workspace.phase1NeedRawFirst'));
        return;
      }
      setBusy(true);
      try {
        const prev = unwrap(await requirementAPI.previewImport(organizationId, file));
        if (prev?.templateType && prev.templateType !== 'RequirementAnalysis') {
          toast.error(t('workspace.phase1ExpectAnalysisFile'));
          return;
        }
        setPreview({
          ...prev,
          importSetId: draftSet?.id || null,
          pendingFileName: file.name,
        });
        toast.success(t('workspace.phase1ImportPreviewReady'));
      } catch (err) {
        toast.error(resolveApiErrorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [draftSet, organizationId, t]
  );

  const confirmMut = useMutation({
    mutationFn: async () => {
      if (!preview?.sessionId) {
        throw new Error(t('common.saveFail'));
      }
      return analysisAPI.confirmAnalysisImport(projectId, {
        sessionId: preview.sessionId,
        importSetId: preview.importSetId || draftSet?.id || undefined,
      });
    },
    onSuccess: (res) => {
      const data = unwrap(res);
      toast.success(t('workspace.phase1ImportDone', { count: data?.seeded || 0 }));
      setPreview(null);
      invalidateSets();
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const trashMut = useMutation({
    mutationFn: (setId) => analysisAPI.trashImportSet(projectId, setId),
    onSuccess: () => {
      toast.success(t('workspace.phase1ImportSetTrashed'));
      invalidateSets();
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const restoreMut = useMutation({
    mutationFn: (setId) => analysisAPI.restoreImportSet(projectId, setId),
    onSuccess: () => {
      toast.success(t('workspace.phase1ImportSetRestored'));
      invalidateSets();
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            {t('workspace.phaseNavCustomerDocuments')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('workspace.phase1CustomerDocsHint')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canDownload ? (
            <>
              <button
                type="button"
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground disabled:opacity-50"
                onClick={() => onDownloadTemplate('raw', 'Customer_Requirement_Raw.xlsx')}
              >
                <Download size={16} />
                {t('workspace.phase1DownloadRawTemplate')}
              </button>
              <button
                type="button"
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground disabled:opacity-50"
                onClick={() => onDownloadTemplate('analysis', 'Requirement_Analysis.xlsx')}
              >
                <Download size={16} />
                {t('workspace.phase1DownloadAnalysisTemplate')}
              </button>
            </>
          ) : null}
          {canUpload ? (
            <>
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
                disabled={busy || Boolean(draftSet?.rawDocument?.filename)}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium disabled:opacity-50"
                onClick={() => rawRef.current?.click()}
              >
                <Upload size={16} />
                {busy ? t('common.loading') : t('workspace.phase1UploadRaw')}
              </button>
              <button
                type="button"
                disabled={busy || !draftSet?.rawDocument?.filename}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                onClick={() => analysisRef.current?.click()}
              >
                <Upload size={16} />
                {t('workspace.phase1UploadAnalysis')}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {preview ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          <h2 className="font-semibold">{t('workspace.phase1ImportPreview')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {preview.pendingFileName || preview.fileName} · errors={preview.errorCount} ·
            warnings={preview.warningCount}
          </p>
          {Array.isArray(preview.issues) && preview.issues.length ? (
            <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-muted-foreground">
              {preview.issues.slice(0, 20).map((iss, i) => (
                <li key={`${iss.code}-${i}`}>
                  [{iss.severity}] {iss.message}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-1.5 text-sm"
              onClick={() => setPreview(null)}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={preview.errorCount > 0 || confirmMut.isPending || !preview.sessionId}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
              onClick={() => confirmMut.mutate()}
            >
              {t('workspace.phase1ConfirmImport')}
            </button>
          </div>
        </div>
      ) : null}

      <section className="rounded-xl border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-2 text-sm font-semibold">
          {t('workspace.phase1ActiveImportSet')}
        </h2>
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : activeSet ? (
          <ul>
            <ImportSetCard
              set={activeSet}
              t={t}
              canMutate={canUpload}
              onTrash={(id) => trashMut.mutate(id)}
              onRestore={() => {}}
              trashPending={trashMut.isPending}
              restorePending={false}
            />
          </ul>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {t('workspace.phase1NoActiveImportSet')}
          </p>
        )}
      </section>

      {draftSet ? (
        <section className="rounded-xl border border-border bg-surface">
          <h2 className="border-b border-border px-4 py-2 text-sm font-semibold">
            {t('workspace.phase1DraftImportSet')}
          </h2>
          <ul>
            <ImportSetCard
              set={draftSet}
              t={t}
              canMutate={canUpload}
              onTrash={(id) => trashMut.mutate(id)}
              onRestore={() => {}}
              trashPending={trashMut.isPending}
              restorePending={false}
            />
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-2 text-sm font-semibold">
          {t('workspace.phase1TrashImportSets')}
        </h2>
        {trashSets.length ? (
          <ul>
            {trashSets.map((s) => (
              <ImportSetCard
                key={s.id}
                set={s}
                t={t}
                canMutate={canUpload}
                onTrash={() => {}}
                onRestore={(id) => restoreMut.mutate(id)}
                trashPending={false}
                restorePending={restoreMut.isPending}
              />
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 px-4 py-6 text-center text-sm text-muted-foreground">
            <FileText size={16} className="mx-auto opacity-0" aria-hidden />
            {t('workspace.phase1TrashEmpty')}
          </p>
        )}
      </section>
    </div>
  );
}
