import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { projectAPI } from '../../../../services/api/projectAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import {
  extractApiErrorMeta,
  resolveApiErrorMessage,
} from '../../../../utils/resolveApiErrorMessage';
import { queryKeys } from '../../../../lib/queryKeys';
import { RELEASE_HANDOVER_CHECKLIST_IDS } from '../../../../utils/projectPhaseNav';
import { fetchProjectHubProject } from '../useProjectHubQueries';
import { resolveHubCapabilities } from '../hubCaps';

const TOAST_ID_CHECKLIST = 'phase4-handover-checklist';

function checklistFromProject(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const id of RELEASE_HANDOVER_CHECKLIST_IDS) {
    out[id] = src[id] === true;
  }
  return out;
}

function evidenceFromProject(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    env: String(src.env || 'production'),
    notes: String(src.notes || ''),
    pipelineUrl: String(src.pipelineUrl || ''),
    at: src.at || null,
    releaseLabelRef: String(src.releaseLabelRef || ''),
  };
}

/**
 * Shared Phase 4 handover state — checklist + deploy evidence PATCH.
 */
export default function usePhase4Handover(projectId) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const pid = String(projectId || '').trim();

  const { data: projectRow, isLoading } = useQuery({
    queryKey: queryKeys.projectHub.project(pid),
    queryFn: () => fetchProjectHubProject(pid),
    enabled: Boolean(pid),
    staleTime: 15_000,
  });

  const hubCaps = useMemo(() => resolveHubCapabilities(projectRow), [projectRow]);

  const checklist = useMemo(
    () => checklistFromProject(projectRow?.handoverChecklist),
    [projectRow?.handoverChecklist]
  );
  const evidence = useMemo(
    () => evidenceFromProject(projectRow?.deployEvidence),
    [projectRow?.deployEvidence]
  );

  const [evidenceDraft, setEvidenceDraft] = useState(null);
  const draft = evidenceDraft || evidence;

  const canPhase = Boolean(hubCaps.canChangeDeliveryPhase);
  const canAccept = Boolean(hubCaps.canAcceptHandover);
  const uatPassed = String(projectRow?.uatStatus || '') === 'pass';
  const readyConfirmed = String(projectRow?.releaseReadyStatus || '') === 'confirmed';

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.project(pid) });
  }, [queryClient, pid]);

  const showChecklistError = useCallback(
    (errOrMessage) => {
      if (typeof errOrMessage === 'string') {
        toast.error(errOrMessage, { id: TOAST_ID_CHECKLIST });
        return;
      }
      const { errorCode } = extractApiErrorMeta(errOrMessage);
      if (errorCode === 'HANDOVER_ACCEPT_FORBIDDEN') {
        toast.error(t('workspace.phaseHandoverAcceptPoOnly'), { id: TOAST_ID_CHECKLIST });
        return;
      }
      if (errorCode === 'HANDOVER_CHECKLIST_FORBIDDEN') {
        toast.error(t('workspace.phaseHandoverChecklistPmOnly'), { id: TOAST_ID_CHECKLIST });
        return;
      }
      toast.error(
        resolveApiErrorMessage(errOrMessage, {
          t,
          fallback: t('workspace.phaseHandoverChecklistFail'),
        }),
        { id: TOAST_ID_CHECKLIST }
      );
    },
    [t]
  );

  const patchMut = useMutation({
    mutationFn: async (body) =>
      projectAPI.patch(pid, body, { skipPermissionDeniedToast: true }),
    onSuccess: async () => {
      await invalidate();
    },
  });

  const setChecklistItem = useCallback(
    async (id, value) => {
      if (!pid || patchMut.isPending) return;
      if (id === 'deployment_verified' && value && !uatPassed) {
        showChecklistError(t('workspace.phaseDeployVerifyNeedUat'));
        return;
      }
      const isPoItem = id === 'acceptance_signed_off' || id === 'handover_completed';
      if (isPoItem && !canAccept) {
        showChecklistError(t('workspace.phaseHandoverAcceptPoOnly'));
        return;
      }
      if (!isPoItem && !canPhase) {
        showChecklistError(t('workspace.phaseHandoverChecklistPmOnly'));
        return;
      }
      if (id === 'deployment_verified' && value) {
        const url = String(draft.pipelineUrl || evidence.pipelineUrl || '').trim();
        if (!/^https?:\/\//i.test(url)) {
          showChecklistError(t('workspace.phaseDeployVerifyNeedUrl'));
          return;
        }
      }
      const next = { ...checklist, [id]: Boolean(value) };
      const body = { handoverChecklist: next };
      if (id === 'deployment_verified' && value) {
        body.deployEvidence = {
          env: draft.env || evidence.env || 'production',
          notes: draft.notes ?? evidence.notes,
          pipelineUrl: String(draft.pipelineUrl || evidence.pipelineUrl || '').trim(),
        };
      }
      try {
        await patchMut.mutateAsync(body);
        toast.success(t('workspace.phaseHandoverChecklistSaved'), {
          id: `${TOAST_ID_CHECKLIST}-ok`,
        });
      } catch (err) {
        showChecklistError(err);
      }
    },
    [
      pid,
      patchMut,
      uatPassed,
      canAccept,
      canPhase,
      draft,
      evidence,
      checklist,
      t,
      showChecklistError,
    ]
  );

  const saveEvidence = useCallback(async () => {
    if (!pid || !canPhase || !uatPassed || patchMut.isPending) return;
    try {
      await patchMut.mutateAsync({
        deployEvidence: {
          env: draft.env || 'production',
          notes: draft.notes,
          pipelineUrl: draft.pipelineUrl,
        },
      });
      setEvidenceDraft(null);
      toast.success(t('workspace.phaseDeployEvidenceSaved'), {
        id: `${TOAST_ID_CHECKLIST}-evidence-ok`,
      });
    } catch (err) {
      showChecklistError(err);
    }
  }, [pid, canPhase, uatPassed, draft, patchMut, t, showChecklistError]);

  const checklistDone = RELEASE_HANDOVER_CHECKLIST_IDS.filter((id) => checklist[id]).length;

  return {
    projectRow,
    isLoading,
    hubCaps,
    checklist,
    checklistDone,
    checklistTotal: RELEASE_HANDOVER_CHECKLIST_IDS.length,
    evidence,
    draft,
    setEvidenceDraft,
    canPhase,
    canAccept,
    uatPassed,
    readyConfirmed,
    busy: patchMut.isPending,
    setChecklistItem,
    saveEvidence,
    releaseLabel: String(projectRow?.releaseLabel || '').trim(),
  };
}
