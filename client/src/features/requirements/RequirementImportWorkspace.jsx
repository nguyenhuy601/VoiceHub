import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileDown,
  FolderPlus,
  Send,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

import {
  AdminUserFormCard,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import GradientButton from '../../components/Shared/GradientButton';
import Modal from '../../components/Shared/Modal';
import ConfirmDialog from '../../components/Shared/ConfirmDialog';
import {
  FIGMA_PAGE_CARD,
  FIGMA_PAGE_SUBTITLE,
  FIGMA_PAGE_TITLE,
} from '../../components/Layout/figmaPageClasses';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { buildProjectsNewAiPath } from '../../utils/suitePathUtils';
import { requirementAPI } from '../../services/api/requirementAPI';
import RequirementPreviewTabs from './RequirementPreviewTabs';
import RequirementPackReviewDrawer from './RequirementPackReviewDrawer';
import { canConfirmRequirementImport, getConfirmImportLabelKey, isPackWhatReady } from '../../utils/requirementImportReadiness';
import useRequirementPacks from '../../hooks/useRequirementPacks';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function PlanningScoreBadge({ readiness, t }) {
  const score = readiness?.score;
  if (score == null) return null;
  const canSubmit = isPackWhatReady(readiness);
  const tone = !canSubmit
    ? 'bg-destructive/15 text-destructive'
    : score >= 80
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      : 'bg-amber-500/15 text-amber-800 dark:text-amber-200';
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
      title={canSubmit ? undefined : t('requirements.planningNotReady')}
    >
      {t('requirements.planningScore', { score })}
    </span>
  );
}

function canSubmitPackForReview(pack) {
  return isPackWhatReady(pack?.planningReadiness);
}

const PACK_ROW_ACTION_BASE =
  'inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium leading-none transition disabled:cursor-not-allowed disabled:opacity-40';

function packRowActionClass(variant = 'default') {
  if (variant === 'success') {
    return `${PACK_ROW_ACTION_BASE} border-emerald-500/35 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300`;
  }
  if (variant === 'danger') {
    return `${PACK_ROW_ACTION_BASE} border-destructive/35 bg-destructive/10 text-destructive hover:bg-destructive/15`;
  }
  return `${PACK_ROW_ACTION_BASE} border-border bg-background text-foreground hover:bg-muted/50`;
}

