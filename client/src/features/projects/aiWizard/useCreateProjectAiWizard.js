import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAppStrings } from '../../../locales/appStrings';
import { requirementAPI } from '../../../services/api/requirementAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import useRequirementAccess from '../../../hooks/useRequirementAccess';
import {
  AI_WIZARD_STEPS,
  canRunAiOnPack,
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
  const { access, loading: accessLoading } = useRequirementAccess(orgId);

  const [step, setStep] = useState(0);
  const [slideDir, setSlideDir] = useState('forward');
  const [busy, setBusy] = useState(false);
  const [sourceMode, setSourceMode] = useState('upload'); // upload | pick
  const [preview, setPreview] = useState(null);
  const [approvedPacks, setApprovedPacks] = useState([]);
  const [packsLoading, setPacksLoading] = useState(false);
  const [pack, setPack] = useState(null);
  const [confirmForm, setConfirmForm] = useState(() => emptyConfirmForm(null));

  const stepId = AI_WIZARD_STEPS[step]?.id || 'source';
  const packId = String(pack?._id || '').trim();

  const patchConfirmForm = useCallback((patch) => {
    setConfirmForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const refreshPack = useCallback(
    async (id = packId) => {
      if (!orgId || !id) return null;
      const res = await requirementAPI.getPack(orgId, id);
      const next = unwrapRequirementPayload(res);
      setPack(next);
      return next;
    },
    [orgId, packId]
  );

  const loadApprovedPacks = useCallback(async () => {
    if (!orgId) return;
    setPacksLoading(true);
    try {
      const res = await requirementAPI.listPacks(orgId, { status: 'approved' });
      const data = unwrapRequirementPayload(res);
      const list = Array.isArray(data) ? data : Array.isArray(data?.packs) ? data.packs : [];
      setApprovedPacks(list.filter((p) => String(p?.status || '') === 'approved'));
    } catch (error) {
      setApprovedPacks([]);
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('requirements.loadPackFail') }));
    } finally {
      setPacksLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    if (sourceMode === 'pick' && orgId) {
      loadApprovedPacks();
    }
  }, [sourceMode, orgId, loadApprovedPacks]);

  useEffect(() => {
    if (pack) {
      setConfirmForm(emptyConfirmForm(pack));
    }
  }, [pack?._id]);

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

  const previewUpload = useCallback(
    async (file) => {
      if (!orgId || !file || busy) return;
      setBusy(true);
      try {
        const res = await requirementAPI.previewImport(orgId, file);
        setPreview(unwrapRequirementPayload(res));
        setPack(null);
      } catch (error) {
        setPreview(null);
        toast.error(resolveApiErrorMessage(error, { t, fallback: t('requirements.previewFail') }));
      } finally {
        setBusy(false);
      }
    },
    [busy, orgId, t]
  );

  const confirmUpload = useCallback(async () => {
    const sessionId = String(preview?.sessionId || '').trim();
    if (!orgId || !sessionId || busy) return;
    setBusy(true);
    try {
      const res = await requirementAPI.confirmImport(orgId, sessionId);
      const data = unwrapRequirementPayload(res);
      const imported = data?.pack || data;
      setPreview(null);
      const ready = await ensureLifecycleForWizard(imported);
      setPack(ready);
      toast.success(t('requirements.importSuccess'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('requirements.importFail') }));
    } finally {
      setBusy(false);
    }
  }, [busy, ensureLifecycleForWizard, orgId, preview?.sessionId, t]);

  const selectApprovedPack = useCallback(
    async (selected) => {
      const id = String(selected?._id || '').trim();
      if (!orgId || !id || busy) return;
      setBusy(true);
      try {
        const res = await requirementAPI.getPack(orgId, id);
        setPack(unwrapRequirementPayload(res));
        setPreview(null);
      } catch (error) {
        toast.error(resolveApiErrorMessage(error, { t, fallback: t('requirements.loadPackFail') }));
      } finally {
        setBusy(false);
      }
    },
    [busy, orgId, t]
  );

  const runAiPlanning = useCallback(async () => {
    if (!orgId || !packId || busy) return;
    setBusy(true);
    try {
      let current = pack;
      if (current?.status === 'draft' || current?.status === 'under_review') {
        current = await ensureLifecycleForWizard(current);
      }
      if (!canRunAiOnPack(current)) {
        toast.error(t('aiCreateWizard.packNotReadyForAi'));
        return;
      }
      const res = await requirementAPI.runAiPlanning(orgId, String(current._id));
      setPack(unwrapRequirementPayload(res));
      toast.success(t('requirements.aiPlanningSuccess'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('requirements.aiPlanningFail') }));
      await refreshPack().catch(() => null);
    } finally {
      setBusy(false);
    }
  }, [busy, ensureLifecycleForWizard, orgId, pack, packId, refreshPack, t]);

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
      if (!packId) {
        toast.error(t('aiCreateWizard.needPack'));
        return;
      }
      setBusy(true);
      try {
        const ready = await ensureLifecycleForWizard(pack);
        if (!canRunAiOnPack(ready)) {
          toast.error(t('aiCreateWizard.packNotReadyForAi'));
          return;
        }
      } catch (error) {
        toast.error(resolveApiErrorMessage(error, { t, fallback: t('aiCreateWizard.needPack') }));
        return;
      } finally {
        setBusy(false);
      }
    }

    if (stepId === 'planning') {
      const status = String(pack?.aiPlanning?.status || 'none');
      if (status !== 'ready' && status !== 'failed') {
        toast.error(t('aiCreateWizard.needRunAiFirst'));
        return;
      }
    }

    setSlideDir('forward');
    setStep((s) => Math.min(AI_WIZARD_STEPS.length - 1, s + 1));
  }, [ensureLifecycleForWizard, pack, packId, step, stepId, t]);

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
      // create-from-pack seeds only the creator — no AI auto-assign roster
      const res = await requirementAPI.createProjectFromPack(orgId, String(current._id), {
        title,
      });
      const data = unwrapRequirementPayload(res);
      toast.success(t('requirements.createProjectSuccess'));
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
    onCreated,
    orgId,
    pack,
    packId,
    t,
  ]);

  const previewTree = useMemo(() => {
    if (preview?.previewTree) return preview.previewTree;
    if (pack?.functionalRequirements) return pack.functionalRequirements;
    return [];
  }, [pack, preview]);

  const overlay = pack?.aiPlanning?.overlay || {};

  return {
    access,
    accessLoading,
    step,
    stepId,
    steps: AI_WIZARD_STEPS,
    slideDir,
    busy,
    sourceMode,
    setSourceMode,
    preview,
    setPreview,
    approvedPacks,
    packsLoading,
    pack,
    packId,
    confirmForm,
    patchConfirmForm,
    previewTree,
    overlay,
    previewUpload,
    confirmUpload,
    selectApprovedPack,
    runAiPlanning,
    approveStaffing,
    discardStaffing,
    goBack,
    goNext,
    createProject,
    canRunAiOnPack: canRunAiOnPack(pack),
  };
}
