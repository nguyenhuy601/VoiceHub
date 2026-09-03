import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Check, Download, FolderPlus, Loader2, Sparkles, Trash2, X } from 'lucide-react';

import GradientButton from '../../components/Shared/GradientButton';
import BrandPageLoader from '../../components/Shared/BrandPageLoader';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { buildCollaborateProjectHubPath } from '../../utils/suitePathUtils';
import { requirementAPI } from '../../services/api/requirementAPI';
import RequirementPreviewTabs from './RequirementPreviewTabs';
import AiStaffingProposalPanel from './AiStaffingProposalPanel';
import AiPlanningRunningBanner from './AiPlanningRunningBanner';
import { formatAiPlanningSuggestionProfile } from '../../utils/aiPlanningSuggestionDisplay';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function canRunAiOnPack(pack) {
  const status = String(pack?.status || '');
  if (!['under_review', 'approved', 'project_linked'].includes(status)) return false;
  const readiness = pack?.planningReadiness;
  if (!readiness) return false;
  if (readiness.allLeavesStaffed !== true) return false;
  return true;
}

function AiPlanningOverlaySummary({
  pack,
  t,
  canRunAiPlanning,
  busy,
  aiPlanningBusy = false,
  onApproveStaffing,
  onDiscardStaffing,
}) {
  const planning = pack?.aiPlanning;
  if (!planning || planning.status === 'none') {
    if (!aiPlanningBusy) return null;
    return (
      <div className="mb-4">
        <AiPlanningRunningBanner t={t} />
      </div>
    );
  }
  const overlay = planning.overlay || {};
  const roles = Array.isArray(overlay.roles) ? overlay.roles : [];
  const gaps = Array.isArray(overlay.gaps) ? overlay.gaps : [];
  const llm = overlay.llm || {};

  return (
    <div className="mb-4 rounded-lg border border-border bg-muted/30 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-foreground">{t('requirements.aiPlanningTitle')}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          {t(`requirements.aiPlanningStatus.${planning.status}`)}
        </span>
        {overlay.engine ? (
          <span className="text-[11px] text-muted-foreground">{overlay.engine}</span>
        ) : null}
        {llm.model ? (
          <span className="text-[11px] text-muted-foreground">{llm.model}</span>
        ) : null}
        {llm.staffingStatus ? (
          <span className="text-[11px] text-muted-foreground">
            {t('requirements.aiLlmStaffingStatus', {
              status:
                t(`requirements.aiLlmStaffingStatusLabels.${llm.staffingStatus}`, {
                  defaultValue: llm.staffingStatus,
                }),
            })}
          </span>
        ) : null}
      </div>
      {aiPlanningBusy || planning.status === 'pending' ? (
        <div className="mt-3">
          <AiPlanningRunningBanner t={t} />
        </div>
      ) : null}

      {planning.status === 'failed' ? (
        <p className="mt-2 text-destructive">{overlay.message || t('requirements.aiPlanningFail')}</p>
      ) : null}

      {planning.status === 'ready' && !aiPlanningBusy ? (
        <div className="mt-3">
          <AiStaffingProposalPanel
            overlay={overlay}
            t={t}
            canApproveStaffing={canRunAiPlanning}
            busy={busy}
            onApproveStaffing={onApproveStaffing}
            onDiscardStaffing={onDiscardStaffing}
          />
        </div>
      ) : null}

      {roles.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {roles.map((role) => {
            const top = (role.suggestions || []).slice(0, 3);
            return (
              <li key={role.roleKey} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {role.roleKey} ×{role.requiredCount}
                </span>
                {top.length ? (
                  <ul className="mt-1 space-y-1 pl-2">
                    {top.map((s) => {
                      const profileLine = formatAiPlanningSuggestionProfile(s, t);
                      return (
                      <li key={`${role.roleKey}-${s.userId}`}>
                        {s.displayName || s.userId} ({s.score})
                        {profileLine ? (
                          <span className="block text-[11px] opacity-80">
                            {profileLine}
                          </span>
                        ) : null}
                        {s.rationale ? (
                          <span className="block text-[11px] opacity-90">— {s.rationale}</span>
                        ) : null}
                      </li>
                      );
                    })}
                  </ul>
                ) : (
                  <span> — {t('requirements.aiPlanningNoCandidates')}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {gaps.length > 0 ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          {t('requirements.aiPlanningGaps', { count: gaps.length })}
        </p>
      ) : null}
      {(pack?.planningReadiness?.missingLeafIds || []).length > 0 ? (
        <p className="mt-2 text-xs text-destructive">
          {t('requirements.missingLeafStaffing', {
            ids: (pack.planningReadiness.missingLeafIds || []).slice(0, 8).join(', '),
          })}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Drawer to review a requirement pack (Tree + Excel) with optional approve/reject / create project / AI.
 */
export default function RequirementPackReviewDrawer({
  open = false,
  orgId = '',
  packId = '',
  canApprove = false,
  canCreateFromPack = false,
  canRunAiPlanning = false,
  onClose = null,
  onChanged = null,
  onDeletePack = null,
}) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const [pack, setPack] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiPlanningBusy, setAiPlanningBusy] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, busy]);

  useEffect(() => {
    if (!open || !orgId || !packId) {
      setPack(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await requirementAPI.getPack(orgId, packId);
        if (!cancelled) setPack(unwrap(res));
      } catch (error) {
        if (!cancelled) {
          setPack(null);
          toast.error(
            resolveApiErrorMessage(error, { t, fallback: t('requirements.loadPackFail') })
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orgId, packId, t]);

  if (!open) return null;

  const showApprove = canApprove && pack?.status === 'under_review';
  const showCreateProject = canCreateFromPack && pack?.status === 'approved';
  const showDelete = canApprove && pack?.status === 'approved';
  const showRunAi = canRunAiPlanning && canRunAiOnPack(pack);
  const showFooter = showApprove || showCreateProject || showRunAi || showDelete;
  const labels = {
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
    previewPackReady: t('requirements.previewPackReady'),
    previewPackProcessed: t('requirements.previewPackProcessed'),
  };

  const planningPreview = pack?.planningPreview || null;

  const downloadSource = async () => {
    if (!orgId || !packId || busy || !pack?.sourceFileId) return;
    setBusy(true);
    try {
      const res = await requirementAPI.downloadSourceFile(orgId, packId);
      const blob =
        res instanceof Blob
          ? res
          : new Blob([res?.data ?? res], {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
      if (blob.type && blob.type.includes('application/json')) {
        const text = await blob.text();
        let msg = t('requirements.downloadSourceFail');
        try {
          msg = JSON.parse(text).message || msg;
        } catch {
          /* ignore */
        }
        toast.error(msg);
        return;
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = pack.sourceFileName || 'requirement.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('requirements.downloadSourceFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!orgId || !packId || busy) return;
    setBusy(true);
    try {
      await requirementAPI.approvePack(orgId, packId);
      toast.success(t('requirements.approveSuccess'));
      onChanged?.();
      onClose?.();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('requirements.approveFail') }));
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!orgId || !packId || busy) return;
    const reasonRaw = window.prompt(t('requirements.rejectReasonPrompt'), '');
    if (reasonRaw == null) return;
    const reason = String(reasonRaw).trim().slice(0, 2000);
    setBusy(true);
    try {
      await requirementAPI.rejectPack(orgId, packId, reason);
      toast.success(t('requirements.rejectSuccess'));
      onChanged?.();
      onClose?.();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('requirements.rejectFail') }));
    } finally {
      setBusy(false);
    }
  };

  const createProject = async () => {
    if (!orgId || !packId || busy) return;
    setBusy(true);
    try {
      const res = await requirementAPI.createProjectFromPack(orgId, packId);
      const data = unwrap(res);
      toast.success(t('requirements.createProjectSuccess'));
      onChanged?.();
      onClose?.();
      const projectId = String(data?.project?._id || data?.project?.projectId || '').trim();
      if (projectId) {
        navigate(buildCollaborateProjectHubPath(projectId, { organizationId: orgId }));
      }
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('requirements.createProjectFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const runAiPlanning = async () => {
    if (!orgId || !packId || busy) return;
    setBusy(true);
    setAiPlanningBusy(true);
    setPack((prev) =>
      prev
        ? {
            ...prev,
            aiPlanning: {
              ...(prev.aiPlanning || {}),
              status: 'pending',
              overlay: prev.aiPlanning?.overlay || null,
            },
          }
        : prev
    );
    try {
      const res = await requirementAPI.runAiPlanning(orgId, packId);
      setPack(unwrap(res));
      toast.success(t('requirements.aiPlanningSuccess'));
      onChanged?.();
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('requirements.aiPlanningFail') })
      );
    } finally {
      setBusy(false);
      setAiPlanningBusy(false);
    }
  };

  const approveAiStaffing = async () => {
    if (!orgId || !packId || busy) return;
    setBusy(true);
    try {
      const res = await requirementAPI.approveAiStaffing(orgId, packId);
      setPack(unwrap(res));
      toast.success(t('requirements.aiStaffingApproveSuccess'));
      onChanged?.();
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('requirements.aiStaffingApproveFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const discardAiStaffing = async () => {
    if (!orgId || !packId || busy) return;
    setBusy(true);
    try {
      const res = await requirementAPI.discardAiStaffing(orgId, packId);
      setPack(unwrap(res));
      toast.success(t('requirements.aiStaffingDiscardSuccess'));
      onChanged?.();
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('requirements.aiStaffingDiscardFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/40"
        aria-label={t('requirements.closeReview')}
        onClick={() => {
          if (!busy) onClose?.();
        }}
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-2xl flex-col border-l border-border bg-background shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="requirement-pack-review-title"
      >
        <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('requirements.reviewTitle')}
            </p>
            <h3
              id="requirement-pack-review-title"
              className="truncate text-sm font-bold text-foreground"
            >
              {pack?.overview?.requirementName || pack?.sourceFileName || packId}
            </h3>
          </div>
          <button
            type="button"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => !busy && onClose?.()}
            aria-label={t('requirements.closeReview')}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="relative min-h-0 flex-1 overflow-y-auto p-4">
          {aiPlanningBusy ? (
            <div
              className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center bg-background/60 pt-16 backdrop-blur-[1px]"
              aria-hidden
            >
              <AiPlanningRunningBanner t={t} className="shadow-sm" />
            </div>
          ) : null}
          {loading ? (
            <div className="flex justify-center py-12">
              <BrandPageLoader />
            </div>
          ) : pack ? (
            <>
              <AiPlanningOverlaySummary
                pack={pack}
                t={t}
                canRunAiPlanning={canRunAiPlanning}
                busy={busy}
                aiPlanningBusy={aiPlanningBusy}
                onApproveStaffing={approveAiStaffing}
                onDiscardStaffing={discardAiStaffing}
              />
              <RequirementPreviewTabs
                previewMode="pack"
                fileName={pack.sourceFileName || pack.overview?.requirementName || ''}
                errorCount={planningPreview?.errorCount ?? 0}
                warningCount={planningPreview?.warningCount ?? 0}
                infoCount={planningPreview?.infoCount ?? 0}
                excelPreview={planningPreview?.excelPreview ?? pack.excelPreview}
                issues={planningPreview?.issues ?? []}
                labels={labels}
                planningReadiness={pack.planningReadiness || null}
                headerExtra={
                  pack.sourceFileId ? (
                    <GradientButton
                      variant="shell"
                      disabled={busy}
                      onClick={downloadSource}
                      className="px-3 py-1.5 text-xs"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {t('requirements.downloadSource')}
                    </GradientButton>
                  ) : null
                }
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t('requirements.loadPackFail')}</p>
          )}
        </div>

        {showFooter ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">
            {showRunAi ? (
              <GradientButton
                variant="shell"
                disabled={busy}
                onClick={runAiPlanning}
                className="px-4 py-2 text-sm"
              >
                {aiPlanningBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="h-4 w-4" aria-hidden />
                )}
                {aiPlanningBusy
                  ? t('requirements.aiPlanningStatus.pending')
                  : t('requirements.aiPlanningRun')}
              </GradientButton>
            ) : null}
            {showApprove ? (
              <>
                <GradientButton
                  variant="shell"
                  disabled={busy}
                  onClick={reject}
                  className="px-4 py-2 text-sm"
                >
                  <X className="h-4 w-4" />
                  {t('requirements.reject')}
                </GradientButton>
                <GradientButton
                  variant="success"
                  disabled={busy}
                  onClick={approve}
                  className="px-4 py-2 text-sm"
                >
                  <Check className="h-4 w-4" />
                  {t('requirements.approve')}
                </GradientButton>
              </>
            ) : null}
            {showCreateProject ? (
              <GradientButton
                variant="success"
                disabled={busy}
                onClick={createProject}
                className="px-4 py-2 text-sm"
              >
                <FolderPlus className="h-4 w-4" />
                {t('requirements.createProject')}
              </GradientButton>
            ) : null}
            {showDelete ? (
              <GradientButton
                variant="shell"
                disabled={busy}
                onClick={() => onDeletePack?.(pack)}
                className="px-4 py-2 text-sm text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                {t('requirements.deletePack')}
              </GradientButton>
            ) : null}
          </footer>
        ) : null}
      </aside>
    </>
  );
}
