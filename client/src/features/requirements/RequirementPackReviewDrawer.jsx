import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Check, Download, FolderPlus, Trash2, X } from 'lucide-react';

import GradientButton from '../../components/Shared/GradientButton';
import BrandPageLoader from '../../components/Shared/BrandPageLoader';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { buildProjectsModulePath } from '../../utils/suitePathUtils';
import { requirementAPI } from '../../services/api/requirementAPI';
import RequirementPreviewTabs from './RequirementPreviewTabs';
import {
  approveRequirementPackWithGate1,
  readPackGateA,
  formatGateAApproveError,
} from './approveRequirementPackWithGate1';
import RequirementInsightsPanel from './RequirementInsightsPanel';
import RequirementHitlJourney from './RequirementHitlJourney';
import AiPlanningRunPanel from '../projects/phase1/AiPlanningRunPanel';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * Drawer to review a requirement pack (Tree + Excel) with optional approve/reject / create project / AI Analysis.
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
          toast.error(
            resolveApiErrorMessage(error, { t, fallback: t('requirements.loadPackFail') })
          );
          setPack(null);
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
  const showFooter = showApprove || showCreateProject || showDelete;
  /** HOW phase panel only after Gate 1 (approved) — not during Gate 1 review. */
  const showHowPhase =
    canRunAiPlanning &&
    orgId &&
    packId &&
    (pack?.status === 'approved' || pack?.status === 'project_linked');
  const projectPlanStatus = String(pack?.aiAnalysis?.phaseRuns?.phase_how?.status || '');
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
      const result = await approveRequirementPackWithGate1({ orgId, packId, t });
      if (!result.ok) return;
      toast.success(
        result.forced
          ? t('requirements.approveForcedSuccess') || t('requirements.approveSuccess')
          : t('requirements.approveSuccess')
      );
      onChanged?.();
      onClose?.();
    } catch (error) {
      toast.error(formatGateAApproveError(error, { t, fallback: t('requirements.approveFail') }));
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

  const createProject = async (opts = {}) => {
    if (!orgId || !packId || busy) return;
    const planStatus = String(pack?.aiAnalysis?.phaseRuns?.phase_how?.status || '');
    if (planStatus !== 'confirmed') {
      toast.error(
        t('requirements.gate2CreateBlocked') ||
          'Gate 2: confirm phase HOW trước khi tạo Project board.'
      );
      return;
    }
    setBusy(true);
    try {
      const res = await requirementAPI.createProjectFromPack(orgId, packId, {
        importWorkItems: opts.importWorkItems !== false,
        applyAssignees: opts.applyAssignees !== false,
      });
      const data = unwrap(res);
      const projectId = String(
        data?.project?._id || data?.project?.projectId || data?.projectId || ''
      ).trim();
      toast.success(
        t('requirements.createProjectFromPackSuccess') || 'Đã tạo Project board (sau Gate 2).'
      );
      onChanged?.();
      onClose?.();
      if (projectId) {
        navigate(buildProjectsModulePath(projectId, 'overview'));
      }
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, {
          t,
          fallback: t('requirements.createProjectFromPackFail') || 'Không tạo được dự án từ pack.',
        })
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
        onClick={() => !busy && onClose?.()}
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-3xl flex-col border-l border-border bg-background shadow-xl"
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {pack?.status === 'under_review'
                ? t('requirements.gate1ReviewTitle') || 'Human Review — Gate 1 (Canonical SRS)'
                : pack?.status === 'approved'
                  ? t('requirements.gate2PhaseTitle') || 'Pack approved — HOW / Gate 2'
                  : t('requirements.reviewTitle')}
            </p>
            <h3 className="truncate text-base font-semibold text-foreground">
              {pack?.overview?.requirementName || pack?.sourceFileName || packId}
            </h3>
            {(() => {
              const gateA = readPackGateA(pack);
              if (!gateA) return null;
              return (
                <p
                  className={`mt-1 text-xs ${
                    gateA.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {gateA.passed
                    ? t('requirements.gateAPassed') || 'Gate A: đạt'
                    : t('requirements.gateANotPassed') || 'Gate A: chưa đạt (cần sửa hoặc force duyệt)'}
                </p>
              );
            })()}
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
          {loading ? (
            <div className="flex justify-center py-12">
              <BrandPageLoader />
            </div>
          ) : pack ? (
            <>
              <RequirementHitlJourney
                packStatus={pack.status}
                projectPlanStatus={projectPlanStatus}
                t={t}
              />
              {showHowPhase ? (
                <div className="mb-4">
                  <AiPlanningRunPanel
                    organizationId={orgId}
                    packId={packId}
                    canRun={Boolean(canRunAiPlanning)}
                    canPromote={Boolean(showCreateProject)}
                    onPromoted={(data) => {
                      onChanged?.();
                      const projectId = String(
                        data?.project?._id || data?.project?.projectId || data?.projectId || ''
                      ).trim();
                      onClose?.();
                      if (projectId) {
                        navigate(buildProjectsModulePath(projectId, 'overview'));
                      }
                    }}
                    onPlanStatusChange={(status) => {
                      setPack((prev) =>
                        prev
                          ? {
                              ...prev,
                              aiAnalysis: {
                                ...(prev.aiAnalysis || {}),
                                phaseRuns: {
                                  ...(prev.aiAnalysis?.phaseRuns || {}),
                                  phase_how: {
                                    ...(prev.aiAnalysis?.phaseRuns?.phase_how || {}),
                                    status,
                                  },
                                },
                              },
                            }
                          : prev
                      );
                    }}
                  />
                </div>
              ) : pack?.status === 'under_review' ? (
                <p className="mb-4 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  {t('requirements.gate1HowDeferred') ||
                    'HOW / AI Planning mở sau khi Approve Gate 1. Duyệt SRS (Gate A + nội dung pack) trước.'}
                </p>
              ) : null}
              {pack?.aiAnalysis?.analyses?.requirementInsights ||
              pack?.aiAnalysis?.analyses?.proposedSrs ||
              pack?.aiAnalysis?.analyses?.preApproval ? (
                <div className="mb-4 rounded-md border border-border p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('requirements.insightsPanelTitle') || 'Requirement Insights'}
                  </p>
                  <RequirementInsightsPanel
                    insights={pack.aiAnalysis.analyses.requirementInsights}
                    proposedSrs={pack.aiAnalysis.analyses.proposedSrs}
                    preApproval={pack.aiAnalysis.analyses.preApproval}
                    t={t}
                  />
                </div>
              ) : null}
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
            {showApprove ? (
              <>
                <GradientButton
                  variant="shell"
                  disabled={busy}
                  onClick={reject}
                  className="px-4 py-2 text-sm"
                >
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
                disabled={busy || projectPlanStatus !== 'confirmed'}
                onClick={() => createProject()}
                title={
                  projectPlanStatus === 'confirmed'
                    ? undefined
                    : t('requirements.gate2CreateBlocked') ||
                      'Gate 2: confirm projectPlan trước khi tạo Project board.'
                }
                className="px-4 py-2 text-sm"
              >
                <FolderPlus className="h-4 w-4" />
                {t('requirements.createProject')}
              </GradientButton>
            ) : null}
            {showDelete && typeof onDeletePack === 'function' ? (
              <GradientButton
                variant="shell"
                disabled={busy}
                onClick={() => onDeletePack(pack)}
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
