import { useCallback, useEffect, useState } from 'react';
import { requirementAPI } from '../../services/api/requirementAPI';
import {
  AI_ANALYSIS_JOBS,
  assertSingleJob,
  canRunJob,
  jobIndex,
} from './aiAnalysisWizardConstants';

/**
 * W8 — poll + run/confirm one Blueprint job at a time (no Run all).
 */
export function useAiAnalysisBlueprintWizard({ organizationId, packId, enabled = true }) {
  const [summary, setSummary] = useState(null);
  const [wizardDto, setWizardDto] = useState(null);
  const [activeJob, setActiveJob] = useState(AI_ANALYSIS_JOBS[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const refreshSummary = useCallback(async () => {
    if (!organizationId || !packId) return null;
    const res = await requirementAPI.getAiAnalysis(organizationId, packId, {
      view: 'summary',
    });
    const data = res?.data?.data ?? res?.data ?? null;
    setSummary(data);
    return data;
  }, [organizationId, packId]);

  // Require explicit job — do not close over activeJob (avoids remount race that resets View).
  const refreshWizard = useCallback(
    async (job) => {
      if (!organizationId || !packId) return null;
      const jobId = assertSingleJob(job);
      const res = await requirementAPI.getAiAnalysis(organizationId, packId, {
        view: 'wizard',
        job: jobId,
      });
      const data = res?.data?.data ?? res?.data ?? null;
      setWizardDto(data);
      return data;
    },
    [organizationId, packId]
  );

  // Auto-advance only when pack/enabled changes — not when user selects View.
  useEffect(() => {
    if (!enabled || !organizationId || !packId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const s = await refreshSummary();
        if (cancelled) return;
        const jobs = s?.jobs || {};
        const next =
          AI_ANALYSIS_JOBS.find((j) => jobs[j.id]?.status !== 'confirmed')?.id ||
          AI_ANALYSIS_JOBS[AI_ANALYSIS_JOBS.length - 1].id;
        setActiveJob(next);
        await refreshWizard(next);
      } catch (err) {
        if (!cancelled) setError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, organizationId, packId, refreshSummary, refreshWizard]);

  const runJob = useCallback(
    async (jobOverride = null, options = {}) => {
      const raw = typeof jobOverride === 'string' ? jobOverride : activeJob;
      const job = assertSingleJob(raw);
      const force = Boolean(options.force);
      if (!canRunJob(summary?.jobs, job)) {
        setError(new Error('Previous job must be confirmed'));
        return null;
      }
      setBusy(true);
      setError(null);
      setActiveJob(job);
      try {
        await requirementAPI.runAiAnalysis(organizationId, packId, job, { force });
        const s = await refreshSummary();
        await refreshWizard(job);
        return s;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [activeJob, summary, organizationId, packId, refreshSummary, refreshWizard]
  );

  const confirmJob = useCallback(
    async (edits = null, jobOverride = null) => {
      const raw = typeof jobOverride === 'string' ? jobOverride : activeJob;
      const job = assertSingleJob(raw);
      setBusy(true);
      setError(null);
      setActiveJob(job);
      try {
        await requirementAPI.confirmAiAnalysis(organizationId, packId, job, edits);
        const s = await refreshSummary();
        const idx = jobIndex(job);
        const nextJob = AI_ANALYSIS_JOBS[Math.min(idx + 1, AI_ANALYSIS_JOBS.length - 1)].id;
        setActiveJob(nextJob);
        await refreshWizard(nextJob);
        return s;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [activeJob, organizationId, packId, refreshSummary, refreshWizard]
  );

  return {
    jobs: AI_ANALYSIS_JOBS,
    summary,
    wizardDto,
    activeJob,
    setActiveJob,
    busy,
    error,
    canRun: canRunJob(summary?.jobs, activeJob),
    runJob,
    confirmJob,
    refreshSummary,
    refreshWizard,
  };
}
