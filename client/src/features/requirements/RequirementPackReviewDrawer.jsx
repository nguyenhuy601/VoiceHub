import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Check, Download, FolderPlus, Trash2, X } from 'lucide-react';

import GradientButton from '../../components/Shared/GradientButton';
import BrandPageLoader from '../../components/Shared/BrandPageLoader';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { buildProjectsNewAiPath } from '../../utils/suitePathUtils';
import { requirementAPI } from '../../services/api/requirementAPI';
import RequirementPreviewTabs from './RequirementPreviewTabs';
import AiAnalysisBlueprintWizard from './AiAnalysisBlueprintWizard';

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
      await requirementAPI.approvePack(orgId, packId);
      toast.success(t('requirements.approveSuccess'));
      onChanged?.();
      onClose?.();
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('requirements.approveFail') })
      );
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
    const linkedProjectId = String(pack?.projectId || '').trim();
    if (!linkedProjectId) {
      toast(
        t('workspace.phase2AiNeedsLinkedProject') ||
          'Pack = SRS. Gắn pack với dự án Phase 1 đã sẵn sàng gate, rồi dùng AI Phase 2 trên Overview.'
      );
      return;
    }
    onClose?.();
    navigate(
      buildProjectsNewAiPath(orgId, {
        projectId: linkedProjectId,
        packId,
        from: 'requirements',
      })
    );
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
              {t('requirements.reviewTitle')}
            </p>
            <h3 className="truncate text-base font-semibold text-foreground">
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
          {loading ? (
            <div className="flex justify-center py-12">
              <BrandPageLoader />
            </div>
          ) : pack ? (
            <>
              {canRunAiPlanning && orgId && packId ? (
                <div className="mb-4">
                  <AiAnalysisBlueprintWizard
                    organizationId={orgId}
                    packId={packId}
                    onCreateProject={showCreateProject ? () => createProject() : null}
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
                disabled={busy}
                onClick={() => createProject()}
                className="px-4 py-2 text-sm"
              >
                <FolderPlus className="h-4 w-4" />
                {t('workspace.phase2OptionAi') || t('requirements.createProject')}
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
