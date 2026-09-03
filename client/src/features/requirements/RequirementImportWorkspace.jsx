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
  Loader2,
  Send,
  Sparkles,
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
  FIGMA_PAGE_CARD_PAD,
  FIGMA_PAGE_SUBTITLE,
  FIGMA_PAGE_TITLE,
} from '../../components/Layout/figmaPageClasses';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { buildCollaborateProjectHubPath } from '../../utils/suitePathUtils';
import { requirementAPI } from '../../services/api/requirementAPI';
import RequirementPreviewTabs from './RequirementPreviewTabs';
import RequirementPackReviewDrawer from './RequirementPackReviewDrawer';
import SkillReviewPanel from '../skills/SkillReviewPanel';
import { canConfirmRequirementImport } from '../../utils/requirementImportReadiness';
import useEffectiveMasterGrants from '../../hooks/useEffectiveMasterGrants';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import useRequirementPacks from '../../hooks/useRequirementPacks';
import { RBAC_GRANT, canActWithGrant } from '../../config/rbacUiGrantMap';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function PlanningScoreBadge({ readiness, t }) {
  const score = readiness?.score;
  if (score == null) return null;
  const canSubmit = readiness?.allLeavesStaffed === true;
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
  const readiness = pack?.planningReadiness;
  if (!readiness) return false;
  if (readiness.allLeavesStaffed !== true) return false;
  return true;
}

