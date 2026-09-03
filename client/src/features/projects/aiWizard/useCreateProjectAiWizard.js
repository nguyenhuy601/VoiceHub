import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStrings } from '../../../locales/appStrings';
import { requirementAPI } from '../../../services/api/requirementAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import useRequirementAccess from '../../../hooks/useRequirementAccess';
import useRequirementPacks from '../../../hooks/useRequirementPacks';
import { queryKeys } from '../../../lib/queryKeys';
import {
  AI_WIZARD_STEPS,
  canRunAiOnPack,
  initLeafAssignMapFromOverlay,
  unwrapRequirementPayload,
} from './aiWizardConstants';

function emptyConfirmForm(pack) {
  const overview = pack?.overview || {};
  const start = overview.startDate ? String(overview.startDate).slice(0, 10) : '';
  const end = overview.deadline ? String(overview.deadline).slice(0, 10) : '';
  return {
    title: String(overview.requirementName || pack?.sourceFileName || '').trim(),
    description: String(overview.projectObjective || '').trim(),
    startDate: start,
    dueDate: end,
  };
}

export default function useCreateProjectAiWizard({
  organizationId,
  onCreated,
} = {}) {
  const { t } = useAppStrings();
  const orgId = String(organizationId || '').trim();
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
  const [leafAssignMap, setLeafAssignMap] = useState({});
  const [assignRoleFilter, setAssignRoleFilter] = useState('');
  const [enrichBusy, setEnrichBusy] = useState(false);

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

  const refreshPack = useCallback(
    async (id = packId) => {
      if (!orgId || !id) return null;
      const res = await requirementAPI.getPack(orgId, id, { view: 'wizard' });
      const next = unwrapRequirementPayload(res);
      setPack(next);
      return next;
    },
    [orgId, packId]
  );

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

  const overlay = pack?.aiPlanning?.overlay || {};

  useEffect(() => {
    if (Array.isArray(overlay.leafAssignments) && overlay.leafAssignments.length) {
      setLeafAssignMap(initLeafAssignMapFromOverlay(overlay));
    }
  }, [pack?._id, overlay.generatedAt]);

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

  const runAiPlanning = useCallback(async () => {
    if (!orgId || !packId || busy) return;
    setBusy(true);
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
      let current = pack;
      if (current?.status === 'draft' || current?.status === 'under_review') {
        current = await ensureLifecycleForWizard(current);
      }
      if (!canRunAiOnPack(current)) {
        toast.error(t('aiCreateWizard.packNotReadyForAi'));
        return;
      }
      const res = await requirementAPI.runAiPlanning(orgId, String(current._id), {
        phase: 'staffing',
        timeout: 300000,
      });
      setPack(unwrapRequirementPayload(res));
      toast.success(t('requirements.aiPlanningSuccess'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('requirements.aiPlanningFail') }));
      await refreshPack().catch(() => null);
    } finally {
      setBusy(false);
    }
  }, [busy, ensureLifecycleForWizard, orgId, pack, packId, refreshPack, t]);

  const runEnrich = useCallback(async () => {
    if (!orgId || !packId || busy || enrichBusy) return;
    setEnrichBusy(true);
    setPack((prev) => {
      if (!prev) return prev;
      const overlayPrev = prev.aiPlanning?.overlay || {};
      const llmPrev = overlayPrev.llm && typeof overlayPrev.llm === 'object' ? overlayPrev.llm : {};
      return {
        ...prev,
        aiPlanning: {
          ...(prev.aiPlanning || {}),
          status: prev.aiPlanning?.status || 'ready',
          overlay: {
            ...overlayPrev,
            llm: {
              ...llmPrev,
              enrichStatus: 'pending',
              enrichError: null,
            },
          },
        },
      };
    });
    try {
      const res = await requirementAPI.runAiPlanning(orgId, packId, {
        phase: 'enrich',
        timeout: 300000,
      });
      setPack(unwrapRequirementPayload(res));
      toast.success(t('aiCreateWizard.enrichSuccess'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('aiCreateWizard.enrichFail') }));
      await refreshPack().catch(() => null);
    } finally {
      setEnrichBusy(false);
    }
  }, [busy, enrichBusy, orgId, packId, refreshPack, t]);

  const approveStaffing = useCallback(async () => {
    if (!orgId || !packId || busy) return;
    setBusy(true);
    try {
      const res = await requirementAPI.approveAiStaffing(orgId, packId);
      setPack(unwrapRequirementPayload(res));
      toast.success(t('requirements.aiStaffingApproveSuccess'));
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('requirements.aiStaffingApproveFail') })
      );
    } finally {
      setBusy(false);
    }
  }, [busy, orgId, packId, t]);

  const discardStaffing = useCallback(async () => {
    if (!orgId || !packId || busy) return;
    setBusy(true);
    try {
      const res = await requirementAPI.discardAiStaffing(orgId, packId);
      setPack(unwrapRequirementPayload(res));
      toast.success(t('requirements.aiStaffingDiscardSuccess'));
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('requirements.aiStaffingDiscardFail') })
      );
    } finally {
      setBusy(false);
    }
  }, [busy, orgId, packId, t]);

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

    if (stepId === 'planning') {
      const status = String(pack?.aiPlanning?.status || 'none');
      if (status === 'pending') {
        toast.error(t('aiCreateWizard.needRunAiPending'));
        return;
      }
      if (status !== 'ready' && status !== 'failed') {
        toast.error(t('aiCreateWizard.needRunAiFirst'));
        return;
      }
    }

    if (stepId === 'assign') {
      const leaves = overlay.leafAssignments || [];
      const unassigned = leaves.filter((row) => {
        const ext = String(row.externalId || '').trim();
        return ext && !String(leafAssignMap[ext] || '').trim();
      });
      if (unassigned.length > 0) {
        toast(t('aiCreateWizard.assignUnassignedWarning'), { icon: 'ℹ️' });
      }
    }

    setSlideDir('forward');
    setStep((s) => Math.min(AI_WIZARD_STEPS.length - 1, s + 1));
  }, [
    hydrateWizardPack,
    leafAssignMap,
    overlay.leafAssignments,
    pack,
    packId,
    step,
    stepId,
    t,
    tryAdvanceFromSource,
  ]);

  const patchLeafAssign = useCallback((externalId, userId) => {
    const ext = String(externalId || '').trim();
    if (!ext) return;
    setLeafAssignMap((prev) => ({ ...prev, [ext]: String(userId || '') }));
  }, []);

  const applyAiLeafSuggestions = useCallback(() => {
    setLeafAssignMap(initLeafAssignMapFromOverlay(overlay));
    toast.success(t('aiCreateWizard.assignApplyAiDone'));
  }, [overlay, t]);

  const createProject = useCallback(async () => {
    if (!orgId || !packId || busy) return;
    const title = String(confirmForm.title || '').trim();
    if (!title) {
      toast.error(t('aiCreateWizard.titleRequired'));
      return;
    }
    setBusy(true);
    try {
      let current = pack;
      if (current?.status !== 'approved') {
        current = await ensureLifecycleForWizard(current);
      }
      if (String(current?.status || '') !== 'approved') {
        toast.error(t('aiCreateWizard.needApprovedPack'));
        return;
      }
      const leafAssignments = Object.entries(leafAssignMap).map(([externalId, userId]) => ({
        externalId,
        userId: userId ? String(userId) : null,
      }));
      const res = await requirementAPI.createProjectFromPack(orgId, String(current._id), {
        title,
        importWorkItems: true,
        leafAssignments,
      });
      const data = unwrapRequirementPayload(res);
      toast.success(t('requirements.createProjectSuccess'));
      await queryClient.invalidateQueries({
        queryKey: [...queryKeys.requirements.all, 'packs', orgId],
      });
      onCreated?.(data);
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('requirements.createProjectFail') })
      );
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    confirmForm.title,
    ensureLifecycleForWizard,
    leafAssignMap,
    onCreated,
    orgId,
    pack,
    packId,
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
    enrichBusy,
    approvedPacks,
    packsLoading,
    packsError,
    pack,
    packId,
    confirmForm,
    patchConfirmForm,
    overlay,
    leafAssignMap,
    assignRoleFilter,
    setAssignRoleFilter,
    patchLeafAssign,
    applyAiLeafSuggestions,
    selectApprovedPack,
    loadApprovedPacks,
    runAiPlanning,
    runEnrich,
    approveStaffing,
    discardStaffing,
    goBack,
    goNext,
    createProject,
    canRunAiOnPack: canRunAiOnPack(pack),
  };
}
