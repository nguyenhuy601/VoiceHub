import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Upload, Download, Trash2, RotateCcw, CheckCircle2 } from 'lucide-react';
import ConfirmDialog from '../../../../components/Shared/ConfirmDialog';
import { analysisAPI } from '../../../../services/api/analysisAPI';
import { requirementAPI } from '../../../../services/api/requirementAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';
import Phase1SplitWorkspace from '../shared/Phase1SplitWorkspace';
import {
  PHASE1_DENSE_ROW,
  PHASE1_DENSE_ROW_SELECTED,
} from '../shared/phase1ListDensity';
import { statusBadgeClass, statusRowTintClass } from '../shared/phase1UiTokens';

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

function nextImportSetTransition(set) {
  const review = set?.review || {};
  if (!review.ba?.userId) return 'tech_review';
  if (!review.tech?.userId) return 'po_review';
  // PO stamp may exist after a timed-out publish while status stays pending_review.
  return 'approved';
}

function SetGateProgress({ set, t }) {
  const review = set?.review || {};
  const steps = [
    { key: 'ba', label: t('workspace.phase1SetGateBa'), done: Boolean(review.ba?.userId) },
    { key: 'tech', label: t('workspace.phase1SetGateTech'), done: Boolean(review.tech?.userId) },
    { key: 'po', label: t('workspace.phase1SetGatePo'), done: Boolean(review.po?.userId) },
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {steps.map((s) => (
        <span
          key={s.key}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
            s.done ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          }`}
        >
          {s.done ? <CheckCircle2 size={12} /> : null}
          {s.label}
        </span>
      ))}
    </div>
  );
}

function ImportSetDetail({
  set,
  t,
  canMutate,
  onTrash,
  onRestore,
  onGateTransition,
  trashPending,
  restorePending,
  gatePending,
  onClose,
}) {
  const isTrash = set.status === 'trashed';
  const isPending = set.status === 'pending_review';
  const nextGate = isPending ? nextImportSetTransition(set) : null;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            {t('workspace.phase1ImportSetStatus')}
          </p>
          <span className={`mt-1 ${statusBadgeClass(set.status)}`}>{set.status}</span>
        </div>
        {onClose ? (
          <button
            type="button"
            className="rounded border border-border px-2 py-0.5 text-xs"
            onClick={onClose}
          >
            {t('common.close')}
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 text-sm">
        {!isTrash ? (
          <p className="rounded-md border border-border/80 bg-muted/20 p-2 text-[11px] text-muted-foreground">
            {t('workspace.phase1ImportSetDraftFixHint')}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Raw: {set.rawDocument?.filename || '—'}
        </p>
        <p className="text-xs text-muted-foreground">
          Analysis: {set.analysisDocument?.filename || '—'}
        </p>
        <p className="text-xs text-muted-foreground">artifacts={set.artifactCount ?? 0}</p>
        {isPending ? (
          <>
            <p className="text-xs text-muted-foreground">{t('workspace.phase1SetGateProgress')}</p>
            <SetGateProgress set={set} t={t} />
          </>
        ) : null}
        {isTrash ? (
          <p className="text-xs text-muted-foreground">
            {set.trashedAt ? new Date(set.trashedAt).toLocaleString() : '—'}
            {set.retentionDaysLeft != null
              ? ` · ${t('workspace.phase1TrashRetentionDays', { days: set.retentionDaysLeft })}`
              : ''}
          </p>
        ) : null}
      </div>
      {canMutate ? (
        <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2">
          {isPending && nextGate && onGateTransition ? (
            <>
              <button
                type="button"
                disabled={gatePending}
                className="rounded border border-border px-2 py-1 text-xs font-medium"
                onClick={() => onGateTransition(set.id, nextGate)}
              >
                {t('workspace.phase1Approve')}
              </button>
              <button
                type="button"
                disabled={gatePending}
                className="rounded border border-destructive/40 px-2 py-1 text-xs font-medium text-destructive"
                onClick={() => onGateTransition(set.id, 'rejected')}
              >
                {t('workspace.phase1Reject')}
              </button>
            </>
          ) : null}
          {isTrash ? (
            <button
              type="button"
              disabled={restorePending}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-medium"
              onClick={() => onRestore(set.id)}
            >
              <RotateCcw size={14} />
              {t('workspace.phase1RestoreImportSet')}
            </button>
          ) : (
            <button
              type="button"
              disabled={trashPending}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-medium text-destructive"
              onClick={() => onTrash(set.id)}
            >
              <Trash2 size={14} />
              {t('workspace.phase1TrashImportSet')}
            </button>
          )}
        </div>
      ) : null}
    </div>
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
  const [rollbackDiff, setRollbackDiff] = useState(null);
  const [rollbackSetId, setRollbackSetId] = useState(null);
  const [selectedSetId, setSelectedSetId] = useState(null);
  const [listFilter, setListFilter] = useState('live'); // live | trash

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
  /** Raw đã gắn trên draft set (filename hoặc id — tránh khóa Analysis khi enrich thiếu filename). */
  const hasDraftRaw = Boolean(
    draftSet?.rawDocument?.filename ||
      draftSet?.rawDocument?.id ||
      draftSet?.rawDocumentId
  );

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
        const attached = unwrap(await analysisAPI.attachRawImportSet(projectId, file));
        toast.success(t('workspace.phase1RawAttached'));
        if (attached?.id) {
          queryClient.setQueryData(['analysisImportSets', projectId], (prev) => {
            const list = Array.isArray(prev) ? prev : [];
            const withoutDraft = list.filter((s) => s.status !== 'draft' && s.id !== attached.id);
            return [...withoutDraft, attached];
          });
        }
        invalidateSets();
      } catch (err) {
        toast.error(resolveApiErrorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [invalidateSets, projectId, queryClient, t]
  );

  const onPickAnalysis = useCallback(
    async (file) => {
      if (!file || !projectId) return;
      const rawReady = Boolean(
        draftSet?.rawDocument?.filename ||
          draftSet?.rawDocument?.id ||
          draftSet?.rawDocumentId
      );
      if (!rawReady) {
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
    [draftSet, projectId, t]
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
      if (data?.gateEnabled && data?.importSetStatus === 'pending_review') {
        toast.success(t('workspace.phase1ImportStaged'));
      } else {
        toast.success(t('workspace.phase1ImportDone', { count: data?.seeded || 0 }));
      }
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
      setRollbackDiff(null);
      setRollbackSetId(null);
      invalidateSets();
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const gateMut = useMutation({
    mutationFn: ({ setId, toStatus }) =>
      analysisAPI.transitionImportSet(projectId, setId, { toStatus }),
    onSuccess: () => {
      toast.success(t('workspace.phase1TransitionOk'));
      invalidateSets();
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const onRequestRestore = useCallback(
    async (setId) => {
      try {
        const diff = unwrap(await analysisAPI.getImportSetDiff(projectId, setId));
        setRollbackSetId(setId);
        setRollbackDiff(diff);
      } catch (err) {
        toast.error(resolveApiErrorMessage(err));
      }
    },
    [projectId]
  );

  const liveSets = useMemo(() => {
    const order = ['active', 'draft', 'pending_review', 'rejected'];
    return [...sets]
      .filter((s) => s.status !== 'trashed')
      .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  }, [sets]);

  const displaySets = listFilter === 'trash' ? trashSets : liveSets;
  const selectedSet = useMemo(
    () => displaySets.find((s) => s.id === selectedSetId) || null,
    [displaySets, selectedSetId]
  );

  const listPane = (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground">
            {t('workspace.phaseNavCustomerDocuments')}
          </h1>
          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
            {t('workspace.phase1CustomerDocsHint')}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
            {t('workspace.phase1ImportSetDraftFixHint')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {canDownload ? (
            <>
              <button
                type="button"
                disabled={busy}
                className="inline-flex items-center gap-1 rounded border border-border bg-surface px-2 py-1 text-[11px] font-medium disabled:opacity-50"
                onClick={() => onDownloadTemplate('raw', 'Customer_Requirement_Raw.xlsx')}
              >
                <Download size={12} />
                {t('workspace.phase1DownloadRawTemplate')}
              </button>
              <button
                type="button"
                disabled={busy}
                className="inline-flex items-center gap-1 rounded border border-border bg-surface px-2 py-1 text-[11px] font-medium disabled:opacity-50"
                onClick={() => onDownloadTemplate('analysis', 'Requirement_Analysis.xlsx')}
              >
                <Download size={12} />
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
                disabled={busy || hasDraftRaw}
                title={hasDraftRaw ? t('workspace.phase1RawAlreadyAttached') : undefined}
                className="inline-flex items-center gap-1 rounded border border-border bg-surface px-2 py-1 text-[11px] font-medium disabled:opacity-50"
                onClick={() => rawRef.current?.click()}
              >
                <Upload size={12} />
                {busy ? t('common.loading') : t('workspace.phase1UploadRaw')}
              </button>
              <button
                type="button"
                disabled={busy || !hasDraftRaw}
                title={!hasDraftRaw ? t('workspace.phase1NeedRawFirst') : undefined}
                className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
                onClick={() => analysisRef.current?.click()}
              >
                <Upload size={12} />
                {t('workspace.phase1UploadAnalysis')}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {preview ? (
        <div className="rounded-lg border border-border bg-surface p-2.5">
          <h2 className="text-xs font-semibold">{t('workspace.phase1ImportPreview')}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {preview.pendingFileName || preview.fileName} · errors={preview.errorCount} ·
            warnings={preview.warningCount}
          </p>
          {Array.isArray(preview.issues) && preview.issues.length ? (
            <ul className="mt-1 max-h-24 overflow-y-auto text-[11px] text-muted-foreground">
              {preview.issues.slice(0, 12).map((iss, i) => (
                <li key={`${iss.code}-${i}`}>
                  [{iss.severity}] {iss.message}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded border border-border px-2 py-1 text-xs"
              onClick={() => setPreview(null)}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={preview.errorCount > 0 || confirmMut.isPending || !preview.sessionId}
              className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
              onClick={() => confirmMut.mutate()}
            >
              {t('workspace.phase1ConfirmImport')}
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex gap-1">
        <button
          type="button"
          className={`rounded px-2 py-0.5 text-[11px] ${
            listFilter === 'live' ? 'bg-primary/15 text-primary' : 'text-muted-foreground'
          }`}
          onClick={() => {
            setListFilter('live');
            setSelectedSetId(null);
          }}
        >
          {t('workspace.phase1ActiveImportSet')} ({liveSets.length})
        </button>
        <button
          type="button"
          className={`rounded px-2 py-0.5 text-[11px] ${
            listFilter === 'trash' ? 'bg-primary/15 text-primary' : 'text-muted-foreground'
          }`}
          onClick={() => {
            setListFilter('trash');
            setSelectedSetId(null);
          }}
        >
          {t('workspace.phase1TrashImportSets')} ({trashSets.length})
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-surface">
        <ul>
          {displaySets.map((s) => {
            const selected = s.id === selectedSetId;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={`flex w-full flex-col items-start gap-0.5 px-2.5 py-1.5 text-left ${PHASE1_DENSE_ROW} ${
                    selected ? PHASE1_DENSE_ROW_SELECTED : ''
                  } ${statusRowTintClass(s.status)}`}
                  onClick={() => setSelectedSetId(s.id)}
                >
                  <span className={statusBadgeClass(s.status)}>{s.status}</span>
                  <span className="w-full truncate text-[11px] text-muted-foreground">
                    {s.rawDocument?.filename || '—'} · {s.analysisDocument?.filename || '—'}
                  </span>
                </button>
              </li>
            );
          })}
          {!isLoading && !displaySets.length ? (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">
              {listFilter === 'trash'
                ? t('workspace.phase1TrashEmpty')
                : t('workspace.phase1NoActiveImportSet')}
            </li>
          ) : null}
        </ul>
      </div>

      {activeSet && listFilter === 'live' ? (
        <p className="text-[11px] text-muted-foreground">{t('workspace.phase1DoubleGateHint')}</p>
      ) : null}
    </div>
  );

  const detailPane = selectedSet ? (
    <ImportSetDetail
      set={selectedSet}
      t={t}
      canMutate={canUpload}
      onTrash={(id) => trashMut.mutate(id)}
      onRestore={(id) => onRequestRestore(id)}
      onGateTransition={(id, toStatus) => gateMut.mutate({ setId: id, toStatus })}
      trashPending={trashMut.isPending}
      restorePending={restoreMut.isPending}
      gatePending={gateMut.isPending}
      onClose={() => setSelectedSetId(null)}
    />
  ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4">
      <ConfirmDialog
        isOpen={Boolean(rollbackDiff && rollbackSetId)}
        title={t('workspace.phase1RollbackConfirmTitle')}
        message={
          rollbackDiff
            ? `${t('workspace.phase1RollbackDiffHint')} ${t('workspace.phase1RollbackManualEdited', {
                count: rollbackDiff.manualEditedArtifacts?.length || 0,
              })}`
            : ''
        }
        confirmText={t('workspace.phase1RestoreImportSet')}
        cancelText={t('common.cancel')}
        onConfirm={() => {
          if (rollbackSetId) restoreMut.mutate(rollbackSetId);
        }}
        onClose={() => {
          setRollbackDiff(null);
          setRollbackSetId(null);
        }}
      />
      <Phase1SplitWorkspace
        list={listPane}
        detail={detailPane}
        hasSelection={Boolean(selectedSet)}
        onCloseDetail={() => setSelectedSetId(null)}
      />
    </div>
  );
}