function canRunAiOnPack(pack) {
  const status = String(pack?.status || '');
  if (!['under_review', 'approved', 'project_linked'].includes(status)) return false;
  return canSubmitPackForReview(pack);
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

const PACK_LIST_PAGE_SIZE = 10;

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
  const { isFullAccess } = useCompanyAdminAccess();
  const { hasGrant, loading: grantsLoading } = useEffectiveMasterGrants(orgId);
  const canReviewSkills = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.SKILL_REGISTRY_REVIEW);
  const isAdmin = variant === 'admin';
  const sk = (suffix) => stringKey(variant, suffix);
  const showImportSection = isAdmin || canSubmit;
  const fileInputRef = useRef(null);

  const [busy, setBusy] = useState(false);
  const [actionPackId, setActionPackId] = useState('');
  const [preview, setPreview] = useState(null);
  const [reviewPackId, setReviewPackId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [lastImportNewSkills, setLastImportNewSkills] = useState([]);
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
    missingLeafStaffing: t('requirements.missingLeafStaffing'),
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
      a.download = 'Requirement_Template_v1.2.xlsx';
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
      setLastImportNewSkills([]);
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

  const confirmImport = async () => {
    if (!orgId || !preview?.sessionId || busy || !canConfirmRequirementImport(preview)) return;
    setBusy(true);
    try {
      await requirementAPI.confirmImport(orgId, preview.sessionId);
      const newSkills = preview?.newSkillsDetected || [];
      setLastImportNewSkills(newSkills);
      toast.success(
        newSkills.length
          ? t('requirements.importSuccessWithNewSkills', { count: newSkills.length })
          : t(sk('importSuccess'))
      );
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

  const createProjectFromPack = async (packId) => {
    if (!orgId || !packId || actionPackId) return;
    setActionPackId(packId);
    try {
      const res = await requirementAPI.createProjectFromPack(orgId, packId);
      const data = unwrap(res);
      toast.success(t('requirements.createProjectSuccess'));
      await loadPacks();
      const projectId = String(data?.project?._id || data?.project?.projectId || '').trim();
      if (projectId) {
        navigate(
          buildCollaborateProjectHubPath(projectId, { organizationId: orgId })
        );
      }
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('requirements.createProjectFail') })
      );
    } finally {
      setActionPackId('');
    }
  };

  const runAiPlanning = async (packId) => {
    if (!orgId || !packId || actionPackId) return;
    setActionPackId(packId);
    try {
      await requirementAPI.runAiPlanning(orgId, packId);
      toast.success(t('requirements.aiPlanningSuccess'));
      await loadPacks();
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('requirements.aiPlanningFail') })
      );
    } finally {
      setActionPackId('');
    }
  };

  const canConfirmPreview = canConfirmRequirementImport(preview);

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
            {t(sk('confirmImport'))}
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
            {t(sk('confirmImport'))}
          </GradientButton>
        )
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
          <div
            className={`min-h-0 overflow-hidden ${
              (preview.newSkillsDetected || []).length > 0 ? 'flex-[1.2]' : 'flex-1'
            }`}
          >
            <RequirementPreviewTabs
              fillParent
              fileName={preview.fileName}
              valid={preview.valid}
              errorCount={preview.errorCount}
              warningCount={preview.warningCount}
              summary={preview.summary}
              excelPreview={preview.excelPreview}
              issues={preview.issues || []}
              labels={previewLabels}
              planningReadiness={preview.planningReadiness || null}
            />
          </div>
          {(preview.newSkillsDetected || []).length > 0 ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              <SkillReviewPanel
                orgId={orgId}
                skills={preview.newSkillsDetected}
                compact
                canReview={!grantsLoading && canReviewSkills}
              />
            </div>
          ) : null}
          {preview.valid && !canConfirmPreview ? (
            <p className="shrink-0 text-xs text-destructive">
              {t('requirements.confirmImportBlockedStaffing')}
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
            <GradientButton variant="shell" disabled={busy} onClick={downloadTemplate} className="px-4 py-2 text-sm">
              <FileDown className="h-4 w-4" />
              {t(sk('downloadTemplate'))}
            </GradientButton>
            <GradientButton
              variant="shell"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 text-sm"
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

  const statusFilterBar = (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('requirements.filterByStatus')}>
      {PACK_STATUS_FILTERS.map((key) => {
        const active = statusFilter === key;
        const label = key ? t(`requirements.status.${key}`) : t('requirements.filterAllStatus');
        return (
          <button
            key={key || 'all'}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setStatusFilter(key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'border border-border bg-background text-muted-foreground hover:bg-muted/40'
            }`}
          >
            {label}
          </button>
        );
      })}
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
            onClick={() => createProjectFromPack(pack._id)}
            title={t('requirements.createProject')}
          >
            <FolderPlus className="h-3 w-3 shrink-0" aria-hidden />
            {t('requirements.createProject')}
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
        {canRunAiPlanning && canRunAiOnPack(pack) ? (
          <PackRowActionButton
            disabled={actionPackId === pack._id}
            onClick={() => runAiPlanning(pack._id)}
            title={
              pack.aiPlanning?.status === 'ready'
                ? t('requirements.aiPlanningRerunHint')
                : t('requirements.aiPlanningRun')
            }
            aria-busy={actionPackId === pack._id || undefined}
          >
            {actionPackId === pack._id ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
            )}
            {actionPackId === pack._id
              ? t('requirements.aiPlanningStatus.pending')
              : t('requirements.aiPlanningRun')}
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
    <p className="text-sm text-muted-foreground">
      {packs.length ? t('requirements.emptyFiltered') : t(sk('empty'))}
    </p>
  ) : (
    <>
      <ul className={`space-y-2 ${isAdmin ? 'text-sm' : ''}`}>
        {pagedPacks.map((pack) => (isAdmin ? renderAdminPackRow(pack) : renderCollaboratePackRow(pack)))}
      </ul>
      {paginationBar}
    </>
  );

  return (
    <>
      {!isAdmin ? (
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className={FIGMA_PAGE_TITLE}>{t('requirements.title')}</h1>
            <p className={FIGMA_PAGE_SUBTITLE}>{t('requirements.subtitle')}</p>
          </div>
          {headerActions ? <div className="flex flex-wrap gap-2">{headerActions}</div> : null}
        </header>
      ) : null}

      {lastImportNewSkills.length > 0 ? (
        <div className="mb-6">
          <SkillReviewPanel
            orgId={orgId}
            skills={lastImportNewSkills}
            onChanged={loadPacks}
            canReview={!grantsLoading && canReviewSkills}
          />
        </div>
      ) : null}

      {isAdmin ? (
        <AdminUserFormCard title={t(sk('listTitle'))}>
          <div className="mb-4">{statusFilterBar}</div>
          {listBody}
        </AdminUserFormCard>
      ) : (
        <div className={FIGMA_PAGE_CARD_PAD}>
          <div className="mb-4">{statusFilterBar}</div>
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
    </>
  );
}
