import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { requirementAPI } from '../../../../services/api/requirementAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useRequirementAccess from '../../../../hooks/useRequirementAccess';
import { useNetworkStatus } from '../../../../hooks/useNetworkStatus';
import {
  approveRequirementPackWithGate1,
  formatGate1ApproveError,
} from '../../../requirements/approveRequirementPackWithGate1';
import useReviewNotePrompt from '../../../../hooks/useReviewNotePrompt';
import ConfirmDialog from '../../../../components/Shared/ConfirmDialog';
import { buildGate1ProposalItems } from '../buildGate1ProposalItems';
import { attachConflictAmbiguityToGate1Bundle } from '../gate1/resolveConflictAmbiguityUi';
import useProjectCapabilities from '../hooks/useProjectCapabilities';
import AiHitlMonitorPanel from './AiHitlMonitorPanel';
import AiHitlReviewPanel from './AiHitlReviewPanel';
import GateActionOverlay from './GateActionOverlay';
import { resolveAiHitlReviewMode } from './aiHitlReviewMode';
import { resolveGate1ReviewLane, resolveGate1ReviewView } from './gate1ReviewLane';
import { useAuth } from '../../../../context/AuthContext';
import { resolveGate2ReviewLane, resolveGate2ReviewView, openParallelTracks } from './gate2ReviewLane';
import { resolveHitlRequirementFlags } from './resolveHitlRequirementFlags';
import {
  isPhaseInFlightStatus,
  protectPackDuringFreshRunAwait,
} from './freshRunUiGuard';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function textOr(t, key, vars) {
  const value = typeof t === 'function' ? t(key, vars) : undefined;
  if (value == null || value === '' || value === key) return '';
  return value;
}

function buildGate1Summary(pack) {
  const g4 = pack?.aiAnalysis?.analyses?.g4Understanding;
  const proposal = pack?.aiAnalysis?.analyses?.srsProposal;
  const phaseWhat = pack?.aiAnalysis?.phaseRuns?.phase_what;
  const bundle = attachConflictAmbiguityToGate1Bundle(
    buildGate1ProposalItems({ pack, g4, proposal }),
    pack,
    g4
  );
  const decisions = proposal?.review?.decisions || {};
  const expectedRevisionIds = {};
  for (const [logicalId, d] of Object.entries(decisions)) {
    if (d?.revisionId) expectedRevisionIds[logicalId] = String(d.revisionId);
  }

  return {
    done: true,
    proposalItems: bundle.items,
    reviewItems: bundle.items,
    proposalBySection: bundle.bySection || {},
    proposalSections: bundle.sections,
    sectionReviews: bundle.sectionReviews || proposal?.completeness?.sectionReviews || [],
    softGaps: bundle.softGaps || proposal?.completeness?.softGaps || [],
    conflictAmbiguity: bundle.conflictAmbiguity || null,
    readyForGate1: proposal?.completeness?.readyForGate1 !== false,
    reviewComplete: Boolean(proposal?.review?.summary?.complete),
    reviewVersion: proposal?.reviewVersion ?? 0,
    reviewDecisions: decisions,
    expectedRevisionIds,
    activeSubmissionId: pack?.aiAnalysis?.gate1?.activeSubmissionId || null,
    activeReviewId: pack?.aiAnalysis?.gate1?.activeReviewId || null,
    isCustomerRawIntake: Boolean(
      pack?.aiAnalysis?.formValidation?.recognizedAsCustomerRaw ||
        pack?.aiAnalysis?.workbookDiagnostic?.intakeKind === 'customer_raw' ||
        pack?.aiAnalysis?.intakeKind === 'customer_raw'
    ),
    g4RequirementCount: Array.isArray(proposal?.generated?.functionalRequirements?.items)
      ? proposal.generated.functionalRequirements.items.length
      : bundle.items.filter((r) => r.section === 'functionalRequirements').length,
    citationCount: Number(phaseWhat?.citationCount) || 0,
    poReapprovalRequired: Boolean(pack?.aiAnalysis?.gate1?.poReapprovalRequired),
    gateA:
      pack?.aiAnalysis?.analyses?.requirementTools?.gateA &&
      typeof pack.aiAnalysis.analyses.requirementTools.gateA === 'object'
        ? {
            passed: Boolean(pack.aiAnalysis.analyses.requirementTools.gateA.passed),
            hasWarnings: Boolean(pack.aiAnalysis.analyses.requirementTools.gateA.hasWarnings),
            mode: pack.aiAnalysis.analyses.requirementTools.gateA.mode || 'advisory',
            checks: Array.isArray(pack.aiAnalysis.analyses.requirementTools.gateA.checks)
              ? pack.aiAnalysis.analyses.requirementTools.gateA.checks
              : [],
            thresholds: pack.aiAnalysis.analyses.requirementTools.gateA.thresholds || null,
          }
        : null,
  };
}

/** Drop stale Data Gate / Gate1 payload from local state when starting a new WHAT run. */
function clearStaleReviewLiveRun(prev) {
  if (!prev || typeof prev !== 'object') {
    return { status: 'queued', runId: null, gatePreview: null, gate: null };
  }
  return {
    ...prev,
    // New local epoch — do not keep prior runId (sticky progress / merge anti-regress).
    runId: null,
    status: 'queued',
    gate: null,
    gatePreview: null,
    pipelineSubstep: 'prepare',
    pipelineStep: 1,
    currentTool: null,
  };
}

/**
 * AI HITL workspace — Monitor LangGraph + Review DataGate/Gate1/Gate2.
 * Query: packId, startWhat=1 (auto-start once).
 */
