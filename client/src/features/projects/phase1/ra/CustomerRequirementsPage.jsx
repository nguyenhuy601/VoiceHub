import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Upload,
  Download,
  Trash2,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  FileStack,
  HelpCircle,
} from 'lucide-react';
import ConfirmDialog from '../../../../components/Shared/ConfirmDialog';
import ReviewNoteDialog from '../../../../components/Shared/ReviewNoteDialog';
import { analysisAPI } from '../../../../services/api/analysisAPI';
import { requirementAPI } from '../../../../services/api/requirementAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';
import Phase1CollapsibleCard from '../shared/Phase1CollapsibleCard';
import Phase1SplitWorkspace from '../shared/Phase1SplitWorkspace';
import ImportSetUploadWizard from './ImportSetUploadWizard';
import ImportSetFileLibrary from './ImportSetFileLibrary';
import { buildPhase1ModulePath } from '../nav/phase1NavConfig';
import { statusBadgeClass, statusRowTintClass, formatPhase1StatusLabel } from '../shared/phase1UiTokens';

const SECTION_SHELL =
  'overflow-hidden rounded-xl border border-[#D9D9D9] bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950';
const SECTION_HEAD =
  'border-b border-[#E8E8E8] bg-[#E8F4FC] px-3.5 py-2.5 dark:border-slate-700 dark:bg-slate-800/80';

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
    {
      key: 'tech',
      label: t('workspace.phase1SetGateTech'),
      done: Boolean(review.tech?.userId || review.tech?.skipped),
    },
    { key: 'po', label: t('workspace.phase1SetGatePo'), done: Boolean(review.po?.userId) },
  ];
  return (
    <ol className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-2">
      {steps.map((s, idx) => (
        <li
          key={s.key}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold ${
            s.done
              ? 'border-[#91CAFF] bg-[#E6F4FF] text-[#1677FF]'
              : 'border-[#E8E8E8] bg-[#FAFAFA] text-muted-foreground'
          }`}
        >
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] ${
              s.done ? 'bg-[#1677FF] text-white' : 'bg-[#E8E8E8] text-[#8C8C8C]'
            }`}
          >
            {s.done ? <CheckCircle2 size={12} aria-hidden /> : idx + 1}
          </span>
          <span className="truncate">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

function approveLabelKey(nextGate) {
  if (nextGate === 'tech_review') return 'workspace.phase1ApproveNextBa';
  if (nextGate === 'po_review') return 'workspace.phase1ApproveNextTech';
  if (nextGate === 'approved') return 'workspace.phase1ApproveNextPo';
  return 'workspace.phase1Approve';
}

/** Cổng duyệt Import Set ≠ quyền upload (BA). */
function canApproveImportSetGate(nextGate, capabilities) {
  if (!nextGate || !capabilities) return false;
  if (nextGate === 'tech_review') return Boolean(capabilities.canReviewAnalysisBa);
  if (nextGate === 'po_review') return Boolean(capabilities.canReviewAnalysisTech);
  if (nextGate === 'approved') return Boolean(capabilities.canReviewAnalysisPo);
  return false;
}

function FileMetaRow({ label, filename, missingLabel }) {
  return (
    <div className="rounded-lg border border-[#E8E8E8] bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8C8C8C]">{label}</p>
      <p className="mt-0.5 break-words text-xs font-medium text-[#262626] dark:text-slate-100">
        {filename || missingLabel}
      </p>
    </div>
  );
}

function ImportSetDetail({
  set,
  t,
  canMutate,
  canGate,
  onTrash,
  onRestore,
  onGateTransition,
  trashPending,
  restorePending,
  gatePending,
  onClose,
}) {
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const isTrash = set.status === 'trashed';
  const isPending = set.status === 'pending_review';
  const isRejected = set.status === 'rejected';
  const nextGate = isPending ? nextImportSetTransition(set) : null;
  const artifactCount = set.artifactCount ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F5F5F5] dark:bg-slate-950">
      {/* Header */}
      <div className="shrink-0 border-b border-[#C9DFF0] bg-[#E8F4FC] px-3.5 py-3 dark:border-slate-700 dark:bg-slate-800/80">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1677FF]">
              {t('workspace.phase1ImportSetDetailTitle')}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className={statusBadgeClass(set.status)}>
                {formatPhase1StatusLabel(set.status, t)}
              </span>
              {isPending ? (
                <span className="text-[11px] text-muted-foreground">
                  {t('workspace.phase1ImportSetWaitingGateShort')}
                </span>
              ) : null}
              {isRejected ? (
                <span className="text-[11px] text-amber-800 dark:text-amber-200">
                  {t('workspace.phase1ImportSetRejectedStatusHint')}
                </span>
              ) : null}
            </div>
          </div>
          {onClose ? (
            <button
              type="button"
              className="shrink-0 rounded-lg border border-[#D9D9D9] bg-white px-2.5 py-1 text-xs font-medium text-[#595959] hover:bg-[#FAFAFA]"
              onClick={onClose}
            >
              {t('common.close')}
            </button>
          ) : null}
        </div>
      </div>

      <div className="scrollbar-overlay min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {/* Files */}
        <section className="overflow-hidden rounded-xl border border-[#D9D9D9] bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-[#E8E8E8] bg-[#E8F4FC] px-3 py-2 dark:border-slate-700 dark:bg-slate-800/80">
            <h3 className="text-xs font-semibold text-[#262626] dark:text-white">
              {t('workspace.phase1ImportSetFilesSection')}
            </h3>
          </div>
          <div className="space-y-2 p-3">
            <FileMetaRow
              label={t('workspace.phase1DocClassRaw')}
              filename={set.rawDocument?.filename}
              missingLabel={t('workspace.phase1ImportSetNoRaw')}
            />
            <FileMetaRow
              label={t('workspace.phase1DocClassAnalysis')}
              filename={set.analysisDocument?.filename}
              missingLabel={t('workspace.phase1ImportSetNoAnalysis')}
            />
            <p className="text-[11px] text-muted-foreground">
              {t('workspace.phase1ImportSetArtifactCount', { count: artifactCount })}
            </p>
          </div>
        </section>

        {isRejected && !isTrash ? (
          <section className="overflow-hidden rounded-xl border border-destructive/30 bg-destructive/5 shadow-sm">
            <div className="space-y-2 p-3">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t('workspace.phase1ImportSetRejectedNextStep')}
              </p>
              {canMutate && onTrash ? (
                <button
                  type="button"
                  disabled={trashPending}
                  className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 bg-white px-2.5 py-1.5 text-xs font-semibold text-destructive disabled:opacity-50"
                  onClick={() => onTrash(set.id)}
                >
                  <Trash2 size={14} aria-hidden />
                  {t('workspace.phase1TrashAfterReject')}
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* Gate progress + actions */}
        {isPending ? (
          <section className="overflow-hidden rounded-xl border border-[#D9D9D9] bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="border-b border-[#E8E8E8] bg-[#E8F4FC] px-3 py-2 dark:border-slate-700 dark:bg-slate-800/80">
              <h3 className="text-xs font-semibold text-[#262626] dark:text-white">
                {t('workspace.phase1SetGateProgress')}
              </h3>
            </div>
            <div className="space-y-3 p-3">
              <SetGateProgress set={set} t={t} />
              <p className="rounded-lg border border-amber-400/35 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100">
                {t('workspace.phase1ImportStagedShort')}
              </p>
              {canGate && nextGate && onGateTransition ? (
                <div className="flex flex-wrap gap-2 border-t border-[#E8E8E8] pt-3 dark:border-slate-700">
                  <button
                    type="button"
                    disabled={gatePending || rejectDialogOpen}
                    className="rounded-lg bg-[#1677FF] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0958D9] disabled:opacity-50"
                    onClick={() => onGateTransition(set.id, nextGate)}
                  >
                    {t(approveLabelKey(nextGate))}
                  </button>
                  <button
                    type="button"
                    disabled={gatePending}
                    className="rounded-lg border border-destructive/40 bg-destructive/5 px-3.5 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    onClick={() => setRejectDialogOpen(true)}
                  >
                    {t('workspace.phase1Reject')}
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {isTrash ? (
          <section className="overflow-hidden rounded-xl border border-[#D9D9D9] bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[11px] text-muted-foreground">
              {set.trashedAt ? new Date(set.trashedAt).toLocaleString() : '—'}
              {set.retentionDaysLeft != null
                ? ` · ${t('workspace.phase1TrashRetentionDays', { days: set.retentionDaysLeft })}`
                : ''}
            </p>
          </section>
        ) : null}

        {/* Help — collapsible, not permanent wall of text */}
        {!isTrash ? (
          <section className="overflow-hidden rounded-xl border border-[#D9D9D9] bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 border-b border-[#E8E8E8] bg-[#E8F4FC] px-3 py-2 text-left dark:border-slate-700 dark:bg-slate-800/80"
              onClick={() => setHelpOpen((v) => !v)}
              aria-expanded={helpOpen}
            >
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#262626] dark:text-white">
                <HelpCircle size={14} className="text-[#1677FF]" aria-hidden />
                {t('workspace.phase1ImportSetHelpTitle')}
              </span>
              <span className="text-xs text-muted-foreground">{helpOpen ? '▾' : '▸'}</span>
            </button>
            {helpOpen ? (
              <ul className="list-disc space-y-1.5 px-3 py-3 pl-7 text-[11px] leading-relaxed text-muted-foreground">
                <li>{t('workspace.phase1ImportSetDraftFixHint')}</li>
                {isPending ? <li>{t('workspace.phase1ImportSetRejectVsTrashHint')}</li> : null}
                {isPending ? <li>{t('workspace.phase1ImportSetWaitingGate')}</li> : null}
              </ul>
            ) : (
              <p className="px-3 py-2 text-[11px] text-muted-foreground">
                {t('workspace.phase1ImportSetHelpSummary')}
              </p>
            )}
          </section>
        ) : null}
      </div>

      {canMutate ? (
        <div className="flex flex-wrap gap-2 border-t border-[#E8E8E8] bg-white px-3.5 py-2.5 dark:border-slate-700 dark:bg-slate-900">
          {isTrash ? (
            <button
              type="button"
              disabled={restorePending}
              className="inline-flex items-center gap-1 rounded-lg border border-[#D9D9D9] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#595959] disabled:opacity-50"
              onClick={() => onRestore(set.id)}
            >
              <RotateCcw size={14} aria-hidden />
              {t('workspace.phase1RestoreImportSet')}
            </button>
          ) : (
            <button
              type="button"
              disabled={trashPending}
              className="inline-flex items-center gap-1 rounded-lg border border-destructive/35 bg-destructive/5 px-2.5 py-1.5 text-xs font-semibold text-destructive disabled:opacity-50"
              onClick={() => onTrash(set.id)}
            >
              <Trash2 size={14} aria-hidden />
              {t('workspace.phase1TrashImportSet')}
            </button>
          )}
        </div>
      ) : null}

      <ReviewNoteDialog
        isOpen={rejectDialogOpen}
        onClose={() => setRejectDialogOpen(false)}
        variant="reject"
        title={t('workspace.phase1RejectTitle')}
        description={t('workspace.phase1RejectDescription')}
        placeholder={t('workspace.phase1ImportSetRejectNotePlaceholder')}
        submitLabel={t('workspace.phase1ConfirmReject')}
        onSubmit={(note) => {
          onGateTransition?.(set.id, 'rejected', note);
        }}
      />
    </div>
  );
}

/**
 * Customer Requirements — Import Set (Raw + Analysis) + trash/restore.
 */
export default function CustomerRequirementsPage({ projectId, organizationId, readOnly = false }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
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
  const [wizardOpen, setWizardOpen] = useState(false);

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
    mutationFn: ({ setId, toStatus, note }) =>
      analysisAPI.transitionImportSet(projectId, setId, {
        toStatus,
        ...(note ? { note } : {}),
      }),
    onSuccess: (res, vars) => {
      const data = unwrap(res);
      const st = String(data?.status || '');
      if (st === 'active') {
        toast.success(t('workspace.phase1ImportSetGateOkActive'));
      } else if (vars?.toStatus === 'rejected' || st === 'rejected') {
        toast.success(t('workspace.phase1ImportSetRejectedToast'));
      } else if (vars?.toStatus === 'tech_review') {
        toast.success(t('workspace.phase1ImportSetGateOkBa'));
      } else if (vars?.toStatus === 'po_review') {
        toast.success(t('workspace.phase1ImportSetGateOkTech'));
      } else {
        toast.success(t('workspace.phase1TransitionOk'));
      }
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
    <div className="scrollbar-overlay flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      {/* Header + actions */}
      <section className={SECTION_SHELL}>
        <div className={SECTION_HEAD}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-[#262626] dark:text-white">
                {t('workspace.phaseNavCustomerDocuments')}
              </h1>
              <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-muted-foreground">
                {t('workspace.phase1CustomerDocsHintShort')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {canDownload ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#D9D9D9] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#595959] disabled:opacity-50"
                    onClick={() => onDownloadTemplate('raw', 'Customer_Requirement_Raw.xlsx')}
                  >
                    <Download size={12} aria-hidden />
                    {t('workspace.phase1DownloadRawTemplate')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#D9D9D9] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#595959] disabled:opacity-50"
                    onClick={() =>
                      onDownloadTemplate('analysis', 'Requirement_Analysis.xlsx')
                    }
                  >
                    <Download size={12} aria-hidden />
                    {t('workspace.phase1DownloadAnalysisTemplate')}
                  </button>
                </>
              ) : null}
              {canUpload ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#1677FF] px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                    onClick={() => setWizardOpen(true)}
                  >
                    <Upload size={12} aria-hidden />
                    {t('workspace.phase1ImportWizardOpen')}
                  </button>
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
                </>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <Phase1CollapsibleCard
        title={
          <span className="inline-flex items-center gap-1.5">
            <HelpCircle size={14} className="text-[#1677FF]" aria-hidden />
            {t('workspace.phase1CustomerDocsHelpTitle')}
          </span>
        }
        summary={t('workspace.phase1CustomerDocsHelpSummary')}
        defaultOpen={false}
        toneClass="border-[#D9D9D9] bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950"
      >
        <ul className="list-disc space-y-1.5 pl-4 text-[11px] leading-relaxed text-muted-foreground">
          <li>{t('workspace.phase1CustomerDocsHint')}</li>
          <li>{t('workspace.phase1ImportSetDraftFixHint')}</li>
          <li>{t('workspace.phase1FileLibraryHint')}</li>
          {activeSet && listFilter === 'live' ? (
            <li>{t('workspace.phase1DoubleGateHint')}</li>
          ) : null}
        </ul>
      </Phase1CollapsibleCard>

      {preview ? (
        <section className={SECTION_SHELL}>
          <div className={SECTION_HEAD}>
            <h2 className="text-xs font-semibold">{t('workspace.phase1ImportPreview')}</h2>
          </div>
          <div className="space-y-2 px-3.5 py-3">
            <p className="text-[11px] text-muted-foreground">
              {preview.pendingFileName || preview.fileName} · errors={preview.errorCount} ·
              warnings={preview.warningCount}
            </p>
            {Array.isArray(preview.issues) && preview.issues.length ? (
              <ul className="max-h-24 overflow-y-auto text-[11px] text-muted-foreground">
                {preview.issues.slice(0, 12).map((iss, i) => (
                  <li key={`${iss.code}-${i}`}>
                    [{iss.severity}] {iss.message}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg border border-border px-2.5 py-1 text-xs"
                onClick={() => setPreview(null)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={preview.errorCount > 0 || confirmMut.isPending || !preview.sessionId}
                className="rounded-lg bg-[#1677FF] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                onClick={() => confirmMut.mutate()}
              >
                {t('workspace.phase1ConfirmImport')}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {listFilter === 'live' ? (
        <ImportSetFileLibrary projectId={projectId} importSets={sets} />
      ) : null}

      {/* Import Set queue */}
      <section className={`${SECTION_SHELL} flex min-h-0 flex-1 flex-col`}>
        <div className={`${SECTION_HEAD} flex flex-wrap items-center justify-between gap-2`}>
          <h2 className="flex items-center gap-2 text-xs font-semibold text-[#262626] dark:text-white">
            <FileStack size={14} className="text-[#1677FF]" aria-hidden />
            {t('workspace.phase1SectionImportSets')}
          </h2>
          <div className="flex gap-1 rounded-lg border border-[#C9DFF0] bg-white p-0.5 dark:border-slate-600 dark:bg-slate-900">
            <button
              type="button"
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                listFilter === 'live'
                  ? 'bg-[#1677FF] text-white'
                  : 'text-muted-foreground hover:text-foreground'
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
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                listFilter === 'trash'
                  ? 'bg-[#1677FF] text-white'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => {
                setListFilter('trash');
                setSelectedSetId(null);
              }}
            >
              {t('workspace.phase1TrashImportSets')} ({trashSets.length})
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-3.5 py-3">
          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : null}

          {!isLoading && !displaySets.length ? (
            <p className="rounded-lg border border-dashed border-border/60 px-3 py-8 text-center text-sm text-muted-foreground">
              {listFilter === 'trash'
                ? t('workspace.phase1TrashEmpty')
                : t('workspace.phase1NoActiveImportSet')}
            </p>
          ) : null}

          {displaySets.length > 0 ? (
            <ul className="space-y-2">
              {displaySets.map((s) => {
                const selected = s.id === selectedSetId;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                        selected
                          ? 'border-[#1677FF] bg-[#E6F4FF] shadow-sm'
                          : 'border-[#E8E8E8] bg-[#FAFAFA] hover:border-[#91CAFF] hover:bg-[#E6F4FF]/40'
                      } ${statusRowTintClass(s.status)}`}
                      onClick={() => setSelectedSetId(s.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={statusBadgeClass(s.status)}>
                            {formatPhase1StatusLabel(s.status, t)}
                          </span>
                          {typeof s.artifactCount === 'number' ? (
                            <span className="text-[10px] text-muted-foreground">
                              {t('workspace.phase1ImportSetArtifactCount', {
                                count: s.artifactCount,
                              })}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-xs font-medium text-foreground">
                          {s.rawDocument?.filename || t('workspace.phase1ImportSetNoRaw')}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {s.analysisDocument?.filename ||
                            t('workspace.phase1ImportSetNoAnalysis')}
                        </p>
                        {s.status === 'draft' && !s.rawDocument?.filename ? (
                          <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">
                            {t('workspace.phase1ImportSetIncompleteHint')}
                          </p>
                        ) : null}
                      </div>
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 ${selected ? 'text-[#1677FF]' : 'text-muted-foreground'}`}
                        aria-hidden
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </section>
    </div>
  );

  const detailPane = selectedSet ? (
    <ImportSetDetail
      set={selectedSet}
      t={t}
      canMutate={canUpload}
      canGate={
        !readOnly &&
        canApproveImportSetGate(nextImportSetTransition(selectedSet), capabilities)
      }
      onTrash={(id) => trashMut.mutate(id)}
      onRestore={(id) => onRequestRestore(id)}
      onGateTransition={(id, toStatus, note) =>
        gateMut.mutate({ setId: id, toStatus, note })
      }
      trashPending={trashMut.isPending}
      restorePending={restoreMut.isPending}
      gatePending={gateMut.isPending}
      onClose={() => setSelectedSetId(null)}
    />
  ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4">
      <ImportSetUploadWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        projectId={projectId}
        organizationId={organizationId}
        draftSet={draftSet}
        onCompleted={() => invalidateSets()}
        onOpenReviews={() => {
          invalidateSets();
          navigate(buildPhase1ModulePath(projectId, 'analysis-reviews', { organizationId }));
        }}
      />
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
