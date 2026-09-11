import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStrings } from '../../../locales/appStrings';
import { requirementAPI } from '../../../services/api/requirementAPI';
import { projectAPI } from '../../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import useRequirementAccess from '../../../hooks/useRequirementAccess';
import useRequirementPacks from '../../../hooks/useRequirementPacks';
import { queryKeys } from '../../../lib/queryKeys';
import { AI_ANALYSIS_JOBS, areAllAnalysisJobsConfirmed } from '../../requirements/aiAnalysisWizardConstants';
import {
  AI_WIZARD_STEPS,
  canRunAiOnPack,
  unwrapRequirementPayload,
} from './aiWizardConstants';
import { isProjectDateRangeInvalid } from '../hub/projectHubUtils';

function toDateInput(value) {
  if (!value) return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function emptyConfirmForm(pack) {
  const overview = pack?.overview || {};
  const staffing = pack?.staffingPlan || {};
  const start = toDateInput(overview.startDate || staffing.startDate);
  const end = toDateInput(overview.deadline);
  return {
    title: String(overview.requirementName || pack?.sourceFileName || '').trim(),
    description: String(overview.projectObjective || '').trim(),
    startDate: start,
    dueDate: end,
  };
}

export default function useCreateProjectAiWizard({
  organizationId,
  existingProjectId = '',
  initialPackId = '',
  onCreated,
} = {}) {
  const { t } = useAppStrings();
  const orgId = String(organizationId || '').trim();
  const phase2ProjectId = String(existingProjectId || '').trim();
  const isPhase2Ai = Boolean(phase2ProjectId);
  const queryClient = useQueryClient();
  const { access, loading: accessLoading } = useRequirementAccess(orgId);
  /** Same gate as CreateProjectAiWizard no-access UI — avoid listPacks before access / without rights. */
  const canUseAiWizard = Boolean(access?.canRunAiPlanning);
  const packsQueryEnabled = Boolean(orgId) && !accessLoading && canUseAiWizard;

  const [step, setStep] = useState(0);
  const [slideDir, setSlideDir] = useState('forward');
  const [busy, setBusy] = useState(false);
  const [pack, setPack] = useState(null);
  const [confirmForm, setConfirmForm] = useState(() => emptyConfirmForm(null));
  const [initialPackHydrated, setInitialPackHydrated] = useState(false);
  const {
    packs: approvedPacks,
    loading: packsLoading,
    isError: packsError,
    reload: loadApprovedPacks,
  } = useRequirementPacks(orgId, { status: 'approved', enabled: packsQueryEnabled });

  const stepId = AI_WIZARD_STEPS[step]?.id || 'source';
  const packId = String(pack?._id || '').trim();

  const patchConfirmForm = useCallback((patch) => {
    setConfirmForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const hydrateWizardPack = useCallback(
    async (id) => {
      const packKey = String(id || '').trim();
      if (!orgId || !packKey) return null;
      try {
        const res = await requirementAPI.getPack(orgId, packKey, { view: 'wizard' });
        const next = unwrapRequirementPayload(res);
        setPack((prev) => (String(prev?._id || '') === packKey ? next : prev));
        return next;
      } catch {
        return null;
      }
    },
    [orgId]
  );

  useEffect(() => {
    if (!packsError) return;
    toast.error(t('aiCreateWizard.loadPacksFail'));
  }, [packsError, t]);

  /** Prefill pack from Phase 2 gate (packId query). */
  useEffect(() => {
    const want = String(initialPackId || '').trim();
    if (!want || !orgId || accessLoading || !canUseAiWizard || initialPackHydrated) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const res = await requirementAPI.getPack(orgId, want, { view: 'wizard' });
        if (cancelled) return;
        const next = unwrapRequirementPayload(res);
        setPack(next);
        setConfirmForm(emptyConfirmForm(next));
        setInitialPackHydrated(true);
        if (canRunAiOnPack(next)) {
          setSlideDir('forward');
          setStep(1);
        }
      } catch {
        if (!cancelled) setInitialPackHydrated(true);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialPackId, orgId, accessLoading, canUseAiWizard, initialPackHydrated]);

  useEffect(() => {
    if (pack) {
      setConfirmForm(emptyConfirmForm(pack));
    }
  }, [pack?._id]);

  /** List row thiếu projectObjective — điền sau hydrate view=wizard. */
  useEffect(() => {
    const objective = String(pack?.overview?.projectObjective || '').trim();
    if (!objective) return;
    setConfirmForm((prev) => (prev.description ? prev : { ...prev, description: objective }));
  }, [pack?._id, pack?.overview?.projectObjective]);

  /** Draft → under_review (if can submit); under_review → approved (if can approve). */
  const ensureLifecycleForWizard = useCallback(
    async (current) => {
      let next = current;
      if (!next || !orgId) return next;
      const id = String(next._id || '').trim();

      if (next.status === 'draft') {
        if (!access.canSubmit) {
          const err = new Error(t('aiCreateWizard.needSubmitterForDraft'));
          err.statusCode = 403;
          throw err;
        }
        const res = await requirementAPI.submitPack(orgId, id);
        next = unwrapRequirementPayload(res);
      }

      if (next.status === 'under_review') {
        if (!access.canApprove) {
          const err = new Error(t('aiCreateWizard.needApproverForReview'));
          err.statusCode = 403;
          throw err;
        }
        const res = await requirementAPI.approvePack(orgId, id);
        next = unwrapRequirementPayload(res);
      }

      setPack(next);
      return next;
    },
    [access.canApprove, access.canSubmit, orgId, t]
  );

  const tryAdvanceFromSource = useCallback(
    async (current) => {
      if (!current) {
        toast.error(t('aiCreateWizard.needPack'));
        return false;
      }
      try {
        const ready = await ensureLifecycleForWizard(current);
        if (!canRunAiOnPack(ready)) {
          toast.error(t('aiCreateWizard.packNotReadyForAi'));
          return false;
        }
      } catch (error) {
        toast.error(resolveApiErrorMessage(error, { t, fallback: t('aiCreateWizard.needPack') }));
        return false;
      }
      setSlideDir('forward');
      setStep((s) => Math.min(AI_WIZARD_STEPS.length - 1, s + 1));
      return true;
    },
    [ensureLifecycleForWizard, t]
  );

  const selectApprovedPack = useCallback(
    async (selected) => {
      const id = String(selected?._id || '').trim();
      if (!orgId || !id || busy) return;
      setBusy(true);
      try {
        setPack(selected);
        const advanced = await tryAdvanceFromSource(selected);
        if (advanced) {
          void hydrateWizardPack(id);
        }
      } catch (error) {
        toast.error(resolveApiErrorMessage(error, { t, fallback: t('requirements.loadPackFail') }));
      } finally {
        setBusy(false);
      }
    },
    [busy, hydrateWizardPack, orgId, t, tryAdvanceFromSource]
  );

  const goBack = useCallback(() => {
    if (step <= 0) return;
    setSlideDir('back');
    setStep((s) => Math.max(0, s - 1));
  }, [step]);

  const goNext = useCallback(async () => {
    if (step >= AI_WIZARD_STEPS.length - 1) return;

    if (stepId === 'source') {
      setBusy(true);
      try {
        const advanced = await tryAdvanceFromSource(pack);
        if (advanced && packId) {
          void hydrateWizardPack(packId);
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    if (stepId === 'analysis') {
      if (!orgId || !packId) {
        toast.error(t('aiCreateWizard.needPack'));
        return;
      }
      setBusy(true);
      try {
        const res = await requirementAPI.getAiAnalysis(orgId, packId, { view: 'summary' });
        const summary = unwrapRequirementPayload(res);
        if (!areAllAnalysisJobsConfirmed(summary?.jobs)) {
          toast.error(t('aiCreateWizard.needConfirmAllAnalysisJobs'));
          return;
        }
      } catch (error) {
        toast.error(
          resolveApiErrorMessage(error, { t, fallback: t('aiCreateWizard.needConfirmAllAnalysisJobs') })
        );
        return;
      } finally {
        setBusy(false);
      }
    }

    setSlideDir('forward');
    setStep((s) => Math.min(AI_WIZARD_STEPS.length - 1, s + 1));
  }, [hydrateWizardPack, orgId, pack, packId, step, stepId, t, tryAdvanceFromSource]);

  const createProject = useCallback(async () => {
    if (!orgId || !packId || busy) return;
    const title = String(confirmForm.title || '').trim();
    if (!title && !isPhase2Ai) {
      toast.error(t('aiCreateWizard.titleRequired'));
      return;
    }
    if (isProjectDateRangeInvalid(confirmForm.startDate, confirmForm.dueDate)) {
      toast.error(t('aiCreateWizard.dateRangeInvalid'));
      return;
    }
    setBusy(true);
    try {
      let current = pack;
      if (current?.status !== 'approved' && current?.status !== 'project_linked') {
        current = await ensureLifecycleForWizard(current);
      }
      const st = String(current?.status || '');
      if (st !== 'approved' && st !== 'project_linked') {
        toast.error(t('aiCreateWizard.needApprovedPack'));
        return;
      }

      if (isPhase2Ai) {
        const res = await projectAPI.advancePhase2(phase2ProjectId, {
          mode: 'ai',
          packId: String(current._id),
          importWorkItems: true,
          applyAssignees: true,
        });
        const data = res?.data?.data ?? res?.data ?? res;
        toast.success(t('workspace.phase2AdvanceSuccess') || t('requirements.createProjectSuccess'));
        await queryClient.invalidateQueries({
          queryKey: [...queryKeys.requirements.all, 'packs', orgId],
        });
        await queryClient.invalidateQueries({
          queryKey: queryKeys.projectHub.project(phase2ProjectId),
        });
        onCreated?.({
          projectId: phase2ProjectId,
          project: { _id: phase2ProjectId, ...(data || {}) },
          ...data,
          phase2: true,
        });
        return;
      }

      const res = await requirementAPI.createProjectFromPack(orgId, String(current._id), {
        title,
        startDate: confirmForm.startDate || null,
        dueDate: confirmForm.dueDate || null,
        importWorkItems: true,
        applyAssignees: true,
      });
      const data = unwrapRequirementPayload(res);
      toast.success(t('requirements.createProjectSuccess'));
      await queryClient.invalidateQueries({
        queryKey: [...queryKeys.requirements.all, 'packs', orgId],
      });
      onCreated?.(data);
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, {
          t,
          fallback: isPhase2Ai
            ? t('workspace.phase2AdvanceFail') || t('requirements.createProjectFail')
            : t('requirements.createProjectFail'),
        })
      );
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    confirmForm.dueDate,
    confirmForm.startDate,
    confirmForm.title,
    ensureLifecycleForWizard,
    isPhase2Ai,
    onCreated,
    orgId,
    pack,
    packId,
    phase2ProjectId,
    queryClient,
    t,
  ]);

  return {
    access,
    accessLoading,
    step,
    stepId,
    steps: AI_WIZARD_STEPS,
    slideDir,
    busy,
    approvedPacks,
    packsLoading,
    packsError,
    pack,
    packId,
    confirmForm,
    patchConfirmForm,
    selectApprovedPack,
    loadApprovedPacks,
    goBack,
    goNext,
    createProject,
    canRunAiOnPack: canRunAiOnPack(pack),
    analysisJobCount: AI_ANALYSIS_JOBS.length,
    isPhase2Ai,
    existingProjectId: phase2ProjectId,
  };
}
