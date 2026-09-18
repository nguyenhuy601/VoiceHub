import { useCallback, useEffect, useState } from 'react';
import { requirementAPI } from '../../services/api/requirementAPI';
import { unwrapRequirementPayload } from '../projects/aiWizard/aiWizardConstants';
import { AI_ANALYSIS_JOBS } from './aiAnalysisWizardConstants';

const DEFAULT_JOB = AI_ANALYSIS_JOBS[0]?.id || 'hierarchyDecomposition';

function resolveErrorMessage(error) {
  return (
    error?.response?.data?.message ||
    error?.message ||
    'AI Analysis request failed'
  );
}

/**
 * Controller cho AiAnalysisBlueprintWizard / CreateProjectAiWizard.
 * GET/POST /projects/requirements/:packId/ai-analysis — BE service đã có, route có thể chưa mount.
 */
export function useAiAnalysisBlueprintWizard({
  organizationId = '',
  packId = '',
  enabled = true,
} = {}) {
  const orgId = String(organizationId || '').trim();
  const pid = String(packId || '').trim();
  const canFetch = Boolean(enabled && orgId && pid);

  const [summary, setSummary] = useState(null);
  const [wizardDto, setWizardDto] = useState(null);
  const [activeJob, setActiveJob] = useState(DEFAULT_JOB);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const refreshWizard = useCallback(
    async (jobId) => {
      if (!canFetch) return null;
      const job = String(jobId || activeJob || DEFAULT_JOB).trim();
      const [summaryRes, jobRes] = await Promise.all([
        requirementAPI.getAiAnalysis(orgId, pid, { view: 'summary' }),
        requirementAPI.getAiAnalysis(orgId, pid, { job }),
      ]);
      const nextSummary = unwrapRequirementPayload(summaryRes);
      const nextDto = unwrapRequirementPayload(jobRes);
      setSummary(nextSummary);
      setWizardDto(nextDto);
      return { summary: nextSummary, wizardDto: nextDto };
    },
    [canFetch, orgId, pid, activeJob]
  );

  useEffect(() => {
    if (!canFetch) {
      setSummary(null);
      setWizardDto(null);
      setError(null);
      return undefined;
    }
    let cancelled = false;
    setBusy(true);
    setError(null);
    refreshWizard(activeJob)
      .catch((err) => {
        if (!cancelled) setError(resolveErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canFetch, activeJob, refreshWizard]);

  const runJob = useCallback(
    async (jobId, options = {}) => {
      if (!canFetch) return null;
      const job = String(jobId || activeJob || DEFAULT_JOB).trim();
      setBusy(true);
      setError(null);
      try {
        await requirementAPI.runAiAnalysisJob(orgId, pid, job, options);
        return await refreshWizard(job);
      } catch (err) {
        setError(resolveErrorMessage(err));
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [canFetch, orgId, pid, activeJob, refreshWizard]
  );

  const confirmJob = useCallback(
    async (_decisions, jobId) => {
      if (!canFetch) return null;
      const job = String(jobId || activeJob || DEFAULT_JOB).trim();
      setBusy(true);
      setError(null);
      try {
        await requirementAPI.confirmAiAnalysisJob(orgId, pid, job);
        return await refreshWizard(job);
      } catch (err) {
        setError(resolveErrorMessage(err));
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [canFetch, orgId, pid, activeJob, refreshWizard]
  );

  return {
    summary,
    wizardDto,
    activeJob,
    setActiveJob,
    busy,
    error,
    runJob,
    confirmJob,
    refreshWizard,
  };
}

export default useAiAnalysisBlueprintWizard;
