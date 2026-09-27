import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { projectAPI } from '../../../services/api/projectAPI';
import { useAppStrings } from '../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import { buildProjectsModulePath } from '../../../utils/suitePathUtils';
import { phaseHomeModule } from '../../../utils/projectPhaseNav';
import { queryKeys } from '../../../lib/queryKeys';
import Phase2ManualStagingModal from './Phase2ManualStagingModal';
import Phase2PoReviewInbox from './Phase2PoReviewInbox';
import useProjectCapabilities from '../phase1/hooks/useProjectCapabilities';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * Banner + chooser: Thủ công (staging → PO) | Tự động hóa (map code → Development).
 */
export default function Phase2GateBanner({
  projectId,
  organizationId,
  deliveryPhase,
  canChangePhase = false,
}) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { capabilities } = useProjectCapabilities(projectId);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('manual');
  const [methodology, setMethodology] = useState('kanban');
  const [busy, setBusy] = useState(false);
  const [stagingOpen, setStagingOpen] = useState(false);

  const phase = String(deliveryPhase || '').toLowerCase();
  const gateRelevant = phase === 'requirement_analysis' || phase === 'delivery_planning';

  const { data: gaps } = useQuery({
    queryKey: ['projectAnalysisGaps', String(projectId || '')],
    queryFn: async () => unwrap(await projectAPI.getAnalysisGaps(projectId)),
    enabled: Boolean(projectId) && gateRelevant,
    staleTime: 15_000,
  });

  const ready = Boolean(gaps?.readyForPhase2);
  const stagingSummary = gaps?.phase2ManualStaging || null;
  const stagingPending = String(stagingSummary?.status || '') === 'po_review';
  const stagingNeedsPm =
    ['draft', 'changes_requested'].includes(String(stagingSummary?.status || '')) &&
    Number(stagingSummary?.rowCount || 0) > 0;
  const showBanner =
    gateRelevant && phase === 'delivery_planning' && ready && !stagingPending;

  useEffect(() => {
    if (String(stagingSummary?.methodology || '')) {
      setMethodology(String(stagingSummary.methodology));
    }
  }, [stagingSummary?.methodology]);

  const invalidateHub = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.project(projectId) });
    await queryClient.invalidateQueries({
      queryKey: ['projectAnalysisGaps', String(projectId)],
    });
  }, [queryClient, projectId]);

  const onAdvanceAutomation = useCallback(async () => {
    if (!projectId || busy) return;
    setBusy(true);
    try {
      await projectAPI.advancePhase2(projectId, {
        mode: 'automation',
        methodology,
        importWorkItems: false,
        applyAssignees: false,
        publishWbs: true,
        seedBoardTasks: true,
      });
      toast.success(t('workspace.phase2AdvanceSuccess') || 'Đã chuyển Phase 2 — Development');
      setOpen(false);
      await invalidateHub();
      navigate(
        buildProjectsModulePath(projectId, phaseHomeModule('development'), {
          organizationId,
          boardId: searchParams.get('boardId') || '',
        })
      );
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, {
          t,
          fallback: t('workspace.phase2AdvanceFail') || 'Không chuyển được Phase 2',
        })
      );
    } finally {
      setBusy(false);
    }
  }, [
    projectId,
    busy,
    methodology,
    t,
    invalidateHub,
    navigate,
    organizationId,
    searchParams,
  ]);

  const onConfirmChooser = useCallback(() => {
    if (mode === 'manual') {
      setOpen(false);
      setStagingOpen(true);
      return;
    }
    onAdvanceAutomation();
  }, [mode, onAdvanceAutomation]);

  return (
    <>
      <Phase2PoReviewInbox
        projectId={projectId}
        organizationId={organizationId}
        stagingSummary={stagingSummary}
        canReviewPo={Boolean(capabilities.canReviewPlanningPo)}
      />

      {stagingNeedsPm && canChangePhase ? (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-3 sm:px-4">
          <p className="text-sm font-semibold text-foreground">
            {t('workspace.phase2StagingResumeTitle') || 'Tiếp tục staging Phase 2'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {String(stagingSummary?.status) === 'changes_requested'
              ? t('workspace.phase2StagingChangesRequested') ||
                'PO yêu cầu sửa — mở bảng và gửi lại.'
              : t('workspace.phase2StagingDraftHint') ||
                'Có bản nháp staging — mở để chỉnh và gửi PO.'}
          </p>
          {String(stagingSummary?.status) === 'changes_requested' && stagingSummary?.reviewNote ? (
            <p className="mt-2 whitespace-pre-wrap text-xs text-foreground">
              {stagingSummary.reviewNote}
            </p>
          ) : null}
          <button
            type="button"
            className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            onClick={() => setStagingOpen(true)}
          >
            {t('workspace.phase2StagingOpen') || 'Mở bảng staging…'}
          </button>
        </div>
      ) : null}

      {showBanner ? (
        <div className="mb-4 rounded-xl border border-primary/40 bg-primary/10 px-3 py-3 sm:px-4">
          <p className="text-sm font-semibold text-foreground">
            {t('workspace.phase2ReadyTitle') ||
              'Phase 1 đã đủ approve — sẵn sàng chuyển Phase 2 (Development)'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('workspace.phase2ReadyHint') ||
              'Thủ công: chỉnh bảng rồi gửi PO. Tự động hóa: map WBS → Board ngay.'}
          </p>
          {canChangePhase ? (
            <button
              type="button"
              className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
              onClick={() => setOpen(true)}
            >
              {t('workspace.phase2ReadyCta') || 'Chuyển Phase 2…'}
            </button>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              {t('workspace.phase2ReadyNeedPm') || 'Chỉ PM/PO có quyền xác nhận chuyển phase.'}
            </p>
          )}
        </div>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border border-border bg-surface p-4 shadow-lg"
          >
            <h2 className="text-base font-semibold text-foreground">
              {t('workspace.phase2ChooserTitle') || 'Chọn cách setup Phase 2'}
            </h2>
            <div className="mt-4 space-y-2">
              <label className="flex cursor-pointer gap-2 rounded-lg border border-border p-3 text-sm">
                <input
                  type="radio"
                  name="phase2mode"
                  checked={mode === 'manual'}
                  onChange={() => setMode('manual')}
                />
                <span>
                  <span className="font-semibold">
                    {t('workspace.phase2OptionManual') || 'Thủ công'}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t('workspace.phase2OptionManualHint') ||
                      'Mở bảng preview Backlog/Board → PM sửa → Gửi PO duyệt (HITL) trước Development.'}
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer gap-2 rounded-lg border border-border p-3 text-sm">
                <input
                  type="radio"
                  name="phase2mode"
                  checked={mode === 'automation'}
                  onChange={() => setMode('automation')}
                />
                <span>
                  <span className="font-semibold">
                    {t('workspace.phase2OptionAutomation') || 'Tự động hóa'}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t('workspace.phase2OptionAutomationHint') ||
                      'Map code Phase 1 (WBS đã duyệt) → Board và chuyển Development ngay (không LLM).'}
                  </span>
                </span>
              </label>
            </div>

            {mode === 'automation' ? (
              <label className="mt-3 block text-sm">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('workspace.phase2Methodology')}
                </span>
                <select
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5"
                  value={methodology}
                  onChange={(e) => setMethodology(e.target.value)}
                >
                  <option value="kanban">Kanban</option>
                  <option value="scrum">Scrum</option>
                  <option value="waterfall">Waterfall</option>
                </select>
              </label>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                disabled={busy}
                onClick={onConfirmChooser}
              >
                {busy
                  ? t('common.saving')
                  : mode === 'manual'
                    ? t('workspace.phase2OpenStaging') || 'Mở bảng staging…'
                    : t('workspace.phase2Confirm') || 'Xác nhận Phase 2'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Phase2ManualStagingModal
        projectId={projectId}
        methodology={methodology}
        open={stagingOpen}
        onClose={() => setStagingOpen(false)}
        onSubmitted={invalidateHub}
      />
    </>
  );
}
