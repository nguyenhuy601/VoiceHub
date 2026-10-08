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
import { buildGate1ProposalItems } from '../buildGate1ProposalItems';
import { attachConflictAmbiguityToGate1Bundle } from '../gate1/resolveConflictAmbiguityUi';
import useProjectCapabilities from '../hooks/useProjectCapabilities';
import AiHitlMonitorPanel from './AiHitlMonitorPanel';
import AiHitlReviewPanel from './AiHitlReviewPanel';
import { resolveAiHitlReviewMode } from './aiHitlReviewMode';
import { resolveGate1ReviewLane, resolveGate1ReviewView } from './gate1ReviewLane';
import { resolveGate2ReviewLane, resolveGate2ReviewView } from './gate2ReviewLane';
import { resolveHitlRequirementFlags } from './resolveHitlRequirementFlags';

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
    return { status: 'queued', gatePreview: null, gate: null };
  }
  return {
    ...prev,
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
  const { capabilities: projectCaps } = useProjectCapabilities(projectId);
  const { shouldPausePolling } = useNetworkStatus();
  const { requestNote, noteDialog } = useReviewNotePrompt();

  const packIdFromQuery = String(searchParams.get('packId') || '').trim();
  const wantStartWhat = ['1', 'true'].includes(String(searchParams.get('startWhat') || '').toLowerCase());
  const tabFromQuery = String(searchParams.get('tab') || '')
    .trim()
    .toLowerCase();

  const [tab, setTab] = useState(() =>
    tabFromQuery === 'review' || tabFromQuery === 'monitor' ? tabFromQuery : 'monitor'
  );
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [packId, setPackId] = useState(packIdFromQuery);
  const [pack, setPack] = useState(null);
  const [liveRun, setLiveRun] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [autoStarting, setAutoStarting] = useState(false);
  const [gate1Decisions, setGate1Decisions] = useState({});
  const [gate2Decisions, setGate2Decisions] = useState({});
  const gate1SeededVersionRef = useRef(null);
  const gate2SeededVersionRef = useRef(null);
  const autoStartRef = useRef(false);
  const startedWhatKeyRef = useRef('');

  // Project PO/BA role (sidebar) must drive Gate1 — org persona alone misses project-only PO.
  const hitlFlags = useMemo(
    () =>
      resolveHitlRequirementFlags({
        canSubmitOrg: Boolean(requirementAccess?.canSubmit),
        canApproveOrg: Boolean(requirementAccess?.canApprove),
        canRunOrg: Boolean(requirementAccess?.canRunAiPlanning),
        canPromoteOrg: Boolean(requirementAccess?.canCreateFromPack),
        viewerProjectRoleKeys: projectCaps.viewerProjectRoleKeys,
        canReviewAnalysisPo: projectCaps.canReviewAnalysisPo,
        canBaAuthorAnalysis: projectCaps.canBaAuthorAnalysis,
        canReviewAnalysisBa: projectCaps.canReviewAnalysisBa,
        canReviewPlanningPm: projectCaps.canReviewPlanningPm,
        canReviewPlanningPo: projectCaps.canReviewPlanningPo,
      }),
    [requirementAccess, projectCaps]
  );
  const canRun = hitlFlags.canRun;
  const canSubmit = hitlFlags.canSubmit;
  const canApprove = hitlFlags.canApprove;
  const canPromote = hitlFlags.canPromote;
  const canReviewGate2Pm = hitlFlags.canReviewGate2Pm;
  const canReviewGate2Po = hitlFlags.canReviewGate2Po;

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

  const refresh = useCallback(async () => {
    const id = packId || (await resolvePackId());
    if (!organizationId || !id) {
      setLoading(false);
      return null;
    }
    if (id !== packId) setPackId(id);
    const packRes = await requirementAPI.getPack(organizationId, id, { view: 'full' });
    const next = unwrap(packRes);
    setPack(next);
    setLiveRun((prev) => {
      const incoming = next?.liveRun || null;
      if (!prev || !incoming) return incoming;
      if (String(prev.runId || '') !== String(incoming.runId || '')) return incoming;
      const prevStep = Number(prev.pipelineStep) || 0;
      const nextStep = Number(incoming.pipelineStep) || 0;
      // Same run: never regress business progress (post–Data Gate claim gaps).
      if (prev.pipelineSubstep && (!incoming.pipelineSubstep || nextStep < prevStep)) {
        return {
          ...incoming,
          pipelineStep: prev.pipelineStep,
          pipelineSubstep: prev.pipelineSubstep,
        };
      }
      return incoming;
    });
    setLoading(false);
    return next;
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
              fallback: t('requirements.aiHitlLoadError') || 'Không tải được pack AI.',
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
  const onHowStarted = useCallback(() => {
    goMonitorTab();
    // Optimistic pending so auto-open Review cannot yank back before start API returns.
    setPack((prev) => {
      if (!prev) return prev;
      const ai = { ...(prev.aiAnalysis || {}) };
      ai.phaseRuns = {
        ...(ai.phaseRuns || {}),
        phase_how: {
          ...(ai.phaseRuns?.phase_how || {}),
          status: 'pending',
          error: null,
        },
      };
      return { ...prev, aiAnalysis: ai };
    });
  }, [goMonitorTab]);

  const howHasResult = ['ready', 'completed', 'confirmed', 'failed', 'error'].includes(
    howStatusNorm
  );
  const packHowEligible =
    packStatusEarly === 'approved' || packStatusEarly === 'project_linked';
  /** Every PO sees re-run HOW when Gate1 done and HOW not currently running. */
  const canRerunHow =
    canReviewGate2Po && packHowEligible && !howInFlight && howHasResult;

  /** Start / re-run HOW from Monitor (or header for PO). Review tab stays decide-only. */
  const startHowManual = useCallback(
    async ({ force = false } = {}) => {
      if (!organizationId || !packId || busy) return;
      const useForce = force === true;
      setBusy(true);
      onHowStarted();
      if (useForce) setGate2Decisions({});
      try {
        await requirementAPI.startPhaseAiPlanning(organizationId, packId, {
          phase: 'how',
          ...(useForce ? { force: true } : {}),
          ...(projectId ? { projectId: String(projectId) } : {}),
        });
        toast.success(
          useForce
            ? t('requirements.aiHowRerunStarted') || 'Đã chạy lại AI Planning (HOW).'
            : t('requirements.aiHowRunStarted') || 'Đã bắt đầu AI Planning (HOW).'
        );
        await refresh();
      } catch (err) {
        toast.error(
          resolveApiErrorMessage(err, {
            fallback: t('requirements.aiHowRunFail') || 'Không start được AI Planning (HOW).',
          })
        );
        await refresh().catch(() => {});
      } finally {
        setBusy(false);
      }
    },
    [organizationId, packId, projectId, busy, onHowStarted, refresh, t]
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
      setLiveRun(clearStaleReviewLiveRun);
      goMonitorTab();
      toast.success(
        t('requirements.aiWhatRunStarted') || 'Đã bắt đầu AI Requirement (WHAT).'
      );
      try {
        await runWhatPipeline({ force: true });
        await refresh();
      } catch (err) {
        autoStartRef.current = false;
        startedWhatKeyRef.current = '';
        toast.error(
          resolveApiErrorMessage(err, {
            fallback: t('requirements.aiWhatRunFail') || 'Không start được AI Requirement.',
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
  const gate2ReviewView = useMemo(
    () =>
      resolveGate2ReviewView({
        lane: gate2ReviewLane,
        howStatus: gate2HowStatus,
        canReviewPm: canReviewGate2Pm,
        canReviewPo: canReviewGate2Po,
      }),
    [gate2ReviewLane, gate2HowStatus, canReviewGate2Pm, canReviewGate2Po]
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
            t('requirements.phase1DataGateRemovedHint') ||
              'Data Gate đã gỡ — hãy Chạy AI WHAT / AI revise để tiếp tục.'
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
      toast.success(t('requirements.phase1DataGatePassToast') || 'Đã Pass Data Gate — AI chạy tiếp.');
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
      toast.success(t('requirements.phase1DataGateRejectToast') || 'Đã Reject — có thể chạy lại WHAT.');
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
      title: t('requirements.phase1Gate1ConfirmTitle') || 'Xác nhận duyệt Gate 1',
      description:
        t('requirements.phase1Gate1ConfirmBaDesc') ||
        'BA xác nhận bản AI và chuyển PO duyệt. Ghi chú tuỳ chọn.',
      placeholder: t('requirements.phase1Gate1ConfirmNotePlaceholder') || 'Ghi chú (tuỳ chọn)…',
      submitLabel: t('requirements.phase1Gate1ConfirmCta') || 'Xác nhận duyệt',
      variant: 'generic',
      noteOptional: true,
      maxLength: 1000,
    });
    if (note === null) return;
    setBusy(true);
    try {
      await requirementAPI.submitPack(organizationId, packId, {
        reviewDecisions,
        expectedReviewVersion: reviewVersion,
        expectedRevisionIds: expectedRevisionIds || undefined,
        withdrawSubmissionId: withdrawSubmissionId || undefined,
        note: note || undefined,
      });
      toast.success(
        t('requirements.understandingGate1Submitted') || 'Đã xác nhận duyệt — chờ PO.'
      );
      // Allow one reseed from server after submit (new reviewVersion / persisted decisions)
      clearGate1DecisionsForReseed();
      await refresh();
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { fallback: 'Submit Gate 1 failed' }));
    } finally {
      setBusy(false);
    }
  };

  const onGate1Approve = async () => {
    if (!organizationId || !packId || busy) return;
    const note = await requestNote({
      title: t('requirements.phase1Gate1PoConfirmTitle') || 'Xác nhận cuối cùng Gate 1',
      description:
        t('requirements.phase1Gate1ConfirmPoDesc') ||
        'PO xác nhận duyệt Gate 1 — Monitor chuyển Phase How và chạy AI HOW. Ghi chú tuỳ chọn.',
      placeholder: t('requirements.phase1Gate1ConfirmNotePlaceholder') || 'Ghi chú (tuỳ chọn)…',
      submitLabel: t('requirements.phase1Gate1PoConfirmCta') || 'Xác nhận',
      variant: 'generic',
      noteOptional: true,
      maxLength: 1000,
    });
    if (note === null) return;
    setBusy(true);
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
              t('requirements.gate1ForceReasonPlaceholder') ||
              'Nhập lý do force duyệt Gate 1…',
            submitLabel: t('requirements.approveForced') || t('requirements.approve') || 'Duyệt',
            variant: 'request_changes',
            maxLength: 2000,
          }),
      });
      if (!result.ok) return;
      toast.success(t('requirements.phase1ApproveOk') || 'PO đã duyệt Gate 1.');
      // Monitor → Phase How + start HOW immediately after PO final confirm
      goMonitorTab();
      setPack((prev) => {
        if (!prev) return prev;
        const ai = { ...(prev.aiAnalysis || {}) };
        ai.phaseRuns = {
          ...(ai.phaseRuns || {}),
          phase_how: {
            ...(ai.phaseRuns?.phase_how || {}),
            status: 'pending',
            error: null,
          },
        };
        return { ...prev, status: 'approved', aiAnalysis: ai };
      });
      try {
        await requirementAPI.startPhaseAiPlanning(organizationId, packId, {
          phase: 'how',
          ...(projectId ? { projectId: String(projectId) } : {}),
        });
        toast.success(
          t('requirements.aiHowRunStarted') || 'Đã bắt đầu AI Planning (HOW).'
        );
      } catch (howErr) {
        toast.error(
          resolveApiErrorMessage(howErr, {
            fallback:
              t('requirements.aiHowRunFail') ||
              'Gate 1 đã duyệt nhưng chưa start được Phase How.',
          })
        );
      }
      await refresh();
    } catch (err) {
      toast.error(
        formatGate1ApproveError(err, { t, fallback: 'Approve Gate 1 failed' }) ||
          resolveApiErrorMessage(err)
      );
    } finally {
      setBusy(false);
    }
  };

  const onGate1Reject = async () => {
    if (!organizationId || !packId || busy) return;
    const reasonRaw = await requestNote({
      title: t('requirements.phase1Gate1PoRejectTitle') || 'Từ chối bản duyệt Gate 1',
      description:
        t('requirements.phase1Gate1PoRejectDesc') ||
        'Bản duyệt sẽ trả về BA và BA được thông báo. Nhập lý do từ chối.',
      placeholder: t('requirements.rejectReasonPlaceholder') || 'Lý do từ chối…',
      submitLabel: t('requirements.phase1Gate1PoRejectCta') || 'Từ chối',
      variant: 'reject',
      maxLength: 2000,
    });
    if (reasonRaw === null) return;
    const reason = String(reasonRaw).trim().slice(0, 2000);
    if (!reason) {
      toast.error(t('requirements.rejectReasonRequired') || 'Cần lý do khi từ chối.');
      return;
    }
    setBusy(true);
    try {
      await requirementAPI.rejectPack(organizationId, packId, reason, {
        projectId,
      });
      toast.success(
        t('requirements.phase1Gate1PoRejectOk') ||
          'Đã từ chối — bản duyệt trả về BA.'
      );
      clearGate1DecisionsForReseed();
      await refresh();
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, {
          fallback: t('requirements.rejectFail') || 'Từ chối Gate 1 thất bại',
        })
      );
    } finally {
      setBusy(false);
    }
  };

  const onGate2PmSubmit = async (meta = {}) => {
    if (!organizationId || !packId || busy) return;
    const payloadDecisions = meta.reviewDecisions;
    const warnParts = [];
    if (meta.decisionsComplete === false) {
      warnParts.push(
        t('requirements.gate2WarnIncompleteDecisions') ||
          'Còn dòng chưa quyết định (Accept/Edit/Reject).'
      );
    }
    if (Number(meta.missingCount) > 0) {
      warnParts.push(
        t('requirements.gate2WarnMissingSections', { count: meta.missingCount }) ||
          `${meta.missingCount} section thiếu dữ liệu (vd. Risks).`
      );
    }
    if (Number(meta.conflictSectionCount) > 0) {
      warnParts.push(
        t('requirements.gate2WarnConflictSections', { count: meta.conflictSectionCount }) ||
          `${meta.conflictSectionCount} section có cảnh báo.`
      );
    }
    const baseDesc =
      t('requirements.gate2PmSubmitDesc') ||
      'PM xác nhận kế hoạch HOW và gửi PO. Ghi chú tuỳ chọn.';
    const description = warnParts.length
      ? `${t('requirements.gate2WarnLead') || 'Cảnh báo trước khi gửi duyệt:'}\n• ${warnParts.join('\n• ')}\n\n${baseDesc}`
      : baseDesc;
    const note = await requestNote({
      title: t('requirements.gate2PmSubmitTitle') || 'Gửi PO duyệt Gate 2',
      description,
      placeholder: t('requirements.gate2SubmitNotePlaceholder') || 'Ghi chú (tuỳ chọn)…',
      submitLabel:
        warnParts.length
          ? t('requirements.gate2PmSubmitAnyway') || 'Vẫn gửi PO duyệt'
          : t('requirements.gate2PmSubmit') || 'Gửi PO duyệt',
      variant: warnParts.length ? 'warning' : 'generic',
      noteOptional: true,
      maxLength: 1000,
    });
    if (note === null) return;
    setBusy(true);
    try {
      const decisions =
        payloadDecisions && typeof payloadDecisions === 'object'
          ? payloadDecisions
          : gate2Decisions;
      await requirementAPI.confirmPhaseGate2(organizationId, packId, {
        action: 'pm_submit',
        reviewDecisions: decisions,
        ...(String(note || '').trim() ? { note: String(note).trim().slice(0, 1000) } : {}),
      });
      toast.success(
        t('requirements.gate2PmSubmitOk') || 'Đã gửi PO duyệt Gate 2.'
      );
      await refresh();
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, {
          fallback: t('requirements.gate2PmSubmitFail') || 'Gửi duyệt Gate 2 thất bại',
        })
      );
    } finally {
      setBusy(false);
    }
  };

  const onGate2PoApprove = async (meta = {}) => {
    if (!organizationId || !packId || busy) return;
    const activateOnly = Boolean(meta.activateOnly);
    const forceApprove = Boolean(meta.forceApprove);
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
    if (forceApprove || activateOnly) {
      warnParts.push(
        t('requirements.gate2WarnForcePromote') ||
          'Kích hoạt delivery có thể ghi đè cổng G13 feasibility (resource/schedule) nếu chưa đạt.'
      );
    }
    if (meta.canPromote === false && !canReviewGate2Po) {
      warnParts.push(
        t('requirements.gate2WarnNoPromotePerm') ||
          'Tài khoản có thể thiếu quyền kích hoạt delivery từ pack.'
      );
    }
    const baseDesc = activateOnly
      ? t('requirements.gate2ActivateDesc') ||
        'Gate 2 đã confirmed — kích hoạt Phase 2 delivery (import WBS lên board).'
      : t('requirements.gate2PoApproveDesc') ||
        'PO chấp nhận kế hoạch và kích hoạt dự án. Ghi chú tuỳ chọn.';
    const description = warnParts.length
      ? `${t('requirements.gate2WarnLead') || 'Cảnh báo trước khi duyệt:'}\n• ${warnParts.join('\n• ')}\n\n${baseDesc}`
      : baseDesc;
    const note = await requestNote({
      title: activateOnly
        ? t('requirements.promoteProjectRetry') || 'Kích hoạt / tiếp tục delivery'
        : t('requirements.gate2PoApproveTitle') || 'PO duyệt Gate 2',
      description,
      placeholder: t('requirements.gate2ConfirmNotePlaceholder') || 'Ghi chú (tuỳ chọn)…',
      submitLabel: activateOnly
        ? t('requirements.promoteProjectRetry') || 'Kích hoạt delivery'
        : warnParts.length
          ? t('requirements.gate2PoApproveAnyway') || 'Vẫn duyệt & kích hoạt'
          : t('requirements.gate2PoApprove') || 'Duyệt Gate 2 & kích hoạt',
      variant: warnParts.length ? 'warning' : 'generic',
      noteOptional: true,
      maxLength: 1000,
    });
    if (note === null) return;
    setBusy(true);
    try {
      const howSt = String(pack?.aiAnalysis?.phaseRuns?.phase_how?.status || '');
      let promotePayload = null;
      const overrideReason =
        String(note || '').trim() ||
        (forceApprove || activateOnly
          ? 'PO kích hoạt delivery sau Gate 2 (G13 override nếu cần).'
          : '');
      if (!activateOnly && howSt !== 'confirmed') {
        const confirmRes = await requirementAPI.confirmPhaseGate2(organizationId, packId, {
          action: 'po_approve',
          ...(String(note || '').trim() ? { note: String(note).trim().slice(0, 1000) } : {}),
        });
        const confirmData = unwrap(confirmRes) || {};
        if (confirmData.promoted && confirmData.promote) {
          promotePayload = confirmData;
        } else if (confirmData.promoteError) {
          console.warn('[gate2] auto-promote failed, retry create-project', confirmData.promoteError);
        }
      }
      if (!promotePayload?.promoted) {
        const res = await requirementAPI.createProjectFromPack(organizationId, packId, {
          importWorkItems: true,
          applyAssignees: true,
          ...(forceApprove || activateOnly
            ? { forceApprove: true, overrideReason: overrideReason.slice(0, 2000) }
            : {}),
        });
        promotePayload = unwrap(res);
      }
      toast.success(
        t('requirements.gate2ConfirmAndPromoteSuccess') ||
          'Đã xác nhận Gate 2 và kích hoạt dự án (Phase 2 delivery).'
      );
      onPromoted?.(promotePayload);
      await refresh().catch(() => {});
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, {
          fallback:
            t('requirements.gate2ConfirmAndPromoteFail') ||
            'Duyệt Gate 2 / kích hoạt thất bại',
        })
      );
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const onGate2PoReject = async () => {
    if (!organizationId || !packId || busy) return;
    const reasonRaw = await requestNote({
      title: t('requirements.gate2PoRejectTitle') || 'Từ chối Gate 2',
      description:
        t('requirements.gate2PoRejectDesc') ||
        'Kế hoạch trả về PM. Nhập lý do từ chối.',
      placeholder: t('requirements.rejectReasonPlaceholder') || 'Lý do từ chối…',
      submitLabel: t('requirements.gate2PoReject') || 'Từ chối — trả PM',
      variant: 'reject',
      maxLength: 2000,
    });
    if (reasonRaw === null) return;
    const reason = String(reasonRaw).trim().slice(0, 2000);
    if (!reason) {
      toast.error(t('requirements.rejectReasonRequired') || 'Cần lý do khi từ chối.');
      return;
    }
    setBusy(true);
    try {
      await requirementAPI.confirmPhaseGate2(organizationId, packId, {
        action: 'po_reject',
        note: reason,
      });
      toast.success(
        t('requirements.gate2PoRejectOk') || 'Đã từ chối — trả về PM.'
      );
      await refresh();
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, {
          fallback: t('requirements.gate2PoRejectFail') || 'Từ chối Gate 2 thất bại',
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
    // Clear Review UI immediately (stale Data Gate / Gate1 from previous run)
    setLiveRun(clearStaleReviewLiveRun);
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
      return {
        ...prev,
        status:
          prevStatus === 'under_review' || prevStatus === 'rejected' ? 'draft' : prev.status,
        submittedBy: undefined,
        submittedAt: undefined,
        aiAnalysis: ai,
      };
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
      toast.error(
        resolveApiErrorMessage(err, {
          fallback: force
            ? t('requirements.aiWhatRunFail') || 'Revise WHAT failed'
            : t('requirements.aiWhatRunFail') || 'Start WHAT failed',
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
        {t('requirements.aiHitlNoPack') || 'Chưa có requirement pack gắn dự án AI.'}
      </div>
    );
  }

  const packStatus = String(pack?.status || '');

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-3 sm:p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-foreground">
            {t('requirements.aiHitlPageTitle') || 'AI HITL — Monitor & Duyệt'}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            packId={packId} · {packStatus || '—'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canRerunHow ? (
            <button
              type="button"
              disabled={busy || howInFlight}
              onClick={rerunHow}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-40"
              title={
                t('requirements.aiHitlRerunHowHint') ||
                'Chạy lại Phase HOW (WBS…Schedule) — Gate 2 reset về PM'
              }
            >
              {t('requirements.aiHitlRerunHow') || 'Chạy lại HOW'}
            </button>
          ) : null}
          {canRun &&
          !whatInFlight &&
          packStatus !== 'approved' &&
          packStatus !== 'project_linked' ? (
            <button
              type="button"
              disabled={busy}
              onClick={
                packStatus === 'under_review' ||
                packStatus === 'rejected' ||
                Boolean(phaseWhat?.remoteRunId || phaseWhat?.status === 'ready')
                  ? reviseWhat
                  : startWhatManual
              }
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
              title={
                packStatus === 'under_review'
                  ? t('requirements.aiHitlReviseUnderReviewHint') ||
                    'Chạy lại AI — reset duyệt BA→PO, BA phải xác nhận lại'
                  : undefined
              }
            >
              {packStatus === 'under_review' ||
              packStatus === 'rejected' ||
              Boolean(phaseWhat?.remoteRunId || phaseWhat?.status === 'ready')
                ? t('requirements.aiHitlRevise') || 'AI revise / chạy lại'
                : t('requirements.aiHitlStartWhat') || 'Chạy AI WHAT'}
            </button>
          ) : null}
        </div>
      </header>

      {errorMsg ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {errorMsg}
        </p>
      ) : null}

      <div className="flex gap-1 border-b border-border">
        {[
          ['monitor', t('requirements.aiHitlTabMonitor') || 'Monitor'],
          ['review', t('requirements.aiHitlTabReview') || 'Duyệt'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {/* Keep both panels mounted so Gate1 decisions/checkboxes survive tab switches */}
        <div className={tab === 'monitor' ? 'min-h-0 h-full' : 'hidden'}>
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
            canRunHow={canRun && (packStatus === 'approved' || packStatus === 'project_linked')}
            canRerunHow={canRerunHow}
            howStartBusy={busy}
            onStartHow={startHowFirst}
            onRerunHow={rerunHow}
            t={t}
          />
        </div>
        <div className={tab === 'review' ? 'min-h-0 h-full' : 'hidden'}>
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
            onGate2PmSubmit={onGate2PmSubmit}
            onGate2PoApprove={onGate2PoApprove}
            onGate2PoReject={onGate2PoReject}
          />
        </div>
      </div>
      {noteDialog}
    </div>
  );
}