export default function AiHitlWorkspacePage({ projectId, organizationId, onPromoted }) {
  const { t: translate } = useAppStrings();
  const t = useCallback((key, vars) => textOr(translate, key, vars) || translate(key, vars), [translate]);
  const [searchParams, setSearchParams] = useSearchParams();
  const { access: requirementAccess, loaded: accessLoaded } = useRequirementAccess(organizationId);
  const { project, capabilities: projectCaps } = useProjectCapabilities(projectId);
  const { shouldPausePolling } = useNetworkStatus();
  const { requestNote, noteDialog } = useReviewNotePrompt();
  const [ackDialog, setAckDialog] = useState(null);

  const packIdFromQuery = String(searchParams.get('packId') || '').trim();
  const wantStartWhat = ['1', 'true'].includes(String(searchParams.get('startWhat') || '').toLowerCase());
  const tabFromQuery = String(searchParams.get('tab') || '')
    .trim()
    .toLowerCase();

  const [tab, setTab] = useState(() =>
    tabFromQuery === 'review' || tabFromQuery === 'monitor' ? tabFromQuery : 'monitor'
  );
  const [busy, setBusy] = useState(false);
  const [gateActionLabel, setGateActionLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [packId, setPackId] = useState(packIdFromQuery);
  const [pack, setPack] = useState(null);
  const [liveRun, setLiveRun] = useState(null);
  /** 'what' | 'how' — hide stale Monitor results until poll shows a real new run. */
  const [awaitingFreshRun, setAwaitingFreshRun] = useState(null);
  const awaitingFreshRunRef = useRef(null);
  const packRef = useRef(null);
  const liveRunRef = useRef(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [autoStarting, setAutoStarting] = useState(false);
  const [gate1Decisions, setGate1Decisions] = useState({});
  const [gate2Decisions, setGate2Decisions] = useState({});
  const gate1SeededVersionRef = useRef(null);
  const gate2SeededVersionRef = useRef(null);
  const autoStartRef = useRef(false);
  const startedWhatKeyRef = useRef('');

  // Gate1/2 HITL: matrix caps SoT — không OR role-key / canApproveOrg (PM org ≠ Gate1 PO).
  const hitlFlags = useMemo(
    () =>
      resolveHitlRequirementFlags({
        canSubmitOrg: Boolean(requirementAccess?.canSubmit),
        canRunOrg: Boolean(requirementAccess?.canRunAiPlanning),
        canPromoteOrg: Boolean(requirementAccess?.canCreateFromPack),
        canReviewAnalysisPo: projectCaps.canReviewAnalysisPo,
        canBaAuthorAnalysis: projectCaps.canBaAuthorAnalysis,
        canReviewPlanningPm: projectCaps.canReviewPlanningPm,
        canReviewPlanningTech: projectCaps.canReviewPlanningTech,
        canReviewPlanningPo: projectCaps.canReviewPlanningPo,
      }),
    [requirementAccess, projectCaps]
  );
  const canRun = hitlFlags.canRun;
  const canSubmit = hitlFlags.canSubmit;
  const canApprove = hitlFlags.canApprove;
  const canPromote = hitlFlags.canPromote;
  const { user } = useAuth();
  const actorUserId = String(user?._id || user?.id || '').trim();
  const canReviewGate2Pm = hitlFlags.canReviewGate2Pm;
  const canReviewGate2Tech = hitlFlags.canReviewGate2Tech;
  const canReviewGate2Po = hitlFlags.canReviewGate2Po;
  const hasPlanningTechReviewer = Boolean(projectCaps.hasPlanningTechReviewer);

  const resolvePackId = useCallback(async () => {
    if (packIdFromQuery) return packIdFromQuery;
    if (!organizationId || !projectId) return '';
    const listRes = await requirementAPI.listPacks(organizationId, {});
    const listed = unwrap(listRes);
    const list = Array.isArray(listed) ? listed : listed?.items || listed?.packs || [];
    const linked = list.find((row) => {
      const raw = row?.projectId;
      const id = raw && typeof raw === 'object' ? raw._id || raw.id || '' : raw;
      return String(id || '') === String(projectId);
    });
    return String(linked?._id || linked?.id || '').trim();
  }, [organizationId, packIdFromQuery, projectId]);

  const markAwaitingFreshRun = useCallback((phase) => {
    const next = phase === 'how' ? 'how' : phase === 'what' ? 'what' : null;
    awaitingFreshRunRef.current = next;
    setAwaitingFreshRun(next);
  }, []);

  const clearAwaitingFreshRun = useCallback(() => {
    awaitingFreshRunRef.current = null;
    setAwaitingFreshRun(null);
  }, []);

  // Keep refs aligned for refresh() races (optimistic clear vs poll).
  useEffect(() => {
    packRef.current = pack;
  }, [pack]);
  useEffect(() => {
    liveRunRef.current = liveRun;
  }, [liveRun]);

  const refresh = useCallback(async () => {
    const id = packId || (await resolvePackId());
    if (!organizationId || !id) {
      setLoading(false);
      return null;
    }
    if (id !== packId) setPackId(id);
    const packRes = await requirementAPI.getPack(organizationId, id, { view: 'full' });
    const next = unwrap(packRes);
    const awaiting = awaitingFreshRunRef.current;
    const guarded = protectPackDuringFreshRunAwait(packRef.current, next, awaiting);
    const acceptedPack = guarded.pack;
    packRef.current = acceptedPack;
    setPack(acceptedPack);
    if (guarded.release && awaiting) {
      awaitingFreshRunRef.current = null;
      setAwaitingFreshRun(null);
    }

    const prevLive = liveRunRef.current;
    const incoming = acceptedPack?.liveRun || null;
    let nextLive = incoming;
    // Re-run local epoch: keep optimistic queued clear until server shows in-flight liveRun.
    if (
      awaiting &&
      !guarded.release &&
      prevLive &&
      (!incoming || !isPhaseInFlightStatus(incoming.status))
    ) {
      nextLive = prevLive;
    } else if (prevLive && incoming) {
      if (String(prevLive.runId || '') !== String(incoming.runId || '')) {
        nextLive = incoming;
      } else if (
        !prevLive.runId &&
        isPhaseInFlightStatus(prevLive.status) &&
        !isPhaseInFlightStatus(incoming.status)
      ) {
        // Local clear nulls runId — do not restore a still-completed server liveRun.
        nextLive = prevLive;
      } else {
        const prevStep = Number(prevLive.pipelineStep) || 0;
        const nextStep = Number(incoming.pipelineStep) || 0;
        // Same run: never regress business progress (post–Data Gate claim gaps).
        if (prevLive.pipelineSubstep && (!incoming.pipelineSubstep || nextStep < prevStep)) {
          nextLive = {
            ...incoming,
            pipelineStep: prevLive.pipelineStep,
            pipelineSubstep: prevLive.pipelineSubstep,
          };
        }
      }
    }
    liveRunRef.current = nextLive;
    setLiveRun(nextLive);
    setLoading(false);
    return acceptedPack;
  }, [organizationId, packId, resolvePackId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(
            resolveApiErrorMessage(err, {
              fallback: t('requirements.aiHitlLoadError'),
            })
          );
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, t]);

  const phaseWhat = pack?.aiAnalysis?.phaseRuns?.phase_what;
  const phaseHow = pack?.aiAnalysis?.phaseRuns?.phase_how;
  const packStatusEarly = String(pack?.status || '');
  const liveStatus = String(liveRun?.status || '');
  const howStatusNorm = String(phaseHow?.status || '')
    .trim()
    .toLowerCase();
  const whatInFlight =
    ['pending', 'running', 'waiting_human'].includes(liveStatus) ||
    String(phaseWhat?.status || '') === 'pending';
  const howInFlight = ['pending', 'running', 'queued', 'waiting_human'].includes(
    howStatusNorm
  );
  // HITL pause: do not poll while waiting_human — refresh() replaces gatePreview every 2s
  // and Phase1DataGateReviewPanel resets the table (visible flicker).
  const shouldPollWhat =
    !shouldPausePolling &&
    liveStatus !== 'waiting_human' &&
    (['pending', 'running', 'queued', 'replanning'].includes(liveStatus) ||
      String(phaseWhat?.status || '') === 'pending' ||
      howInFlight);

  useEffect(() => {
    if (!shouldPollWhat) return undefined;
    const timer = setInterval(() => {
      refresh().catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [shouldPollWhat, refresh]);

  const stripStartWhatParam = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    if (!next.has('startWhat')) return;
    next.delete('startWhat');
    if (!next.get('packId') && packId) next.set('packId', packId);
    setSearchParams(next, { replace: true });
  }, [packId, searchParams, setSearchParams]);

  /** Keep state + ?tab= in sync so deep-link effect cannot yank tab after start/revise. */
  const goMonitorTab = useCallback(() => {
    setTab('monitor');
    const next = new URLSearchParams(searchParams);
    if (next.get('tab') === 'monitor') return;
    next.set('tab', 'monitor');
    if (!next.get('packId') && packId) next.set('packId', packId);
    setSearchParams(next, { replace: true });
  }, [packId, searchParams, setSearchParams]);

  /** HOW start → Monitor handoff (same pattern as WHAT start). */
  const onHowStarted = useCallback(
    ({ clearResults = false, packStatus = '' } = {}) => {
      goMonitorTab();
      markAwaitingFreshRun('how');
      // Optimistic pending so auto-open Review cannot yank back before start API returns.
      setPack((prev) => {
        if (!prev) return prev;
        const ai = { ...(prev.aiAnalysis || {}) };
        if (clearResults) {
          // Drop HOW tables so Monitor does not keep prior WBS/schedule during re-run.
          ai.planning = undefined;
          const analyses = { ...(ai.analyses || {}) };
          delete analyses.dependency;
          delete analyses.assignment;
          delete analyses.schedule;
          delete analyses.risk;
          delete analyses.risks;
          ai.analyses = analyses;
        }
        ai.phaseRuns = {
          ...(ai.phaseRuns || {}),
          phase_how: {
            ...(ai.phaseRuns?.phase_how || {}),
            status: 'pending',
            error: null,
            pipelineStep: null,
            pipelineSubstep: null,
            remoteRunId: null,
          },
        };
        const nextStatus = String(packStatus || '').trim();
        const next = {
          ...prev,
          ...(nextStatus ? { status: nextStatus } : {}),
          aiAnalysis: ai,
        };
        packRef.current = next;
        return next;
      });
    },
    [goMonitorTab, markAwaitingFreshRun]
  );

  const howHasResult = ['ready', 'completed', 'confirmed', 'failed', 'error'].includes(
    howStatusNorm
  );
  const packHowEligible =
    packStatusEarly === 'approved' || packStatusEarly === 'project_linked';
  /** Every PO sees re-run HOW when Gate1 done and HOW not currently running. */
  const canRerunHow =
    canReviewGate2Po && packHowEligible && !howInFlight && howHasResult;

  const whatStatusNorm = String(phaseWhat?.status || '').trim().toLowerCase();
  const whatHasPriorRun =
    ['under_review', 'rejected'].includes(packStatusEarly) ||
    ['ready', 'completed', 'confirmed', 'failed', 'error'].includes(whatStatusNorm) ||
    Boolean(phaseWhat?.remoteRunId || phaseWhat?.runId);
  /** First WHAT start — BA/run capability (Monitor idle). */
  const canStartWhat =
    canRun &&
    !whatInFlight &&
    !['approved', 'project_linked'].includes(packStatusEarly) &&
    !whatHasPriorRun;
  /** Revise / re-run WHAT — PO only (same SoD as HOW re-run). */
  const canRerunWhat =
    canApprove &&
    !whatInFlight &&
    !['approved', 'project_linked'].includes(packStatusEarly) &&
    whatHasPriorRun;

  /** Start / re-run HOW from Monitor card (PO re-run). Review tab stays decide-only. */
  const startHowManual = useCallback(
    async ({ force = false } = {}) => {
      if (!organizationId || !packId || busy) return;
      const useForce = force === true;
      setBusy(true);
      onHowStarted({ clearResults: useForce });
      if (useForce) setGate2Decisions({});
      try {
        await requirementAPI.startPhaseAiPlanning(organizationId, packId, {
          phase: 'how',
          ...(useForce ? { force: true } : {}),
          ...(projectId ? { projectId: String(projectId) } : {}),
        });
        toast.success(
          useForce
            ? t('requirements.aiHowRerunStarted')
            : t('requirements.aiHowRunStarted')
        );
        await refresh();
      } catch (err) {
        clearAwaitingFreshRun();
        toast.error(
          resolveApiErrorMessage(err, {
            fallback: t('requirements.aiHowRunFail'),
          })
        );
        await refresh().catch(() => {});
      } finally {
        setBusy(false);
      }
    },
    [organizationId, packId, projectId, busy, onHowStarted, refresh, clearAwaitingFreshRun, t]
  );

  const startHowFirst = useCallback(() => startHowManual({ force: false }), [startHowManual]);
  const rerunHow = useCallback(() => startHowManual({ force: true }), [startHowManual]);

  /**
   * Birth / manual start: prepare_only → G4 (same sequence as Overview pipeline).
   */
  const runWhatPipeline = useCallback(
    async ({ force = false, feedback = '', parentRunId = '', idempotencyKey = '' } = {}) => {
      // Stage 1 — intake readiness (no LLM)
      await requirementAPI.startPhaseAiPlanning(organizationId, packId, {
        phase: 'what',
        mode: 'prepare_only',
      });
      // Stage 2 — remote APS WHAT
      await requirementAPI.startPhaseAiPlanning(
        organizationId,
        packId,
        {
          phase: 'what',
          mode: 'g4',
          ...(force ? { force: true } : {}),
          ...(feedback ? { feedback } : {}),
          ...(parentRunId ? { parentRunId } : {}),
        },
        idempotencyKey ? { idempotencyKey } : {}
      );
    },
    [organizationId, packId]
  );

  // Auto-start WHAT once after AI draft birth (?startWhat=1)
  useEffect(() => {
    if (!wantStartWhat || loading || !accessLoaded || !packId || !organizationId) return;
    if (autoStartRef.current) return;

    if (!canRun) {
      // Access loaded but no permission — drop flag so UI is not stuck "starting"
      autoStartRef.current = true;
      stripStartWhatParam();
      return;
    }

    const whatStatus = String(phaseWhat?.status || '');
    const liveStatus = String(liveRun?.status || '');
    if (
      whatStatus === 'pending' ||
      whatStatus === 'ready' ||
      liveStatus === 'waiting_human' ||
      liveStatus === 'running' ||
      liveStatus === 'queued'
    ) {
      autoStartRef.current = true;
      stripStartWhatParam();
      return;
    }

    const key = `${packId}:what`;
    if (startedWhatKeyRef.current === key) return;
    autoStartRef.current = true;
    startedWhatKeyRef.current = key;

    (async () => {
      setBusy(true);
      setAutoStarting(true);
      markAwaitingFreshRun('what');
      setLiveRun((prev) => {
        const next = clearStaleReviewLiveRun(prev);
        liveRunRef.current = next;
        return next;
      });
      goMonitorTab();
      toast.success(
        t('requirements.aiWhatRunStarted')
      );
      try {
        await runWhatPipeline({ force: true });
        await refresh();
      } catch (err) {
        autoStartRef.current = false;
        startedWhatKeyRef.current = '';
        clearAwaitingFreshRun();
        toast.error(
          resolveApiErrorMessage(err, {
            fallback: t('requirements.aiWhatRunFail'),
          })
        );
        await refresh().catch(() => {});
      } finally {
        setBusy(false);
        setAutoStarting(false);
        stripStartWhatParam();
      }
    })();
  }, [
    wantStartWhat,
    loading,
    accessLoaded,
    canRun,
    packId,
    organizationId,
    phaseWhat?.status,
    liveRun?.status,
    refresh,
    runWhatPipeline,
    stripStartWhatParam,
    goMonitorTab,
    markAwaitingFreshRun,
    clearAwaitingFreshRun,
    t,
  ]);

  const reviewMode = useMemo(() => resolveAiHitlReviewMode(pack, liveRun), [pack, liveRun]);
  const gate1ReviewLane = useMemo(() => resolveGate1ReviewLane(pack), [pack]);
  const gate1ReviewView = useMemo(
    () =>
      resolveGate1ReviewView({
        lane: gate1ReviewLane,
        canSubmit,
        canApprove,
      }),
    [gate1ReviewLane, canSubmit, canApprove]
  );

  const gate2ReviewLane = useMemo(() => resolveGate2ReviewLane(pack), [pack]);
  const gate2HowStatus = String(phaseHow?.status || '');
  const gate2Tracks = pack?.aiAnalysis?.gate2?.tracks || null;
  const gate2Proposals = Array.isArray(pack?.aiAnalysis?.gate2?.changeProposals)
    ? pack.aiAnalysis.gate2.changeProposals
    : [];
  const stampedReviewPlan = pack?.aiAnalysis?.gate2?.reviewPlan;
  const projectHowPlan = project?.gateReviewPolicy?.how;
  const legacyRoleTracks = Boolean(gate2Tracks?.po || gate2Tracks?.tech || gate2Tracks?.pm);
  const gate2ReviewPlan = stampedReviewPlan?.finalRoleKey
    ? stampedReviewPlan
    : !legacyRoleTracks && projectHowPlan?.finalRoleKey
      ? projectHowPlan
      : null;
  const gate2ViewerRoleKeys = projectCaps.viewerProjectRoleKeys || [];
  const gate2ReviewView = useMemo(
    () =>
      resolveGate2ReviewView({
        lane: gate2ReviewLane,
        howStatus: gate2HowStatus,
        canReviewPm: canReviewGate2Pm,
        canReviewTech: canReviewGate2Tech,
        canReviewPo: canReviewGate2Po,
        tracks: gate2Tracks,
        proposals: gate2Proposals,
        techRequired: hasPlanningTechReviewer,
        userId: actorUserId,
        reviewPlan: gate2ReviewPlan,
        viewerRoleKeys: gate2ViewerRoleKeys,
      }),
    [
      gate2ReviewLane,
      gate2HowStatus,
      canReviewGate2Pm,
      canReviewGate2Tech,
      canReviewGate2Po,
      gate2Tracks,
      gate2Proposals,
      hasPlanningTechReviewer,
      actorUserId,
      gate2ReviewPlan,
      gate2ViewerRoleKeys,
    ]
  );
  const gate2ParallelTracks = useMemo(
    () =>
      openParallelTracks({
        canReviewPm: canReviewGate2Pm,
        canReviewTech: canReviewGate2Tech,
        canReviewPo: canReviewGate2Po,
        tracks: gate2Tracks,
        techRequired: hasPlanningTechReviewer,
        reviewPlan: gate2ReviewPlan,
        viewerRoleKeys: gate2ViewerRoleKeys,
      }),
    [
      canReviewGate2Pm,
      canReviewGate2Tech,
      canReviewGate2Po,
      gate2Tracks,
      hasPlanningTechReviewer,
      gate2ReviewPlan,
      gate2ViewerRoleKeys,
    ]
  );
  const gate2RejectReason = String(pack?.aiAnalysis?.gate2?.lastRejectReason || '').trim();

  // Deep-link ?tab=review|monitor from notify / URL
  useEffect(() => {
    const q = String(searchParams.get('tab') || '')
      .trim()
      .toLowerCase();
    if (q === 'review' || q === 'monitor') setTab(q);
  }, [searchParams]);

  // Only auto-open Review when Gate ready — never yank off Monitor while WHAT/HOW is starting/running.
  useEffect(() => {
    if (busy || whatInFlight || howInFlight) return;
    if (reviewMode !== 'gate1' && reviewMode !== 'gate2') return;
    setTab('review');
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (next.get('tab') === 'review') return prev;
        next.set('tab', 'review');
        if (!next.get('packId') && packId) next.set('packId', packId);
        return next;
      },
      { replace: true }
    );
  }, [reviewMode, busy, whatInFlight, howInFlight, packId, setSearchParams]);

  // RULE-R07: legacy Data Gate pause — cancel + free activeKey, then user starts WHAT again
  useEffect(() => {
    const stale =
      String(liveRun?.status || '') === 'waiting_human' &&
      String(liveRun?.gate || '') === 'data_review';
    if (!stale || !organizationId || !packId || busy) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await requirementAPI.resumePhaseWhatDataGate(organizationId, packId, {
          decision: 'reject',
          runId: liveRun?.runId || phaseWhat?.remoteRunId,
        });
        if (!cancelled) {
          toast(
            t('requirements.phase1DataGateRemovedHint')
          );
          await refresh();
        }
      } catch {
        /* ignore — user can still force start WHAT */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    liveRun?.status,
    liveRun?.gate,
    liveRun?.runId,
    phaseWhat?.remoteRunId,
    organizationId,
    packId,
    busy,
    refresh,
    t,
  ]);

  const gate1Summary = useMemo(() => (pack ? buildGate1Summary(pack) : null), [pack]);

  // Persist Gate1 row decisions at page level — survive tab switch / reviewMode flicker / remount.
  // Reseed when BA submits (reviewVersion / submission / lane changes) so PO sees BA decisions.
  useEffect(() => {
    setGate1Decisions({});
    gate1SeededVersionRef.current = null;
  }, [packId]);

  useEffect(() => {
    if (!gate1Summary) return;
    const seedKey = [
      gate1Summary.reviewVersion ?? 0,
      gate1Summary.activeSubmissionId || '',
      gate1ReviewLane || '',
    ].join(':');
    if (gate1SeededVersionRef.current === seedKey) return;
    gate1SeededVersionRef.current = seedKey;
    const fromServer =
      gate1Summary.reviewDecisions && typeof gate1Summary.reviewDecisions === 'object'
        ? gate1Summary.reviewDecisions
        : {};
    setGate1Decisions({ ...fromServer });
  }, [gate1Summary, gate1ReviewLane]);

  const setGate1Decision = useCallback((logicalId, patch) => {
    const id = String(logicalId || '').trim();
    if (!id) return;
    setGate1Decisions((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...patch },
    }));
  }, []);

  const clearGate1Decision = useCallback((logicalId) => {
    const id = String(logicalId || '').trim();
    if (!id) return;
    setGate1Decisions((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, id)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  useEffect(() => {
    setGate2Decisions({});
    gate2SeededVersionRef.current = null;
  }, [packId]);

  useEffect(() => {
    const g2 = pack?.aiAnalysis?.gate2;
    if (!g2) return;
    const seedKey = [
      g2.reviewVersion ?? 0,
      g2.submittedAt || '',
      gate2ReviewLane || '',
    ].join(':');
    if (gate2SeededVersionRef.current === seedKey) return;
    gate2SeededVersionRef.current = seedKey;
    const fromServer =
      g2.reviewDecisions && typeof g2.reviewDecisions === 'object' ? g2.reviewDecisions : {};
    setGate2Decisions({ ...fromServer });
  }, [pack?.aiAnalysis?.gate2, gate2ReviewLane]);

  const setGate2Decision = useCallback((logicalId, patch) => {
    const id = String(logicalId || '').trim();
    if (!id) return;
    setGate2Decisions((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...patch },
    }));
  }, []);

  const clearGate1DecisionsForReseed = useCallback(() => {
    gate1SeededVersionRef.current = null;
    setGate1Decisions({});
  }, []);

  const loadGatePage = useCallback(
    async ({ offset, limit }) => {
      if (!organizationId || !packId) return null;
      const packRes = await requirementAPI.getPack(organizationId, packId, {
        view: 'full',
        gateRowOffset: offset,
        gateRowLimit: limit,
      });
      return unwrap(packRes)?.liveRun?.gatePreview || null;
    },
    [organizationId, packId]
  );

  const onDataGatePass = async () => {
    if (!organizationId || !packId || busy) return;
    setBusy(true);
    try {
      await requirementAPI.resumePhaseWhatDataGate(organizationId, packId, {
        decision: 'pass',
        runId: liveRun?.runId || phaseWhat?.remoteRunId,
      });
      toast.success(t('requirements.phase1DataGatePassToast'));
      // Optimistic: next step is Semantic Fetch — avoid Monitor flash at step 1 / prepare
      // while the first post-resume poll catches up.
      setLiveRun((prev) =>
        prev
          ? {
              ...prev,
              status: 'running',
              gate: null,
              gatePreview: null,
              pipelineStep: 3,
              pipelineSubstep: 'semantic',
              currentNode: 'execute',
              currentTool: 'RequirementAnalysisTool',
            }
          : prev
      );
      goMonitorTab();
      await refresh();
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { fallback: 'Data Gate pass failed' }));
    } finally {
      setBusy(false);
    }
  };

  const onDataGateReject = async () => {
    if (!organizationId || !packId || busy) return;
    setBusy(true);
    try {
      await requirementAPI.resumePhaseWhatDataGate(organizationId, packId, {
        decision: 'reject',
        runId: liveRun?.runId || phaseWhat?.remoteRunId,
      });
      toast.success(t('requirements.phase1DataGateRejectToast'));
      await refresh();
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { fallback: 'Data Gate reject failed' }));
    } finally {
      setBusy(false);
    }
  };

  const onGate1Submit = async ({
    reviewDecisions,
    reviewVersion,
    expectedRevisionIds,
    withdrawSubmissionId,
  }) => {
    if (!organizationId || !packId || busy) return;
    const note = await requestNote({
      title: t('requirements.phase1Gate1ConfirmTitle'),
      description:
        t('requirements.phase1Gate1ConfirmBaDesc'),
      placeholder: t('requirements.phase1Gate1ConfirmNotePlaceholder'),
      submitLabel: t('requirements.phase1Gate1ConfirmCta'),
      variant: 'generic',
      noteOptional: true,
      maxLength: 1000,
    });
    if (note === null) return;
    setBusy(true);
    setGateActionLabel(t('requirements.gate1SubmitOverlay') || 'Đang gửi duyệt Gate 1…');
    try {
      const submitRes = await requirementAPI.submitPack(organizationId, packId, {
        reviewDecisions,
        expectedReviewVersion: reviewVersion,
        expectedRevisionIds: expectedRevisionIds || undefined,
        withdrawSubmissionId: withdrawSubmissionId || undefined,
        note: note || undefined,
      });
      const submittedPack = unwrap(submitRes);
      const submissionId = submittedPack?.aiAnalysis?.gate1?.activeSubmissionId;
      if (!submissionId) {
        toast.error(
          t('requirements.phase1Gate1SubmitMissingSubmission')
        );
        await refresh();
        return;
      }
      setAckDialog({
        title: t('requirements.phase1Gate1SubmitSuccessTitle'),
        message:
          t('requirements.understandingGate1Submitted'),
      });
      // Allow one reseed from server after submit (new reviewVersion / persisted decisions)
      clearGate1DecisionsForReseed();
      await refresh();
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { fallback: 'Submit Gate 1 failed' }));
    } finally {
      setBusy(false);
      setGateActionLabel('');
    }
  };

  const onGate1Approve = async () => {
    if (!organizationId || !packId || busy) return;
    const note = await requestNote({
      title: t('requirements.phase1Gate1PoConfirmTitle'),
      description:
        t('requirements.phase1Gate1ConfirmPoDesc'),
      placeholder: t('requirements.phase1Gate1ConfirmNotePlaceholder'),
      submitLabel: t('requirements.phase1Gate1PoConfirmCta'),
      variant: 'generic',
      noteOptional: true,
      maxLength: 1000,
    });
    if (note === null) return;
    const approveLabel = t('requirements.gate1ApproveOverlay') || 'Đang duyệt Gate 1…';
    setBusy(true);
    setGateActionLabel(approveLabel);
    try {
      const result = await approveRequirementPackWithGate1({
        orgId: organizationId,
        packId,
        t,
        body: {
          ...(String(note || '').trim()
            ? { note: String(note).trim().slice(0, 1000) }
            : {}),
          ...(projectId ? { projectId: String(projectId) } : {}),
        },
        requestForceReason: async ({ title, message }) =>
          requestNote({
            title,
            description: message,
            placeholder:
              t('requirements.gate1ForceReasonPlaceholder'),
            submitLabel: t('requirements.approveForced') || t('requirements.approve'),
            variant: 'request_changes',
            maxLength: 2000,
          }),
      });
      if (!result.ok) return;
      // Approve returned — overlay must not keep saying Gate 1 while HOW starts.
      setGateActionLabel(
        t('requirements.aiHowRunStarting') || 'Đang khởi chạy Phase HOW…'
      );
      onHowStarted({ packStatus: 'approved' });
      try {
        await requirementAPI.startPhaseAiPlanning(organizationId, packId, {
          phase: 'how',
          ...(projectId ? { projectId: String(projectId) } : {}),
        });
        toast.success(
          t('requirements.aiHowRunStarted')
        );
      } catch (howErr) {
        clearAwaitingFreshRun();
        toast.error(
          resolveApiErrorMessage(howErr, {
            fallback:
              t('requirements.aiHowRunFail'),
          })
        );
      }
      await refresh();
      setAckDialog({
        title: t('requirements.phase1Gate1ApproveSuccessTitle'),
        message: t('requirements.phase1ApproveOk'),
      });
    } catch (err) {
      toast.error(
        formatGate1ApproveError(err, { t, fallback: 'Approve Gate 1 failed' }) ||
          resolveApiErrorMessage(err)
      );
    } finally {
      setBusy(false);
      setGateActionLabel('');
    }
  };

  const onGate1Reject = async () => {
    if (!organizationId || !packId || busy) return;
    const reasonRaw = await requestNote({
      title: t('requirements.phase1Gate1PoRejectTitle'),
      description:
        t('requirements.phase1Gate1PoRejectDesc'),
      placeholder: t('requirements.rejectReasonPlaceholder'),
      submitLabel: t('requirements.phase1Gate1PoRejectCta'),
      variant: 'reject',
      maxLength: 2000,
    });
    if (reasonRaw === null) return;
    const reason = String(reasonRaw).trim().slice(0, 2000);
    if (!reason) {
      toast.error(t('requirements.rejectReasonRequired'));
      return;
    }
    setBusy(true);
    try {
      await requirementAPI.rejectPack(organizationId, packId, reason, {
        projectId,
      });
      toast.success(
        t('requirements.phase1Gate1PoRejectOk')
      );
      clearGate1DecisionsForReseed();
      await refresh();
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, {
          fallback: t('requirements.rejectFail'),
        })
      );
    } finally {
      setBusy(false);
    }
  };

  const postGate2 = async (body, { ok, fail, overlay }) => {
    if (!organizationId || !packId || busy) return;
    setBusy(true);
    if (overlay) setGateActionLabel(overlay);
    try {
      await requirementAPI.confirmPhaseGate2(organizationId, packId, body);
      toast.success(ok);
      await refresh();
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { fallback: fail }));
    } finally {
      setBusy(false);
      setGateActionLabel('');
    }
  };

  const onGate2TrackSubmit = async (meta = {}) => {
    if (!organizationId || !packId || busy) return;
    const note = await requestNote({
      title: t('requirements.gate2TrackSubmitTitle'),
      description:
        t('requirements.gate2TrackSubmitDesc'),
      placeholder: t('requirements.gate2SubmitNotePlaceholder'),
      submitLabel: t('requirements.gate2TrackSubmit'),
      variant: 'generic',
      noteOptional: true,
      maxLength: 1000,
    });
    if (note === null) return;
    const decisions =
      meta.reviewDecisions && typeof meta.reviewDecisions === 'object'
        ? meta.reviewDecisions
        : gate2Decisions;
    await postGate2(
      {
        action: 'track_submit',
        track: meta.track,
        reviewDecisions: decisions,
        ...(String(note || '').trim() ? { note: String(note).trim().slice(0, 1000) } : {}),
      },
      {
        ok: t('requirements.gate2TrackSubmitOk'),
        fail: t('requirements.gate2PmSubmitFail'),
      }
    );
  };

  const onGate2ProposeChange = async (draft = {}) => {
    await postGate2(
      { action: 'propose_change', proposal: draft, note: draft.reason || '' },
      {
        ok: t('requirements.gate2ProposalSent'),
        fail: t('requirements.gate2ProposalFail'),
      }
    );
  };

  const onGate2DecideChange = async ({ proposalId, decision } = {}) => {
    let note = '';
    if (decision === 'reject') {
      const reason = await requestNote({
        title: t('requirements.gate2ProposalReject'),
        description:
          t('requirements.gate2ProposalRejectDesc'),
        placeholder: t('requirements.gate2RejectReasonPlaceholder'),
        submitLabel: t('requirements.gate2ProposalReject'),
        variant: 'warning',
        noteOptional: false,
        maxLength: 1000,
      });
      if (reason === null) return;
      note = String(reason || '').trim();
    }
    await postGate2(
      { action: 'decide_change', proposalId, decision, ...(note ? { note } : {}) },
      {
        ok:
          decision === 'accept'
            ? t('requirements.gate2ProposalAccepted')
            : t('requirements.gate2ProposalRejected'),
        fail: t('requirements.gate2ProposalFail'),
      }
    );
  };

  const onGate2KeepOriginal = async ({ proposalId } = {}) => {
    await postGate2(
      { action: 'keep_original', proposalId },
      {
        ok: t('requirements.gate2ProposalReverted'),
        fail: t('requirements.gate2ProposalFail'),
      }
    );
  };

  const onGate2Escalate = async ({ proposalId } = {}) => {
    const note = await requestNote({
      title: t('requirements.gate2Escalate'),
      description:
        t('requirements.gate2EscalateDesc'),
      placeholder: t('requirements.gate2EscalatePlaceholder'),
      submitLabel: t('requirements.gate2Escalate'),
      variant: 'warning',
      noteOptional: false,
      maxLength: 1000,
    });
    if (note === null) return;
    await postGate2(
      { action: 'escalate', proposalId, note: String(note).trim() },
      {
        ok: t('requirements.gate2ProposalEscalated'),
        fail: t('requirements.gate2ProposalFail'),
      }
    );
  };

  const onGate2ResolveEscalation = async ({ proposalId, decision } = {}) => {
    const note = await requestNote({
      title: t('requirements.gate2AcceptRisk'),
      description:
        decision === 'accept_risk'
          ? t('requirements.gate2AcceptRiskDesc')
          : t('requirements.gate2RejectTradeoffDesc'),
      placeholder: t('requirements.gate2EscalatePlaceholder'),
      submitLabel: t('common.confirm'),
      variant: decision === 'accept_risk' ? 'warning' : 'generic',
      noteOptional: false,
      maxLength: 1000,
    });
    if (note === null) return;
    await postGate2(
      { action: 'resolve_escalation', proposalId, decision, note: String(note).trim() },
      {
        ok: t('requirements.gate2EscalationResolved'),
        fail: t('requirements.gate2ProposalFail'),
      }
    );
  };

  const onGate2PmConfirmPlan = async () => {
    const note = await requestNote({
      title: t('requirements.gate2PmConfirmPlan'),
      description:
        t('requirements.gate2PmConfirmPlanDesc'),
      placeholder: t('requirements.gate2SubmitNotePlaceholder'),
      submitLabel: t('requirements.gate2PmConfirmPlan'),
      variant: 'generic',
      noteOptional: true,
      maxLength: 1000,
    });
    if (note === null) return;
    await postGate2(
      {
        action: 'pm_confirm_plan',
        ...(String(note || '').trim() ? { note: String(note).trim().slice(0, 1000) } : {}),
      },
      {
        ok: t('requirements.gate2PmConfirmPlanOk'),
        fail: t('requirements.gate2PmSubmitFail'),
      }
    );
  };

  const onGate2PoApprove = async (meta = {}) => {
    if (!organizationId || !packId || busy) return;
    const activateOnly = Boolean(meta.activateOnly);
    // Hole #3: soft UI warnings must NOT auto forceApprove — only explicit / activateOnly / G13 retry+note
    const forceApprove = Boolean(meta.forceApprove) || Boolean(activateOnly);
    const warnParts = [];
    if (Number(meta.missingCount) > 0) {
      const labels = Array.isArray(meta.missingSectionLabels)
        ? meta.missingSectionLabels.filter(Boolean).join(', ')
        : '';
      warnParts.push(
        labels
          ? t('requirements.gate2WarnMissingNamed', { labels }) ||
            `Section thiếu dữ liệu: ${labels}.`
          : t('requirements.gate2WarnMissingSections', { count: meta.missingCount }) ||
            `${meta.missingCount} section thiếu dữ liệu.`
      );
    }
    if (Number(meta.conflictSectionCount) > 0) {
      warnParts.push(
        t('requirements.gate2WarnConflictSections', { count: meta.conflictSectionCount }) ||
          `${meta.conflictSectionCount} section có cảnh báo.`
      );
    }
    if (meta.hasSoftWarnings && !forceApprove) {
      warnParts.push(
        t('requirements.gate2WarnSoftNoForce')
      );
    }
    if (forceApprove || activateOnly) {
      warnParts.push(
        t('requirements.gate2WarnForcePromote')
      );
    }
    if (meta.canPromote === false && !canReviewGate2Po) {
      warnParts.push(
        t('requirements.gate2WarnNoPromotePerm')
      );
    }
    const baseDesc = activateOnly
      ? t('requirements.gate2ActivateDesc')
      : t('requirements.gate2PoApproveDesc');
    const description = warnParts.length
      ? `${t('requirements.gate2WarnLead')}\n• ${warnParts.join('\n• ')}\n\n${baseDesc}`
      : baseDesc;
    const note = await requestNote({
      title: activateOnly
        ? t('requirements.promoteProjectRetry')
        : t('requirements.gate2PoApproveTitle'),
      description,
      placeholder: t('requirements.gate2ConfirmNotePlaceholder'),
      submitLabel: activateOnly
        ? t('requirements.promoteProjectRetry')
        : warnParts.length
          ? t('requirements.gate2PoApproveAnyway')
          : t('requirements.gate2PoApprove'),
      variant: warnParts.length ? 'warning' : 'generic',
      noteOptional: true,
      maxLength: 1000,
    });
    if (note === null) return;
    setBusy(true);
    setGateActionLabel(
      activateOnly
        ? t('requirements.gate2ActivateOverlay') || 'Đang kích hoạt delivery…'
        : t('requirements.gate2PoApproveOverlay') || 'Đang duyệt Gate 2 và kích hoạt dự án…'
    );
    try {
      const howSt = String(pack?.aiAnalysis?.phaseRuns?.phase_how?.status || '');
      let promotePayload = null;
      let confirmData = null;
      const noteTrimmed = String(note || '').trim();
      const overrideReason =
        noteTrimmed ||
        (forceApprove || activateOnly
          ? 'PO kích hoạt delivery sau Gate 2 (G13 override nếu cần).'
          : '');
      if (!activateOnly && howSt !== 'confirmed') {
        const confirmBody = {
          action: 'po_approve',
          ...(noteTrimmed ? { note: noteTrimmed.slice(0, 1000) } : {}),
          ...(forceApprove || activateOnly
            ? { forceApprove: true, overrideReason: overrideReason.slice(0, 2000) }
            : {}),
        };
        try {
          const confirmRes = await requirementAPI.confirmPhaseGate2(
            organizationId,
            packId,
            confirmBody
          );
          confirmData = unwrap(confirmRes) || {};
        } catch (confirmErr) {
          // Hole #2/#3: confirm blocked by G13 — retry once with force when user left a note
          const code = String(
            confirmErr?.response?.data?.errorCode || confirmErr?.errorCode || ''
          );
          const g13Block = [
            'G13_FEASIBILITY_FAILED',
            'G13_FEASIBILITY_MISSING',
            'G13_OVERRIDE_REASON_REQUIRED',
          ].includes(code);
          if (g13Block && noteTrimmed && !confirmBody.forceApprove) {
            const retryRes = await requirementAPI.confirmPhaseGate2(organizationId, packId, {
              ...confirmBody,
              forceApprove: true,
              overrideReason: noteTrimmed.slice(0, 2000),
            });
            confirmData = unwrap(retryRes) || {};
          } else {
            throw confirmErr;
          }
        }
        if (confirmData.promoted && confirmData.promote) {
          promotePayload = confirmData;
        } else if (confirmData.promoteError) {
          console.warn('[gate2] auto-promote failed, retry create-project', confirmData.promoteError);
        }
      }
      if (!promotePayload?.promoted) {
        const g13Codes = new Set([
          'G13_FEASIBILITY_FAILED',
          'G13_FEASIBILITY_MISSING',
          'FEAS_QUALITY_PLAN',
          'FEAS_DEPLOY_PLAN',
        ]);
        const promoteErrCode = String(confirmData?.promoteError?.errorCode || '');
        // Hole #3: G13 retry with force only when user left a note (explicit override intent)
        const g13RetryWithNote = g13Codes.has(promoteErrCode) && Boolean(noteTrimmed);
        const res = await requirementAPI.createProjectFromPack(organizationId, packId, {
          importWorkItems: true,
          applyAssignees: true,
          ...(forceApprove || activateOnly || g13RetryWithNote
            ? {
                forceApprove: true,
                overrideReason: (noteTrimmed || overrideReason).slice(0, 2000),
              }
            : {}),
        });
        promotePayload = unwrap(res);
      }
      toast.success(
        t('requirements.gate2ConfirmAndPromoteSuccess')
      );
      onPromoted?.(promotePayload);
      await refresh().catch(() => {});
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, {
          fallback:
            t('requirements.gate2ConfirmAndPromoteFail'),
        })
      );
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
      setGateActionLabel('');
    }
  };

  const onGate2PoReject = async () => {
    if (!organizationId || !packId || busy) return;
    const reasonRaw = await requestNote({
      title: t('requirements.gate2PoRejectTitle'),
      description:
        t('requirements.gate2PoRejectDesc'),
      placeholder: t('requirements.rejectReasonPlaceholder'),
      submitLabel: t('requirements.gate2PoReject'),
      variant: 'reject',
      maxLength: 2000,
    });
    if (reasonRaw === null) return;
    const reason = String(reasonRaw).trim().slice(0, 2000);
    if (!reason) {
      toast.error(t('requirements.rejectReasonRequired'));
      return;
    }
    setBusy(true);
    try {
      await requirementAPI.confirmPhaseGate2(organizationId, packId, {
        action: 'po_reject',
        note: reason,
      });
      toast.success(
        t('requirements.gate2PoRejectOk')
      );
      await refresh();
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, {
          fallback: t('requirements.gate2PoRejectFail'),
        })
      );
    } finally {
      setBusy(false);
    }
  };

  const beginWhatRun = async ({
    force = false,
    feedback = '',
    parentRunId = '',
    idempotencyKey = '',
    successKey,
    successFallback,
  }) => {
    if (!canRun || !organizationId || !packId || busy) return;
    setBusy(true);
    markAwaitingFreshRun('what');
    // Clear Review UI immediately (stale Data Gate / Gate1 from previous run)
    setLiveRun((prev) => {
      const next = clearStaleReviewLiveRun(prev);
      liveRunRef.current = next;
      return next;
    });
    setPack((prev) => {
      if (!prev?.aiAnalysis) return prev;
      const ai = { ...prev.aiAnalysis };
      const analyses = { ...(ai.analyses || {}) };
      delete analyses.g4Understanding;
      delete analyses.srsProposal;
      const gate1 = { ...(ai.gate1 || {}) };
      delete gate1.reviewLane;
      delete gate1.reviewLaneUpdatedAt;
      gate1.activeSubmissionId = null;
      gate1.activeReviewId = null;
      ai.analyses = analyses;
      ai.gate1 = gate1;
      ai.phaseRuns = {
        ...(ai.phaseRuns || {}),
        phase_what: {
          ...(ai.phaseRuns?.phase_what || {}),
          status: 'pending',
          error: null,
          // Clear progress so Monitor sticky resets and does not stay on Gate1/step 6
          pipelineStep: null,
          pipelineSubstep: null,
          remoteRunId: null,
          readyForGate1: false,
        },
      };
      const prevStatus = String(prev.status || '');
      const next = {
        ...prev,
        status:
          prevStatus === 'under_review' || prevStatus === 'rejected' ? 'draft' : prev.status,
        submittedBy: undefined,
        submittedAt: undefined,
        aiAnalysis: ai,
      };
      packRef.current = next;
      return next;
    });
    // Stay on Monitor — also sync ?tab= so URL deep-link cannot bounce back to Review.
    goMonitorTab();
    clearGate1DecisionsForReseed();
    // Toast immediately — prepare_only + g4 can take seconds; do not wait for both APIs.
    toast.success(t(successKey) || successFallback);
    try {
      await runWhatPipeline({ force, feedback, parentRunId, idempotencyKey });
      await refresh();
    } catch (err) {
      clearAwaitingFreshRun();
      toast.error(
        resolveApiErrorMessage(err, {
          fallback: force
            ? t('requirements.aiWhatRunFail')
            : t('requirements.aiWhatRunFail'),
        })
      );
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const startWhatManual = () =>
    beginWhatRun({
      successKey: 'requirements.aiWhatRunStarted',
      successFallback: 'Đã bắt đầu AI Requirement (WHAT).',
    });

  const reviseWhat = () => {
    const reason =
      String(pack?.aiAnalysis?.gate1?.lastRejectReason || pack?.rejectionReason || '').trim() ||
      'gate1_reject_revise';
    const parentHint = String(
      liveRun?.runId ||
        phaseWhat?.remoteRunId ||
        phaseWhat?.runId ||
        pack?.aiAnalysis?.phaseRuns?.phase_what?.remoteRunId ||
        ''
    ).trim();
    // Stable key per parent revise action — S7 double-click → one child
    const idempotencyKey = parentHint
      ? `${packId}:phase_what:loop1_revise:${parentHint}`
      : `${packId}:phase_what:loop1_revise:pending`;
    return beginWhatRun({
      force: true,
      feedback: reason,
      parentRunId: parentHint,
      idempotencyKey,
      successKey: 'requirements.aiHitlReviseStarted',
      successFallback: 'Đã chạy lại AI WHAT (revise).',
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        <span>{translate('common.loading')}</span>
      </div>
    );
  }

  if (!packId) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {t('requirements.aiHitlNoPack')}
      </div>
    );
  }

  const packStatus = String(pack?.status || '');
  const statusLabel =
    ({
      draft: t('requirements.phase1Status_draft'),
      under_review: t('requirements.phase1Status_pending_review'),
      approved: t('requirements.phase1Status_approved'),
      rejected: t('requirements.phase1Status_rejected'),
      project_linked: t('requirements.phase1Status_active'),
      changes_requested: t('requirements.phase1Status_changes_requested'),
    }[packStatus.toLowerCase()] ||
      (packStatus ? packStatus.replace(/_/g, ' ') : ''));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 space-y-3 border-b border-border/60 px-3 pb-3 pt-3 sm:px-4 sm:pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
            {t('requirements.aiHitlPageTitle')}
          </h1>
          {statusLabel ? (
            <span className="rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {statusLabel}
            </span>
          ) : null}
        </div>

        {errorMsg ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {errorMsg}
          </p>
        ) : null}

        <div className="flex gap-1" role="tablist" aria-label="AI HITL tabs">
          {[
            ['monitor', t('requirements.aiHitlTabMonitor')],
            ['review', t('requirements.aiHitlTabReview')],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors sm:px-4 ${
                tab === id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* Scrollable body — prevents results/footer clipping under flex shell */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 pb-8 sm:px-4 sm:py-4 sm:pb-10">
        {/* Keep both panels mounted so Gate1 decisions/checkboxes survive tab switches */}
        <div className={tab === 'monitor' ? 'block' : 'hidden'}>
          <AiHitlMonitorPanel
            liveRun={liveRun}
            phaseWhat={phaseWhat}
            phaseHow={phaseHow}
            pack={pack}
            packStatus={packStatus}
            pipeline={
              liveRun?.pipelineStep != null
                ? { step: liveRun.pipelineStep, substep: liveRun.pipelineSubstep }
                : null
            }
            bootstrapping={Boolean(autoStarting || (wantStartWhat && !whatInFlight))}
            awaitingFreshRun={awaitingFreshRun}
            canStartWhat={canStartWhat}
            canRerunWhat={canRerunWhat}
            canRunHow={canRun && (packStatus === 'approved' || packStatus === 'project_linked')}
            canRerunHow={canRerunHow}
            whatStartBusy={busy}
            howStartBusy={busy}
            onStartWhat={startWhatManual}
            onRerunWhat={reviseWhat}
            onStartHow={startHowFirst}
            onRerunHow={rerunHow}
            t={t}
          />
        </div>
        <div className={tab === 'review' ? 'block' : 'hidden'}>
          <AiHitlReviewPanel
            reviewMode={reviewMode}
            reviewView={gate1ReviewView}
            t={t}
            packStatus={packStatus}
            canSubmit={canSubmit}
            canApprove={canApprove}
            gate1Summary={reviewMode === 'gate1' ? gate1Summary : null}
            gate1Busy={busy}
            gate1Decisions={gate1Decisions}
            setGate1Decision={setGate1Decision}
            clearGate1Decision={clearGate1Decision}
            onGate1Submit={onGate1Submit}
            onGate1Approve={onGate1Approve}
            onGate1Reject={onGate1Reject}
            gate2ReviewView={gate2ReviewView}
            gate2HowStatus={gate2HowStatus}
            gate2ReviewLane={gate2ReviewLane}
            gate2RejectReason={gate2RejectReason}
            gate2Busy={busy}
            canPromote={canPromote}
            pack={pack}
            gate2Decisions={gate2Decisions}
            setGate2Decision={setGate2Decision}
            parallelTracks={gate2ParallelTracks}
            gate2Proposals={gate2Proposals}
            onGate2TrackSubmit={onGate2TrackSubmit}
            onGate2ProposeChange={onGate2ProposeChange}
            onGate2DecideChange={onGate2DecideChange}
            onGate2KeepOriginal={onGate2KeepOriginal}
            onGate2Escalate={onGate2Escalate}
            onGate2ResolveEscalation={onGate2ResolveEscalation}
            onGate2PmConfirmPlan={onGate2PmConfirmPlan}
            onGate2PoApprove={onGate2PoApprove}
            onGate2PoReject={onGate2PoReject}
          />
        </div>
      </div>
      {noteDialog}
      <GateActionOverlay
        message={gateActionLabel}
        hint={t('requirements.gateActionPleaseWait') || 'Vui lòng không đóng trang.'}
      />
      <ConfirmDialog
        isOpen={Boolean(ackDialog)}
        onClose={() => setAckDialog(null)}
        onConfirm={() => setAckDialog(null)}
        title={ackDialog?.title || ''}
        message={ackDialog?.message || ''}
        confirmText={t('common.confirm') || t('common.close')}
        cancelText=""
      />
    </div>
  );
}
