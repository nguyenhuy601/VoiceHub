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
import { buildGate1ProposalItems } from '../buildGate1ProposalItems';
import { attachConflictAmbiguityToGate1Bundle } from '../gate1/resolveConflictAmbiguityUi';
import AiHitlMonitorPanel from './AiHitlMonitorPanel';
import AiHitlReviewPanel from './AiHitlReviewPanel';
import { resolveAiHitlReviewMode } from './aiHitlReviewMode';

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
  const { shouldPausePolling } = useNetworkStatus();

  const packIdFromQuery = String(searchParams.get('packId') || '').trim();
  const wantStartWhat = ['1', 'true'].includes(String(searchParams.get('startWhat') || '').toLowerCase());

  const [tab, setTab] = useState('monitor');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [packId, setPackId] = useState(packIdFromQuery);
  const [pack, setPack] = useState(null);
  const [liveRun, setLiveRun] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [autoStarting, setAutoStarting] = useState(false);
  const autoStartRef = useRef(false);
  const startedWhatKeyRef = useRef('');

  const canRun = Boolean(requirementAccess?.canRunAiPlanning);
  const canSubmit = Boolean(requirementAccess?.canSubmit);
  const canApprove = Boolean(requirementAccess?.canApprove);
  const canPromote = Boolean(requirementAccess?.canCreateFromPack);

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
  const liveStatus = String(liveRun?.status || '');
  const whatInFlight =
    ['pending', 'running', 'waiting_human'].includes(liveStatus) ||
    String(phaseWhat?.status || '') === 'pending';
  // HITL pause: do not poll while waiting_human — refresh() replaces gatePreview every 2s
  // and Phase1DataGateReviewPanel resets the table (visible flicker).
  const shouldPollWhat =
    !shouldPausePolling &&
    liveStatus !== 'waiting_human' &&
    (['pending', 'running', 'queued', 'replanning'].includes(liveStatus) ||
      String(phaseWhat?.status || '') === 'pending');

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
      setTab('monitor');
      try {
        await runWhatPipeline({ force: true });
        toast.success(t('requirements.aiPhaseRunStarted') || 'Đã bắt đầu AI WHAT.');
        await refresh();
      } catch (err) {
        autoStartRef.current = false;
        startedWhatKeyRef.current = '';
        toast.error(
          resolveApiErrorMessage(err, {
            fallback: t('requirements.aiPhaseRunFailed') || 'Không start được AI.',
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
    t,
  ]);

  const reviewMode = useMemo(() => resolveAiHitlReviewMode(pack, liveRun), [pack, liveRun]);

  useEffect(() => {
    if (reviewMode === 'gate1' || reviewMode === 'gate2') {
      setTab('review');
    }
  }, [reviewMode]);

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
      setTab('monitor');
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
    setBusy(true);
    try {
      await requirementAPI.submitPack(organizationId, packId, {
        reviewDecisions,
        expectedReviewVersion: reviewVersion,
        expectedRevisionIds: expectedRevisionIds || undefined,
        withdrawSubmissionId: withdrawSubmissionId || undefined,
      });
      toast.success(t('requirements.understandingGate1Submitted') || 'Đã gửi duyệt Gate 1.');
      await refresh();
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { fallback: 'Submit Gate 1 failed' }));
    } finally {
      setBusy(false);
    }
  };

  const onGate1Approve = async () => {
    if (!organizationId || !packId || busy) return;
    setBusy(true);
    try {
      await approveRequirementPackWithGate1({
        orgId: organizationId,
        packId,
        t,
      });
      toast.success(t('requirements.phase1ApproveOk') || 'PO đã duyệt Gate 1.');
      await refresh();
    } catch (err) {
      toast.error(formatGate1ApproveError(err, t) || resolveApiErrorMessage(err));
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
      ai.analyses = analyses;
      ai.phaseRuns = {
        ...(ai.phaseRuns || {}),
        phase_what: {
          ...(ai.phaseRuns?.phase_what || {}),
          status: 'pending',
          error: null,
        },
      };
      return { ...prev, aiAnalysis: ai };
    });
    setTab('monitor');
    try {
      await runWhatPipeline({ force, feedback, parentRunId, idempotencyKey });
      toast.success(t(successKey) || successFallback);
      await refresh();
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, {
          fallback: force ? 'Revise WHAT failed' : 'Start WHAT failed',
        })
      );
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const startWhatManual = () =>
    beginWhatRun({
      successKey: 'requirements.aiPhaseRunStarted',
      successFallback: 'Đã bắt đầu AI WHAT.',
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
      successFallback: 'Đã chạy lại AI WHAT (Loop 1 — Step 4).',
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
          {canRun && !whatInFlight && packStatus !== 'approved' && packStatus !== 'project_linked' ? (
            <button
              type="button"
              disabled={busy}
              onClick={startWhatManual}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              {t('requirements.aiHitlStartWhat') || 'Chạy AI WHAT'}
            </button>
          ) : null}
          {canRun && (packStatus === 'rejected' || packStatus === 'draft') ? (
            <button
              type="button"
              disabled={busy}
              onClick={reviseWhat}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 disabled:opacity-40"
            >
              {t('requirements.aiHitlRevise') || 'AI revise / chạy lại'}
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
        {tab === 'monitor' ? (
          <AiHitlMonitorPanel
            liveRun={liveRun}
            phaseWhat={phaseWhat}
            phaseHow={phaseHow}
            packStatus={packStatus}
            pipeline={
              liveRun?.pipelineStep != null
                ? { step: liveRun.pipelineStep, substep: liveRun.pipelineSubstep }
                : null
            }
            bootstrapping={Boolean(autoStarting || (wantStartWhat && !whatInFlight))}
            t={t}
          />
        ) : (
          <AiHitlReviewPanel
            key={`review-${reviewMode}-${liveRun?.runId || phaseWhat?.remoteRunId || 'none'}`}
            reviewMode={reviewMode}
            t={t}
            packStatus={packStatus}
            canSubmit={canSubmit}
            canApprove={canApprove}
            gate1Summary={reviewMode === 'gate1' ? gate1Summary : null}
            gate1Busy={busy}
            onGate1Submit={onGate1Submit}
            onGate1Approve={onGate1Approve}
            organizationId={organizationId}
            packId={packId}
            canRunHow={canRun && (packStatus === 'approved' || packStatus === 'project_linked')}
            canPromote={canPromote}
            onPromoted={onPromoted}
          />
        )}
      </div>
    </div>
  );
}
