import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Check, CheckCircle2, Eye, FileDown, FolderPlus, Send, Sparkles, Upload, X } from 'lucide-react';

import {
  AdminUserFormCard,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import GradientButton from '../../components/Shared/GradientButton';
import { FIGMA_PAGE_CARD_PAD } from '../../components/Layout/figmaPageClasses';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { buildCollaborateProjectHubPath } from '../../utils/suitePathUtils';
import { requirementAPI } from '../../services/api/requirementAPI';
import RequirementPreviewTabs from './RequirementPreviewTabs';
import RequirementPackReviewDrawer from './RequirementPackReviewDrawer';

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

export default function RequirementImportWorkspace({
  orgId,
  variant = 'collaborate',
  canSubmit = true,
  canApprove = false,
  canCreateFromPack = false,
  canRunAiPlanning = false,
}) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const isAdmin = variant === 'admin';
  const sk = (suffix) => stringKey(variant, suffix);
  const showImportSection = isAdmin || canSubmit;

  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionPackId, setActionPackId] = useState('');
  const [preview, setPreview] = useState(null);
  const [packs, setPacks] = useState([]);
  const [reviewPackId, setReviewPackId] = useState('');

  const loadPacks = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await requirementAPI.listPacks(orgId);
      const list = unwrap(res);
      setPacks(Array.isArray(list) ? list : []);
    } catch {
      setPacks([]);
    }
  }, [orgId]);

  useEffect(() => {
    loadPacks();
  }, [loadPacks]);

  const previewLabels = {
    tabTree: t('requirements.tabTree'),
    tabExcel: t('requirements.tabExcel'),
    parsedOk: t('requirements.parsedOk'),
    parsedFail: t('requirements.parsedFail'),
    meta: t('requirements.previewMeta'),
    emptyTree: t('requirements.emptyTree'),
    emptyExcel: t('requirements.noExcelPreview'),
    searchPlaceholder: t('requirements.excelSearch'),
    truncatedHint: t('requirements.excelTruncated'),
    derivedFromPackHint: t('requirements.derivedFromPackHint'),
  };

  const downloadTemplate = async () => {
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
      a.download = 'Requirement_Template_v1.1.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t(sk('downloadFail')) }));
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async () => {
    if (!orgId || !file || busy) return;
    setBusy(true);
    setPreview(null);
    try {
      const res = await requirementAPI.previewImport(orgId, file);
      setPreview(unwrap(res));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t(sk('previewFail')) }));
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = async () => {
    if (!orgId || !preview?.sessionId || busy || preview?.errorCount > 0) return;
    setBusy(true);
    try {
      await requirementAPI.confirmImport(orgId, preview.sessionId);
      toast.success(t(sk('importSuccess')));
      setPreview(null);
      setFile(null);
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

  const previewPanel = preview ? (
    <div className="mt-4">
      <RequirementPreviewTabs
        fileName={preview.fileName}
        valid={preview.valid}
        errorCount={preview.errorCount}
        warningCount={preview.warningCount}
        summary={preview.summary}
        previewTree={preview.previewTree || []}
        excelPreview={preview.excelPreview}
        issues={preview.issues || []}
        labels={previewLabels}
      />
    </div>
  ) : null;

  const importSection = !showImportSection ? null : isAdmin ? (
    <AdminUserFormCard title={t(sk('importTitle'))}>
      <p className="mb-4 text-sm text-muted-foreground">{t(sk('importHint'))}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={adminSecondaryBtnClass()} disabled={busy} onClick={downloadTemplate}>
          <FileDown className="mr-2 inline h-4 w-4" />
          {t(sk('downloadTemplate'))}
        </button>
      </div>
      <div className="mt-4">
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm"
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={adminPrimaryBtnClass()}
          disabled={!file || busy}
          onClick={runPreview}
        >
          <Upload className="mr-2 inline h-4 w-4" />
          {t(sk('uploadPreview'))}
        </button>
        {preview?.valid ? (
          <button
            type="button"
            className={adminPrimaryBtnClass()}
            disabled={busy || preview.errorCount > 0}
            onClick={confirmImport}
          >
            <CheckCircle2 className="mr-2 inline h-4 w-4" />
            {t(sk('confirmImport'))}
          </button>
        ) : null}
      </div>
      {previewPanel}
    </AdminUserFormCard>
  ) : (
    <div className={FIGMA_PAGE_CARD_PAD}>
      <h2 className="text-lg font-semibold text-foreground">{t(sk('importTitle'))}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t(sk('importHint'))}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <GradientButton variant="shell" disabled={busy} onClick={downloadTemplate} className="px-4 py-2 text-sm">
          <FileDown className="h-4 w-4" />
          {t(sk('downloadTemplate'))}
        </GradientButton>
      </div>
      <div className="mt-4">
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary"
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <GradientButton variant="shell" disabled={!file || busy} onClick={runPreview} className="px-4 py-2 text-sm">
          <Upload className="h-4 w-4" />
          {t(sk('uploadPreview'))}
        </GradientButton>
        {preview?.valid ? (
          <GradientButton
            variant="success"
            disabled={busy || preview.errorCount > 0}
            onClick={confirmImport}
            className="px-4 py-2 text-sm"
          >
            <CheckCircle2 className="h-4 w-4" />
            {t(sk('confirmImport'))}
          </GradientButton>
        ) : null}
      </div>
      {previewPanel}
    </div>
  );

  const listSection = isAdmin ? (
    <AdminUserFormCard title={t(sk('listTitle'))}>
      {!packs.length ? (
        <p className="text-sm text-muted-foreground">{t(sk('empty'))}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {packs.map((pack) => (
            <li key={pack._id} className="rounded-lg border border-border px-3 py-2">
              <button
                type="button"
                className="w-full text-left font-medium hover:text-primary"
                onClick={() => setReviewPackId(pack._id)}
              >
                {pack.overview?.requirementName || pack._id}
              </button>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {pack.status} · v{pack.templateVersion}
                </span>
                <PlanningScoreBadge readiness={pack.planningReadiness} t={t} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminUserFormCard>
  ) : (
    <div className={FIGMA_PAGE_CARD_PAD}>
      <h2 className="text-lg font-semibold text-foreground">{t(sk('listTitle'))}</h2>
      {!packs.length ? (
        <p className="mt-2 text-sm text-muted-foreground">{t(sk('empty'))}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {packs.map((pack) => (
            <li
              key={pack._id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-3"
            >
              <div className="min-w-0">
                <button
                  type="button"
                  className="text-left font-medium text-foreground hover:text-primary"
                  onClick={() => setReviewPackId(pack._id)}
                >
                  {pack.overview?.requirementName || pack._id}
                </button>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <PackStatusBadge status={pack.status} t={t} />
                  <span>v{pack.templateVersion}</span>
                  <PlanningScoreBadge readiness={pack.planningReadiness} t={t} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <GradientButton
                  variant="shell"
                  disabled={actionPackId === pack._id}
                  onClick={() => setReviewPackId(pack._id)}
                  className="px-3 py-1.5 text-xs"
                >
                  <Eye className="h-3.5 w-3.5" />
                  {t('requirements.review')}
                </GradientButton>
                {canSubmit && pack.status === 'draft' ? (
                  <GradientButton
                    variant="shell"
                    disabled={actionPackId === pack._id || !canSubmitPackForReview(pack)}
                    onClick={() => submitPack(pack._id)}
                    className="px-3 py-1.5 text-xs"
                    title={
                      canSubmitPackForReview(pack)
                        ? undefined
                        : t('requirements.planningNotReady')
                    }
                  >
                    <Send className="h-3.5 w-3.5" />
                    {t('requirements.submit')}
                  </GradientButton>
                ) : null}
                {canApprove && pack.status === 'under_review' ? (
                  <>
                    <GradientButton
                      variant="success"
                      disabled={actionPackId === pack._id}
                      onClick={() => approvePack(pack._id)}
                      className="px-3 py-1.5 text-xs"
                    >
                      <Check className="h-3.5 w-3.5" />
                      {t('requirements.approve')}
                    </GradientButton>
                    <GradientButton
                      variant="shell"
                      disabled={actionPackId === pack._id}
                      onClick={() => rejectPack(pack._id)}
                      className="px-3 py-1.5 text-xs"
                    >
                      <X className="h-3.5 w-3.5" />
                      {t('requirements.reject')}
                    </GradientButton>
                  </>
                ) : null}
                {canCreateFromPack && pack.status === 'approved' ? (
                  <GradientButton
                    variant="success"
                    disabled={actionPackId === pack._id}
                    onClick={() => createProjectFromPack(pack._id)}
                    className="px-3 py-1.5 text-xs"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    {t('requirements.createProject')}
                  </GradientButton>
                ) : null}
                {canRunAiPlanning && canRunAiOnPack(pack) ? (
                  <GradientButton
                    variant="shell"
                    disabled={actionPackId === pack._id}
                    onClick={() => runAiPlanning(pack._id)}
                    className="px-3 py-1.5 text-xs"
                    title={
                      pack.aiPlanning?.status === 'ready'
                        ? t('requirements.aiPlanningRerunHint')
                        : undefined
                    }
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {t('requirements.aiPlanningRun')}
                  </GradientButton>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <>
      <div
        className={
          showImportSection
            ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'
            : 'grid gap-4'
        }
      >
        {importSection}
        {listSection}
      </div>
      <RequirementPackReviewDrawer
        open={Boolean(reviewPackId)}
        orgId={orgId}
        packId={reviewPackId}
        canApprove={canApprove}
        canCreateFromPack={canCreateFromPack}
        canRunAiPlanning={canRunAiPlanning}
        onClose={() => setReviewPackId('')}
        onChanged={loadPacks}
      />
    </>
  );
}