function PackRowActionButton({ variant = 'default', className = '', children, ...props }) {
  return (
    <button type="button" className={`${packRowActionClass(variant)} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

function PackStatusBadge({ status, t }) {
  const key = String(status || 'draft');
  const tone =
    key === 'approved' || key === 'project_linked'
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      : key === 'under_review'
        ? 'bg-amber-500/15 text-amber-800 dark:text-amber-200'
        : key === 'rejected'
          ? 'bg-destructive/15 text-destructive'
          : 'bg-muted text-muted-foreground';
  const label = t(`requirements.status.${key}`);
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}

function stringKey(variant, suffix) {
  return variant === 'admin' ? `adminDomains.requirements.${suffix}` : `requirements.${suffix}`;
}

const PACK_LIST_PAGE_SIZE = 5;

const PACK_STATUS_FILTERS = Object.freeze([
  '',
  'draft',
  'under_review',
  'approved',
  'rejected',
  'project_linked',
]);

export default function RequirementImportWorkspace({
  orgId,
  variant = 'collaborate',
  canSubmit = true,
  canApprove = false,
  canCreateFromPack = false,
  canRunAiPlanning = false,
  setHeaderActions,
}) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const isAdmin = variant === 'admin';
  const sk = (suffix) => stringKey(variant, suffix);
  const showImportSection = isAdmin || canSubmit;
  const fileInputRef = useRef(null);
  const filtersRef = useRef(null);

  const [busy, setBusy] = useState(false);
  const [actionPackId, setActionPackId] = useState('');
  const [preview, setPreview] = useState(null);
  const [reviewPackId, setReviewPackId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { packs, invalidateAllForOrg } = useRequirementPacks(orgId);
  const loadPacks = invalidateAllForOrg;

  const previewLabels = {
    parsedOk: t('requirements.parsedOk'),
    parsedFail: t('requirements.parsedFail'),
    meta: t('requirements.previewMeta'),
    previewNoIssues: t('requirements.previewNoIssues'),
    fixHintColumn: t('requirements.fixHintColumn'),
    sheetIssueBanner: t('requirements.sheetIssueBanner'),
    noIssuesOnSheet: t('requirements.noIssuesOnSheet'),
    emptyExcel: t('requirements.noExcelPreview'),
    derivedFromPackHint: t('requirements.derivedFromPackHint'),
    planningScore: t('requirements.planningScore'),
    planningNotReady: t('requirements.planningNotReady'),
    previewPlanningLowScore: t('requirements.previewPlanningLowScore'),
  };

  const downloadTemplate = useCallback(async () => {
    if (!orgId || busy) return;
    setBusy(true);
    try {
      const res = await requirementAPI.downloadTemplate(orgId);
      const blob =
        res instanceof Blob
          ? res
          : new Blob([res?.data ?? res], {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
      if (blob.type && blob.type.includes('application/json')) {
        const text = await blob.text();
        let msg = t(sk('downloadFail'));
        try {
          const parsed = JSON.parse(text);
          msg = parsed.message || msg;
        } catch {
          /* ignore */
        }
        toast.error(msg);
        return;
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Requirement_Template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t(sk('downloadFail')) }));
    } finally {
      setBusy(false);
    }
  }, [busy, orgId, sk, t]);

  const runPreview = useCallback(
    async (fileOverride) => {
      const target = fileOverride ?? null;
      if (!orgId || !target || busy) return;
      setBusy(true);
      setPreview(null);
      try {
      const res = await requirementAPI.previewImport(orgId, target);
      const data = unwrap(res);
      setPreview(data);
      } catch (error) {
        toast.error(resolveApiErrorMessage(error, { t, fallback: t(sk('previewFail')) }));
      } finally {
        setBusy(false);
      }
    },
    [busy, orgId, sk, t]
  );

  const handleFileChange = useCallback(
    async (event) => {
      const nextFile = event.target.files?.[0] || null;
      event.target.value = '';
      if (nextFile) {
        await runPreview(nextFile);
      }
    },
    [runPreview]
  );

  const filteredPacks = useMemo(() => {
    if (!statusFilter) return packs;
    return packs.filter((pack) => String(pack.status || 'draft') === statusFilter);
  }, [packs, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredPacks.length / PACK_LIST_PAGE_SIZE) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pagedPacks = useMemo(() => {
    const start = (safePage - 1) * PACK_LIST_PAGE_SIZE;
    return filteredPacks.slice(start, start + PACK_LIST_PAGE_SIZE);
  }, [filteredPacks, safePage]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, packs.length]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    if (!filtersOpen) return undefined;
    const onDoc = (e) => {
      if (filtersRef.current && !filtersRef.current.contains(e.target)) {
        setFiltersOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setFiltersOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [filtersOpen]);

  const confirmImport = async () => {
    if (!orgId || !preview?.sessionId || busy || !canConfirmRequirementImport(preview)) return;
    setBusy(true);
    try {
      await requirementAPI.confirmImport(orgId, preview.sessionId);
      toast.success(t(sk('importSuccess')));
      setPreview(null);
      await loadPacks();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t(sk('importFail')) }));
    } finally {
      setBusy(false);
    }
  };

  const submitPack = async (packId) => {
    if (!orgId || !packId || actionPackId) return;
    setActionPackId(packId);
    try {
      await requirementAPI.submitPack(orgId, packId);
      toast.success(t('requirements.submitSuccess'));
      await loadPacks();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('requirements.submitFail') }));
    } finally {
      setActionPackId('');
    }
  };

  const approvePack = async (packId) => {
    if (!orgId || !packId || actionPackId) return;
    setActionPackId(packId);
    try {
      await requirementAPI.approvePack(orgId, packId);
      toast.success(t('requirements.approveSuccess'));
      await loadPacks();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('requirements.approveFail') }));
    } finally {
      setActionPackId('');
    }
  };

  const rejectPack = async (packId) => {
    if (!orgId || !packId || actionPackId) return;
    const reasonRaw = window.prompt(t('requirements.rejectReasonPrompt'), '');
    if (reasonRaw == null) return;
    const reason = String(reasonRaw).trim().slice(0, 2000);
    setActionPackId(packId);
    try {
      await requirementAPI.rejectPack(orgId, packId, reason);
      toast.success(t('requirements.rejectSuccess'));
      await loadPacks();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('requirements.rejectFail') }));
    } finally {
      setActionPackId('');
    }
  };

  const deletePack = async (packId) => {
    if (!orgId || !packId || actionPackId) return;
    setActionPackId(packId);
    try {
      await requirementAPI.deletePack(orgId, packId);
      toast.success(t('requirements.deletePackSuccess'));
      if (reviewPackId === packId) setReviewPackId('');
      setDeleteTarget(null);
      await loadPacks();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('requirements.deletePackFail') }));
    } finally {
      setActionPackId('');
    }
  };

  const createProjectFromPack = async (pack) => {
    const packId = String(pack?._id || pack || '').trim();
    if (!orgId || !packId || actionPackId) return;
    const linkedProjectId = String(
      (typeof pack === 'object' ? pack?.projectId : '') || ''
    ).trim();
    if (!linkedProjectId) {
      toast(
        t('workspace.phase2AiNeedsLinkedProject') ||
          'Pack = SRS. Gắn pack với dự án Phase 1 đã sẵn sàng gate, rồi dùng AI Phase 2 trên Overview.'
      );
      return;
    }
    navigate(
      buildProjectsNewAiPath(orgId, {
        projectId: linkedProjectId,
        packId,
        from: 'requirements',
      })
    );
  };

  const canConfirmPreview = canConfirmRequirementImport(preview);
  const confirmLabelKey = getConfirmImportLabelKey(preview);

  const closePreview = () => {
    if (busy) return;
    setPreview(null);
  };

  const previewModalFooter = preview ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {preview.valid ? (
        isAdmin ? (
          <button
            type="button"
            className={adminPrimaryBtnClass()}
            disabled={busy || !canConfirmPreview}
            title={!canConfirmPreview ? t('requirements.planningNotReady') : undefined}
            onClick={confirmImport}
          >
            <CheckCircle2 className="mr-2 inline h-4 w-4" />
            {t(sk(confirmLabelKey))}
          </button>
        ) : (
          <GradientButton
            variant="success"
            disabled={busy || !canConfirmPreview}
            title={!canConfirmPreview ? t('requirements.planningNotReady') : undefined}
            onClick={confirmImport}
            className="px-4 py-2 text-sm"
          >
            <CheckCircle2 className="h-4 w-4" />
            {t(sk(confirmLabelKey))}
          </GradientButton>
        )
      ) : null}
      {!preview.valid || Number(preview.errorCount) > 0 ? (
        <button
          type="button"
          className={
            isAdmin
              ? adminSecondaryBtnClass()
              : 'inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/40'
          }
          disabled={busy}
          onClick={closePreview}
        >
          {t(sk('fixExcel'))}
        </button>
      ) : null}
      <button
        type="button"
        className={
          isAdmin
            ? adminSecondaryBtnClass()
            : 'inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/40'
        }
        disabled={busy}
        onClick={closePreview}
      >
        <X className="h-4 w-4" />
        {t('requirements.closePreview')}
      </button>
    </div>
  ) : null;

  const previewModal = (
    <Modal
      isOpen={Boolean(preview)}
      onClose={closePreview}
      title={t('requirements.uploadPreviewTitle')}
      size="full"
      fill
      closable={!busy}
      footer={previewModalFooter}
    >
      {preview ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden">
            <RequirementPreviewTabs
              fillParent
              fileName={preview.fileName}
              valid={preview.valid}
              errorCount={preview.errorCount}
              warningCount={preview.warningCount}
              infoCount={preview.infoCount || 0}
              summary={preview.summary}
              excelPreview={preview.excelPreview}
              issues={preview.issues || []}
              labels={previewLabels}
              planningReadiness={preview.planningReadiness || null}
            />
          </div>
          {preview.valid && !canConfirmPreview ? (
            <p className="shrink-0 text-xs text-destructive">
              {t('requirements.confirmImportBlockedValidation')}
            </p>
          ) : null}
          {!preview.valid || Number(preview.errorCount) > 0 ? (
            <p className="shrink-0 text-xs text-destructive">
              {t('requirements.importBlockedByErrors')}
            </p>
          ) : null}
          {preview.valid &&
          Number(preview.warningCount) > 0 &&
          Number(preview.errorCount || 0) === 0 ? (
            <p className="shrink-0 text-xs text-amber-800 dark:text-amber-200">
              {t('requirements.continueAnywayHint')}
            </p>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );

  const headerActions = useMemo(() => {
    if (!showImportSection) return null;
    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={handleFileChange}
        />
        {isAdmin ? (
          <>
            <button type="button" className={adminSecondaryBtnClass()} disabled={busy} onClick={downloadTemplate}>
              <FileDown className="mr-2 inline h-4 w-4" />
              {t(sk('downloadTemplate'))}
            </button>
            <button
              type="button"
              className={adminPrimaryBtnClass()}
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-2 inline h-4 w-4" />
              {t(sk('uploadPreview'))}
            </button>
          </>
        ) : (
          <>
            <GradientButton variant="shell" disabled={busy} onClick={downloadTemplate} className="min-h-11 w-full px-4 py-2 text-sm sm:w-auto">
              <FileDown className="h-4 w-4" />
              {t(sk('downloadTemplate'))}
            </GradientButton>
            <GradientButton
              variant="shell"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="min-h-11 w-full px-4 py-2 text-sm sm:w-auto"
            >
              <Upload className="h-4 w-4" />
              {t(sk('uploadPreview'))}
            </GradientButton>
          </>
        )}
      </>
    );
  }, [busy, downloadTemplate, handleFileChange, isAdmin, showImportSection, sk, t]);

  useEffect(() => {
    setHeaderActions?.(headerActions);
  }, [headerActions, setHeaderActions]);

  const activeFilterCount = statusFilter ? 1 : 0;

  const statusFilterBar = (
    <div className="flex justify-end">
      <div className="relative shrink-0" ref={filtersRef}>
        <button
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="requirements-pack-filters"
          onClick={() => setFiltersOpen((open) => !open)}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/40"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          {t('requirements.filters')}
          {activeFilterCount ? (
            <span
              className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white"
              title={t('requirements.filtersActive', { n: activeFilterCount })}
            >
              {activeFilterCount}
            </span>
          ) : null}
        </button>
        {filtersOpen ? (
          <div
            id="requirements-pack-filters"
            className="absolute right-0 z-20 mt-2 w-[min(calc(100vw-2rem),16rem)] space-y-2 rounded-xl border border-border bg-card p-3 shadow-lg"
          >
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              aria-label={t('requirements.filterByStatus')}
            >
              {PACK_STATUS_FILTERS.map((key) => (
                <option key={key || 'all'} value={key}>
                  {key ? t(`requirements.status.${key}`) : t('requirements.filterAllStatus')}
                </option>
              ))}
            </select>
            {activeFilterCount ? (
              <button
                type="button"
                onClick={() => setStatusFilter('')}
                className="w-full rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                {t('requirements.filtersClear')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  const paginationBar =
    filteredPacks.length > PACK_LIST_PAGE_SIZE ? (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
          aria-label={t('requirements.listPrev')}
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          {t('requirements.listPrev')}
        </button>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {t('requirements.listPage', { page: safePage, total: totalPages })}
          {' · '}
          {t('requirements.listCount', { n: filteredPacks.length })}
        </span>
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
          aria-label={t('requirements.listNext')}
        >
          {t('requirements.listNext')}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    ) : (
      <p className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
        {t('requirements.listCount', { n: filteredPacks.length })}
      </p>
    );

  const renderCollaboratePackRow = (pack) => (
    <li
      key={pack._id}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-lg border border-border px-3 py-2.5"
    >
      <div className="min-w-0">
        <button
          type="button"
          className="block max-w-full truncate text-left text-sm font-medium text-foreground hover:text-primary"
          onClick={() => setReviewPackId(pack._id)}
        >
          {pack.overview?.requirementName || pack._id}
        </button>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <PackStatusBadge status={pack.status} t={t} />
          <span>v{pack.templateVersion}</span>
          <PlanningScoreBadge readiness={pack.planningReadiness} t={t} />
        </div>
      </div>
      <div className="flex max-w-full flex-wrap items-center justify-end gap-1">
        <PackRowActionButton
          disabled={actionPackId === pack._id}
          onClick={() => setReviewPackId(pack._id)}
          title={t('requirements.review')}
        >
          <Eye className="h-3 w-3 shrink-0" aria-hidden />
          {t('requirements.review')}
        </PackRowActionButton>
        {canSubmit && pack.status === 'draft' ? (
          <PackRowActionButton
            disabled={actionPackId === pack._id || !canSubmitPackForReview(pack)}
            onClick={() => submitPack(pack._id)}
            title={canSubmitPackForReview(pack) ? t('requirements.submit') : t('requirements.planningNotReady')}
          >
            <Send className="h-3 w-3 shrink-0" aria-hidden />
            {t('requirements.submit')}
          </PackRowActionButton>
        ) : null}
        {canApprove && pack.status === 'under_review' ? (
          <>
            <PackRowActionButton
              variant="success"
              disabled={actionPackId === pack._id}
              onClick={() => approvePack(pack._id)}
              title={t('requirements.approve')}
            >
              <Check className="h-3 w-3 shrink-0" aria-hidden />
              {t('requirements.approve')}
            </PackRowActionButton>
            <PackRowActionButton
              variant="danger"
              disabled={actionPackId === pack._id}
              onClick={() => rejectPack(pack._id)}
              title={t('requirements.reject')}
            >
              <X className="h-3 w-3 shrink-0" aria-hidden />
              {t('requirements.reject')}
            </PackRowActionButton>
          </>
        ) : null}
        {canCreateFromPack && pack.status === 'approved' ? (
          <PackRowActionButton
            variant="success"
            disabled={actionPackId === pack._id}
            onClick={() => createProjectFromPack(pack)}
            title={t('workspace.phase2OptionAi') || t('requirements.createProject')}
          >
            <FolderPlus className="h-3 w-3 shrink-0" aria-hidden />
            {t('workspace.phase2OptionAi') || t('requirements.createProject')}
          </PackRowActionButton>
        ) : null}
        {canApprove && pack.status === 'approved' ? (
          <PackRowActionButton
            variant="danger"
            disabled={actionPackId === pack._id}
            onClick={() => setDeleteTarget(pack)}
            title={t('requirements.deletePack')}
          >
            <Trash2 className="h-3 w-3 shrink-0" aria-hidden />
            {t('requirements.deletePack')}
          </PackRowActionButton>
        ) : null}
      </div>
    </li>
  );

  const renderAdminPackRow = (pack) => (
    <li key={pack._id} className="rounded-lg border border-border px-3 py-2">
      <button
        type="button"
        className="w-full text-left font-medium hover:text-primary"
        onClick={() => setReviewPackId(pack._id)}
      >
        {pack.overview?.requirementName || pack._id}
      </button>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <PackStatusBadge status={pack.status} t={t} />
        <span>v{pack.templateVersion}</span>
        <PlanningScoreBadge readiness={pack.planningReadiness} t={t} />
      </div>
    </li>
  );

  const listBody = !filteredPacks.length ? (
    <p className={`text-sm text-muted-foreground ${isAdmin ? '' : 'min-h-0 flex-1'}`}>
      {packs.length ? t('requirements.emptyFiltered') : t(sk('empty'))}
    </p>
  ) : (
    <>
      <div className={isAdmin ? undefined : 'min-h-0 flex-1 overflow-y-auto scrollbar-overlay'}>
        <ul className={`space-y-2 ${isAdmin ? 'text-sm' : ''}`}>
          {pagedPacks.map((pack) => (isAdmin ? renderAdminPackRow(pack) : renderCollaboratePackRow(pack)))}
        </ul>
      </div>
      <div className={isAdmin ? undefined : 'shrink-0'}>{paginationBar}</div>
    </>
  );

  return (
    <div className={isAdmin ? undefined : 'flex min-h-0 flex-1 flex-col'}>
      {!isAdmin ? (
        <header className="mb-6 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h1 className={FIGMA_PAGE_TITLE}>{t('requirements.title')}</h1>
            <p className={FIGMA_PAGE_SUBTITLE}>{t('requirements.subtitle')}</p>
          </div>
          {headerActions ? <div className="flex w-full flex-wrap gap-2 sm:w-auto">{headerActions}</div> : null}
        </header>
      ) : null}

      {isAdmin ? (
        <AdminUserFormCard title={t(sk('listTitle'))}>
          <div className="mb-4">{statusFilterBar}</div>
          {listBody}
        </AdminUserFormCard>
      ) : (
        <div
          className={`${FIGMA_PAGE_CARD} flex min-h-0 flex-1 flex-col p-4`}
        >
          <div className="relative z-10 mb-4 shrink-0">{statusFilterBar}</div>
          {listBody}
        </div>
      )}

      {previewModal}

      <RequirementPackReviewDrawer
        open={Boolean(reviewPackId)}
        orgId={orgId}
        packId={reviewPackId}
        canApprove={canApprove}
        canCreateFromPack={canCreateFromPack}
        canRunAiPlanning={canRunAiPlanning}
        onClose={() => setReviewPackId('')}
        onChanged={loadPacks}
        onDeletePack={(pack) => setDeleteTarget(pack)}
      />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => !actionPackId && setDeleteTarget(null)}
        onConfirm={() => deletePack(String(deleteTarget?._id || '').trim())}
        title={t('requirements.deletePackTitle')}
        message={t('requirements.deletePackConfirm', {
          name:
            deleteTarget?.overview?.requirementName ||
            deleteTarget?.sourceFileName ||
            deleteTarget?._id ||
            '—',
        })}
        confirmText={t('requirements.deletePack')}
        cancelText={t('common.cancel')}
      />
    </div>
  );
}
