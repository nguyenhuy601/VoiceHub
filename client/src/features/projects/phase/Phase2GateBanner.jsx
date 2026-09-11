import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { projectAPI } from '../../../services/api/projectAPI';
import { requirementAPI } from '../../../services/api/requirementAPI';
import { useAppStrings } from '../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import { buildProjectsModulePath, buildProjectsNewAiPath } from '../../../utils/suitePathUtils';
import { queryKeys } from '../../../lib/queryKeys';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * Banner + chooser when Phase 1 artifacts are fully approved → Phase 2 Manual | AI.
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
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('manual');
  const [packId, setPackId] = useState('');
  const [methodology, setMethodology] = useState('kanban');
  const [busy, setBusy] = useState(false);

  const phase = String(deliveryPhase || '').toLowerCase();
  const gateRelevant = phase === 'requirement_analysis' || phase === 'delivery_planning';

  const { data: gaps } = useQuery({
    queryKey: ['projectAnalysisGaps', String(projectId || '')],
    queryFn: async () => unwrap(await projectAPI.getAnalysisGaps(projectId)),
    enabled: Boolean(projectId) && gateRelevant,
    staleTime: 15_000,
  });

  const { data: packs = [] } = useQuery({
    queryKey: ['requirementPacksApproved', String(organizationId || '')],
    queryFn: async () => {
      const res = await requirementAPI.listPacks(organizationId, { status: 'approved' });
      const raw = unwrap(res);
      return Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
    },
    enabled: Boolean(organizationId) && open && mode === 'ai',
    staleTime: 30_000,
  });

  const ready = Boolean(gaps?.readyForPhase2);
  const showBanner = gateRelevant && ready;

  useEffect(() => {
    if (!open || mode !== 'ai' || packId || !packs.length) return;
    const linked = packs.find((p) => String(p.projectId || '') === String(projectId));
    setPackId(String((linked || packs[0])?._id || (linked || packs[0])?.id || ''));
  }, [open, mode, packs, packId, projectId]);

  const onAdvance = useCallback(async () => {
    if (!projectId || busy) return;

    // Option B: open Blueprint AI wizard on existing project (no new birth).
    if (mode === 'ai') {
      if (!packId) {
        toast.error(t('workspace.phase2NeedPack') || 'Chọn SRS / Requirement Pack.');
        return;
      }
      setOpen(false);
      navigate(
        buildProjectsNewAiPath(organizationId, {
          projectId,
          packId,
          from: 'phase2',
        })
      );
      return;
    }

    setBusy(true);
    try {
      await projectAPI.advancePhase2(projectId, {
        mode: 'manual',
        methodology,
        importWorkItems: false,
        applyAssignees: false,
      });
      toast.success(t('workspace.phase2AdvanceSuccess') || 'Đã chuyển Phase 2 — Development');
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.project(projectId) });
      await queryClient.invalidateQueries({ queryKey: ['projectAnalysisGaps', String(projectId)] });
      navigate(
        buildProjectsModulePath(projectId, 'overview', {
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
    mode,
    packId,
    methodology,
    t,
    queryClient,
    navigate,
    organizationId,
    searchParams,
  ]);

  if (!showBanner) return null;

  return (
    <>
      <div className="mb-4 rounded-xl border border-primary/40 bg-primary/10 px-3 py-3 sm:px-4">
        <p className="text-sm font-semibold text-foreground">
          {t('workspace.phase2ReadyTitle') ||
            'Phase 1 đã đủ approve — sẵn sàng chuyển Phase 2 (Development)'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('workspace.phase2ReadyHint') ||
            'Chọn setup thủ công từ artifact đã duyệt, hoặc AI từ Excel SRS tổng hợp.'}
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
                      'Dựa trên artifact Phase 1 đã approve; tự cấu hình methodology rồi chuyển Development.'}
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer gap-2 rounded-lg border border-border p-3 text-sm">
                <input
                  type="radio"
                  name="phase2mode"
                  checked={mode === 'ai'}
                  onChange={() => setMode('ai')}
                />
                <span>
                  <span className="font-semibold">
                    {t('workspace.phase2OptionAi') || 'AI từ Excel SRS'}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t('workspace.phase2OptionAiHint') ||
                      'Dùng Requirement Pack (SRS) + import work như luồng AI cũ — trên dự án hiện tại.'}
                  </span>
                </span>
              </label>
            </div>

            {mode === 'manual' ? (
              <label className="mt-3 block text-sm">
                <span className="text-xs font-medium text-muted-foreground">Methodology</span>
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
            ) : (
              <label className="mt-3 block text-sm">
                <span className="text-xs font-medium text-muted-foreground">SRS / Pack</span>
                <select
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5"
                  value={packId}
                  onChange={(e) => setPackId(e.target.value)}
                >
                  <option value="">—</option>
                  {packs.map((p) => {
                    const id = String(p._id || p.id || '');
                    const label =
                      p.overview?.requirementName ||
                      p.overview?.projectObjective ||
                      id;
                    return (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </label>
            )}

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
                disabled={busy || (mode === 'ai' && !packId)}
                onClick={onAdvance}
              >
                {busy
                  ? t('common.saving')
                  : mode === 'ai'
                    ? t('workspace.phase2OpenAiWizard') || 'Mở AI wizard…'
                    : t('workspace.phase2Confirm') || 'Xác nhận Phase 2'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
