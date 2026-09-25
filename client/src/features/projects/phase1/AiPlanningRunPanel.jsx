import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Play, CheckCircle2 } from 'lucide-react';
import { requirementAPI } from '../../../services/api/requirementAPI';
import { useAppStrings } from '../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * Agentic HOW phase run panel — Start → poll summary → Gate2 confirm projectPlan → promote.
 */
export default function AiPlanningRunPanel({
  organizationId,
  packId,
  canRun = false,
  canPromote = false,
  onPromoted,
  onPlanStatusChange,
}) {
  const { t } = useAppStrings();
  const [busy, setBusy] = useState(false);
  const [phaseStatus, setPhaseStatus] = useState('');
  const [planStatus, setPlanStatus] = useState('');
  const [packStatus, setPackStatus] = useState('');

  const refresh = useCallback(async () => {
    if (!organizationId || !packId) return null;
    const packRes = await requirementAPI.getPack(organizationId, packId, { view: 'full' });
    const pack = unwrap(packRes);
    setPackStatus(String(pack?.status || ''));
    const phaseHow = pack?.aiAnalysis?.phaseRuns?.phase_how || {};
    setPhaseStatus(String(phaseHow.status || ''));
    const nextPlan = String(pack?.aiAnalysis?.phaseRuns?.phase_how?.status || '');
    setPlanStatus(nextPlan);
    onPlanStatusChange?.(nextPlan, pack);
    return pack;
  }, [organizationId, packId, onPlanStatusChange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const packRes = await requirementAPI.getPack(organizationId, packId);
        const pack = unwrap(packRes);
        if (!cancelled) setPackStatus(String(pack?.status || ''));
        await refresh();
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, packId, refresh]);

  useEffect(() => {
    if (phaseStatus !== 'pending') return undefined;
    const timer = setInterval(() => {
      refresh().catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [phaseStatus, refresh]);

  const startHow = async () => {
    if (!canRun || busy || !organizationId || !packId) return;
    setBusy(true);
    try {
      await requirementAPI.startPhaseAiPlanning(organizationId, packId, { phase: 'how' });
      setPhaseStatus('pending');
      toast.success(
        t('requirements.aiPhaseRunStarted') || 'Đã bắt đầu AI Planning (agentic HOW).'
      );
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, {
          t,
          fallback: t('requirements.aiPhaseRunFail') || 'Không start được AI Planning.',
        })
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmPlan = async () => {
    if (busy || !organizationId || !packId) return;
    setBusy(true);
    try {
      await requirementAPI.confirmPhaseGate2(organizationId, packId);
      setPlanStatus('confirmed');
      onPlanStatusChange?.('confirmed');
      toast.success(t('requirements.gate2BannerConfirmed') || 'Gate 2: phase HOW confirmed.');
      await refresh();
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, {
          t,
          fallback: t('requirements.aiAnalysisConfirmFail') || 'Confirm thất bại.',
        })
      );
    } finally {
      setBusy(false);
    }
  };

  const promote = async () => {
    if (!canPromote || busy || planStatus !== 'confirmed') return;
    setBusy(true);
    try {
      const res = await requirementAPI.createProjectFromPack(organizationId, packId, {
        importWorkItems: true,
        applyAssignees: true,
      });
      const data = unwrap(res);
      toast.success(
        t('requirements.promoteProjectSuccess') || 'Dự án đã kích hoạt (sau Gate 2).'
      );
      onPromoted?.(data);
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, {
          t,
          fallback: t('requirements.createProjectFromPackFail') || 'Promote thất bại.',
        })
      );
    } finally {
      setBusy(false);
    }
  };

  if (!packId) return null;

  const gate1Done = packStatus === 'approved' || packStatus === 'project_linked';
  // Draft / under_review: WHAT runs first — hide HOW until Gate 1.
  if (!gate1Done && packStatus) return null;
  if (!packStatus) return null;

  const phaseReady = phaseStatus === 'ready' || planStatus === 'ready' || planStatus === 'confirmed';

  return (
    <section className="mb-4 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">
        {t('requirements.aiPlanningRunTitle') || 'AI Planning (Agentic HOW)'}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('requirements.aiPlanningRunHint') ||
          'Sau Gate 1: Start một phase-run (không Run từng job). Confirm projectPlan = Gate 2, rồi kích hoạt dự án.'}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Pack: {packStatus || '—'}</span>
        <span>·</span>
        <span>Phase HOW: {phaseStatus || '—'}</span>
        <span>·</span>
        <span>phase_how: {planStatus || '—'}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canRun || !gate1Done || busy || phaseStatus === 'pending'}
          onClick={startHow}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {phaseStatus === 'pending' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {t('requirements.aiPlanningStart') || 'Chạy AI Planning'}
        </button>
        {phaseReady && planStatus !== 'confirmed' ? (
          <button
            type="button"
            disabled={busy}
            onClick={confirmPlan}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted/50 disabled:opacity-40"
          >
            <CheckCircle2 className="h-4 w-4" />
            {t('requirements.gate2ConfirmPlan') || 'Confirm plan (Gate 2)'}
          </button>
        ) : null}
        {planStatus === 'confirmed' && canPromote && packStatus !== 'project_linked' ? (
          <button
            type="button"
            disabled={busy}
            onClick={promote}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600/40 px-3 py-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300 disabled:opacity-40"
          >
            {t('requirements.promoteProject') || 'Kích hoạt dự án'}
          </button>
        ) : null}
      </div>
    </section>
  );
}
