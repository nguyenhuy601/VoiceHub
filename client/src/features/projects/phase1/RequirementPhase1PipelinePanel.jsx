import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, ListChecks, Sparkles, Eye } from 'lucide-react';
import { requirementAPI } from '../../../services/api/requirementAPI';
import { useAppStrings } from '../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import { buildPhase1ModulePath } from './nav/phase1NavConfig';
import { buildCollaborateRequirementsPath } from '../../../utils/suitePathUtils';
import { approveRequirementPackWithGate1, formatGate1ApproveError } from '../../requirements/approveRequirementPackWithGate1';
import RequirementHitlJourney from '../../requirements/RequirementHitlJourney';
import { waitForPhaseWhatJob } from './hooks/usePhaseWhatRunMonitor';
import Phase1AiRequirementProgress from './Phase1AiRequirementProgress';
import Phase1DataGateReviewModal from './Phase1DataGateReviewModal';
import Phase1Gate1ReviewModal from './Phase1Gate1ReviewModal';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

const GATE1_REVIEW_CAP = 40;

function clipReviewText(value) {
  const raw = Array.isArray(value)
    ? value
        .map((item) =>
          typeof item === 'string'
            ? item
            : item?.text || item?.criterion || item?.description || ''
        )
        .filter(Boolean)
        .join('; ')
    : value;
  const text = String(raw || '').trim();
  if (text.length <= 240) return text;
  return `${text.slice(0, 240)}…`;
}

function mapGate1ReviewRow(row, index) {
  return {
    id: String(row?.id || row?.externalId || row?.frId || `R-${index + 1}`).trim(),
    title: String(row?.title || row?.name || '').trim(),
    description: clipReviewText(row?.description),
    ac: clipReviewText(row?.ac || row?.acceptanceCriteria),
  };
}

function buildGate1ReviewItems(pack, g4) {
  const g4Reqs = Array.isArray(g4?.requirements) ? g4.requirements : [];
  const frs = Array.isArray(pack?.functionalRequirements) ? pack.functionalRequirements : [];
  const gateRows = Array.isArray(pack?.liveRun?.gatePreview?.rows)
    ? pack.liveRun.gatePreview.rows
    : [];
  const source = g4Reqs.length ? g4Reqs : frs.length ? frs : gateRows;
  return source
    .slice(0, GATE1_REVIEW_CAP)
    .map(mapGate1ReviewRow)
    .filter((row) => row.id || row.title || row.description || row.ac);
}

/** t() trả về chính key khi thiếu bản dịch — `|| fallback` không bắt được. */
function textOr(t, key, vars) {
  const value = typeof t === 'function' ? t(key, vars) : undefined;
  if (value == null || value === '' || value === key) return '';
  return value;
}

/**
 * Phase 1 tool-first — 2 stages:
 * 1) prepare_only (input readiness)
 * 2) tools_propose (tools → 1 projection → seed draft artifacts)
 * Gate 1: preview / submit / approve like manual pack flow.
 */
export default function RequirementPhase1PipelinePanel({
  projectId,
  organizationId,
  packId,
  analysisMode = 'manual',
  canRun = false,
  canSubmit = false,
  canApprove = false,
  onPipelineDone,
}) {
  const { t: translate } = useAppStrings();
  const t = useCallback((key, vars) => textOr(translate, key, vars), [translate]);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [busyStage, setBusyStage] = useState(null);
  const [packStatus, setPackStatus] = useState('');
  const [projectPlanStatus, setProjectPlanStatus] = useState('');
  const [stage1Meta, setStage1Meta] = useState(null);
  const [stage2Meta, setStage2Meta] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [runMonitor, setRunMonitor] = useState(null);
  const [pipeline, setPipeline] = useState(null);
  const [activeRunId, setActiveRunId] = useState('');
  const [dataGateOpen, setDataGateOpen] = useState(false);
  const [dataGatePreview, setDataGatePreview] = useState(null);
  const [gate1Open, setGate1Open] = useState(false);

  const isAi = String(analysisMode || '').toLowerCase() === 'ai';
  const gate1Done = packStatus === 'approved' || packStatus === 'project_linked';

  const refresh = useCallback(async () => {
    if (!organizationId || !packId) return null;
    const packRes = await requirementAPI.getPack(organizationId, packId, { view: 'full' });
    const pack = unwrap(packRes);
    setPackStatus(String(pack?.status || ''));
    const planStatus =
      pack?.aiAnalysis?.phaseRuns?.phase_how?.projectPlanStatus ||
      pack?.aiAnalysis?.analyses?.projectPlan?.status ||
      pack?.projectPlanStatus ||
      '';
    setProjectPlanStatus(String(planStatus || ''));
    const corpus = pack?.aiAnalysis?.intakeCorpus;
    const readinessMissing = [];
    if (!Array.isArray(pack?.aiAnalysis?.inputDocuments) || !pack.aiAnalysis.inputDocuments.length) {
      /* leave empty — stage1 meta owns missing when prepared */
    }
    if (corpus && (corpus.totalChars != null || Array.isArray(corpus.excerpts))) {
      setStage1Meta((prev) => ({
        ...(prev || {}),
        intakeCorpusChars: Number(corpus.totalChars) || 0,
        excerptsCount: Array.isArray(corpus.excerpts) ? corpus.excerpts.length : 0,
        toolsRan: Boolean(pack?.aiAnalysis?.analyses?.requirementTools),
        status: String(pack?.status || ''),
        missing: prev?.missing || readinessMissing,
      }));
    }
    const phaseWhat = pack?.aiAnalysis?.phaseRuns?.phase_what;
    const g4 = pack?.aiAnalysis?.analyses?.g4Understanding;
    const aiCtx = pack?.aiAnalysis?.analyses?.requirementAiContext;
    const knowledgeMeta = pack?.aiAnalysis?.analyses?.phase1Knowledge;
    const gateA = pack?.aiAnalysis?.analyses?.requirementTools?.gateA || aiCtx?.gateA;
    const g4Ready =
      phaseWhat?.status === 'ready' &&
      (phaseWhat?.mode === 'g4' || Array.isArray(g4?.requirements));
    if (g4Ready || (phaseWhat?.mode === 'tools_propose' && phaseWhat?.status === 'ready')) {
      const reviewItems = buildGate1ReviewItems(pack, g4);
      setStage2Meta((prev) => ({
        ...(prev || {}),
        done: true,
        pending: false,
        mode: phaseWhat?.mode || 'g4',
        reviewItems,
        g4RequirementCount: reviewItems.length
          ? reviewItems.length
          : Array.isArray(g4?.requirements)
            ? g4.requirements.length
            : 0,
        g4RelationshipCount: Array.isArray(g4?.relationships) ? g4.relationships.length : 0,
        llmCalls: Number(g4?.meta?.llmCalls) || prev?.llmCalls || 0,
        partial: Boolean(g4?.meta?.partial),
        status: String(pack?.status || ''),
        gateAPassed:
          gateA?.passed === true ||
          prev?.gateAPassed === true ||
          Boolean(phaseWhat.gateAPassed),
        citationCount:
          Number(knowledgeMeta?.citationCount) ||
          Number(phaseWhat.citationCount) ||
          Number(aiCtx?.knowledge?.citationCount) ||
          prev?.citationCount ||
          0,
        evidenceSpanCount:
          Number(phaseWhat.evidenceSpanCount) ||
          (Array.isArray(pack?.aiAnalysis?.analyses?.evidenceSpans)
            ? pack.aiAnalysis.analyses.evidenceSpans.length
            : 0) ||
          prev?.evidenceSpanCount ||
          0,
        retrievedSpanCount:
          Number(phaseWhat.retrievedSpanCount) ||
          Number(pack?.aiAnalysis?.analyses?.phase1EvidenceRetrieve?.count) ||
          prev?.retrievedSpanCount ||
          0,
        groundingPassCount: Number(phaseWhat.groundingPassCount) || prev?.groundingPassCount || 0,
        groundingFailCount: Number(phaseWhat.groundingFailCount) || prev?.groundingFailCount || 0,
        contextPersisted: Boolean(aiCtx) || Boolean(g4),
      }));
    } else if (phaseWhat?.status === 'pending') {
      setStage2Meta((prev) => ({
        ...(prev || {}),
        done: false,
        pending: true,
        mode: phaseWhat?.mode || 'g4',
        remoteRunId: phaseWhat?.remoteRunId || null,
      }));
    }
    return pack;
  }, [organizationId, packId]);

  const showDataGate = useCallback((live) => {
    setActiveRunId(String(live?.runId || ''));
    setDataGatePreview(live?.gatePreview || null);
    setDataGateOpen(true);
    setPipeline({
      step: Number(live?.pipelineStep) || 2,
      substep: live?.pipelineSubstep || 'gate_preview',
    });
  }, []);

  const loadGatePage = useCallback(
    async ({ offset, limit }) => {
      const packRes = await requirementAPI.getPack(organizationId, packId, {
        view: 'full',
        gateRowOffset: offset,
        gateRowLimit: limit,
      });
      const pack = unwrap(packRes);
      return pack?.liveRun?.gatePreview || null;
    },
    [organizationId, packId]
  );

  const followRun = useCallback(async (signal, { keepBusy = false } = {}) => {
    if (!keepBusy) {
      setBusy(true);
      setBusyStage(2);
    }
    let softHintShown = false;
    try {
      const result = await waitForPhaseWhatJob({
        refresh,
        signal,
        onTick: (tick) => {
          setRunMonitor({
            stage: tick.stage || '',
            computeStatus: tick.computeStatus || '',
            callbackStatus: tick.callbackStatus || '',
          });
          if (tick.pipelineStep) {
            setPipeline({ step: tick.pipelineStep, substep: tick.pipelineSubstep || null });
          }
          const callbackDone = tick.callbackStatus === 'acked';
          if (tick.computeStatus === 'completed' && !callbackDone) {
            setPipeline({ step: 4, substep: 'feasibility' });
          }
          if (tick.liveRun?.runId) setActiveRunId(String(tick.liveRun.runId));
          if (tick.softHint && !softHintShown) {
            softHintShown = true;
            toast(
              t('requirements.phase1Stage2StillRunning') ||
                'AI analysis vẫn đang chạy — bạn có thể rời màn hình và quay lại sau.'
            );
          }
        },
      });
      if (result?.awaitingGate === 'data_review') {
        showDataGate(result.liveRun);
        return;
      }
      toast.success(
        t('requirements.phase1RunOk') || 'AI Requirement đã xong — mở review Gate 1.'
      );
      setPipeline({ step: 5, substep: null });
      setGate1Open(true);
      onPipelineDone?.(result?.phaseWhat);
      await refresh();
    } catch (error) {
      if (error?.code === 'PHASE_WHAT_ABORTED') return;
      const msg = resolveApiErrorMessage(error, {
        t,
        fallback: t('requirements.phase1RunFail') || 'Không chạy được AI Requirement.',
      });
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      if (!keepBusy) {
        setBusy(false);
        setBusyStage(null);
        setRunMonitor(null);
      }
    }
  }, [onPipelineDone, refresh, showDataGate, t]);

  const followRunRef = useRef(followRun);
  followRunRef.current = followRun;

  useEffect(() => {
    if (!isAi || !organizationId || !packId) return undefined;
    const ac = new AbortController();
    (async () => {
      try {
        const pack = await refresh();
        if (ac.signal.aborted || !pack) return;
        const phase = pack?.aiAnalysis?.phaseRuns?.phase_what;
        const live = pack?.liveRun;
        const status = String(pack?.status || '');
        if (phase?.status === 'pending' && phase?.remoteRunId) {
          setActiveRunId(String(phase.remoteRunId));
          if (live?.status === 'waiting_human' && live?.gate === 'data_review') {
            showDataGate({ ...live, runId: live.runId || phase.remoteRunId });
            return;
          }
          await followRunRef.current(ac.signal);
          return;
        }
        if (phase?.status === 'ready' && status !== 'approved' && status !== 'project_linked') {
          setPipeline({ step: 5, substep: null });
          setGate1Open(true);
        }
        if (status === 'approved' || status === 'project_linked') {
          setPipeline({ step: 6, substep: null });
        }
      } catch (error) {
        if (error?.code === 'PHASE_WHAT_ABORTED') return;
      }
    })();
    return () => ac.abort();
  }, [isAi, organizationId, packId, refresh, showDataGate]);

  const runAiRequirement = async () => {
    if (!canRun || busy || dataGateOpen || !organizationId || !packId) return;
    setBusy(true);
    setBusyStage(1);
    setErrorMsg('');
    setGate1Open(false);
    setPipeline({ step: 1, substep: 'prepare' });
    try {
      const prepRes = await requirementAPI.startPhaseAiPlanning(organizationId, packId, {
        phase: 'what',
        mode: 'prepare_only',
      });
      const prepared = unwrap(prepRes);
      const missing = prepared?.readiness?.missing || [];
      setStage1Meta({
        intakeCorpusChars: Number(prepared?.intakeCorpusChars) || 0,
        excerptsCount: Number(prepared?.excerptsCount) || 0,
        skippedCount: Number(prepared?.skippedCount) || 0,
        missing,
        prefillApplied: Boolean(prepared?.readiness?.prefillApplied),
        status: String(prepared?.status || ''),
      });
      if (prepared?.status) setPackStatus(String(prepared.status));
      const requirementReadiness = prepared?.readiness?.requirementReadiness;
      if (requirementReadiness !== 'READY') {
        const diag = prepared?.readiness?.workbookDiagnostic;
        const codes = [
          ...(Array.isArray(diag?.reasonCodes) ? diag.reasonCodes : []),
          diag?.mappingDiagnostic?.failureReason,
        ].filter(Boolean);
        const msg =
          t('requirements.phase1InputBlocked', { codes: codes.join(', ') || 'NOT_READY' }) ||
          `Requirement chưa sẵn sàng: ${codes.join(', ') || 'NOT_READY'}`;
        setErrorMsg(msg);
        toast.error(msg);
        return;
      }
      const blocking = missing.filter((code) => code === 'no_analysis_snapshot');
      if (blocking.length) {
        const msg =
          t('requirements.phase1InputBlocked', { codes: blocking.join(', ') }) ||
          `Thiếu dữ liệu đầu vào: ${blocking.join(', ')}`;
        setErrorMsg(msg);
        toast.error(msg);
        return;
      }

      setBusyStage(2);
      const res = await requirementAPI.startPhaseAiPlanning(organizationId, packId, {
        phase: 'what',
        mode: 'g4',
        force: Boolean(stage2Meta?.done),
      });
      const data = unwrap(res);
      const acceptedRemote =
        res?.status === 202 ||
        (data?.accepted === true && data?.remote === true) ||
        data?.httpStatus === 202;
      if (!acceptedRemote) {
        const msg = t('requirements.phase1RunFail') || 'Không chạy được AI Requirement.';
        setErrorMsg(msg);
        toast.error(msg);
        return;
      }
      if (data?.runId) setActiveRunId(String(data.runId));
      await followRun(undefined, { keepBusy: true });
    } catch (error) {
      const msg = resolveApiErrorMessage(error, {
        t,
        fallback: t('requirements.phase1RunFail') || 'Không chạy được AI Requirement.',
      });
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      setBusyStage(null);
      setRunMonitor(null);
    }
  };

  const decideDataGate = async (decision) => {
    if (!organizationId || !packId || !activeRunId || busy) return;
    setBusy(true);
    setDataGateOpen(false);
    try {
      await requirementAPI.resumePhaseWhatDataGate(organizationId, packId, {
        runId: activeRunId,
        decision,
      });
      if (decision === 'reject') {
        toast(
          t('requirements.phase1DataGateRejected') ||
            'Đã dừng ở cổng dữ liệu. Sửa artifact rồi chạy lại.'
        );
        setPipeline(null);
        await refresh();
        return;
      }
      setBusyStage(2);
      setPipeline({ step: 3, substep: 'semantic' });
      await followRun(undefined, { keepBusy: true });
    } catch (error) {
      setDataGateOpen(true);
      const msg = resolveApiErrorMessage(error, {
        t,
        fallback: t('requirements.phase1RunFail') || 'Không chạy được AI Requirement.',
      });
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      setBusyStage(null);
      setRunMonitor(null);
    }
  };

  const submitGate1 = async () => {
    if (!canSubmit || busy || !organizationId || !packId) return;
    setBusy(true);
    try {
      await requirementAPI.submitPack(organizationId, packId);
      setPackStatus('under_review');
      toast.success(t('requirements.submitOk') || 'Đã gửi duyệt Gate 1.');
      await refresh();
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, {
          t,
          fallback: t('requirements.submitFail') || 'Gửi duyệt thất bại.',
        })
      );
    } finally {
      setBusy(false);
    }
  };

  const approveGate1 = async () => {
    if (!canApprove || busy || !organizationId || !packId) return;
    setBusy(true);
    try {
      await approveRequirementPackWithGate1({
        orgId: organizationId,
        packId,
        t,
      });
      setPackStatus('approved');
      setGate1Open(false);
      setPipeline({ step: 6, substep: null });
      toast.success(t('requirements.approveOk') || 'Gate 1 đã duyệt (SRS Canonical).');
      onPipelineDone?.({ status: 'approved' });
      await refresh();
    } catch (error) {
      toast.error(
        formatGate1ApproveError(error, {
          t,
          fallback: t('requirements.approveFail') || 'Duyệt Gate 1 thất bại.',
        })
      );
    } finally {
      setBusy(false);
    }
  };

  if (!isAi || !packId) return null;

  return (
    <section className="mb-4 rounded-lg border border-border bg-card p-4">
      <RequirementHitlJourney
        packStatus={packStatus}
        projectPlanStatus={projectPlanStatus}
        t={t}
      />
      <h3 className="text-sm font-semibold text-foreground">
        {t('requirements.phase1PipelineTitle') || 'AI Requirement (G4)'}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('requirements.phase1PipelineHintG4') ||
          'Đoạn 1: chuẩn bị input. Đoạn 2: G4 Understanding (remote) → Gate 1 duyệt một lần. Không chạy 4 job WHAT riêng.'}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {t('requirements.understandingPackStatus') || 'Pack'}:{' '}
          {packStatus
            ? t(`requirements.status.${packStatus}`) || packStatus
            : '—'}
        </span>
        {stage1Meta ? (
          <>
            <span>·</span>
            <span>
              {t('requirements.understandingCorpusChars', {
                count: stage1Meta.intakeCorpusChars,
              }) || `${stage1Meta.intakeCorpusChars} ký tự corpus`}
            </span>
          </>
        ) : null}
        {stage2Meta?.done ? (
          <>
            <span>·</span>
            <span>
              {t('requirements.phase1Seeded', {
                count: stage2Meta.seededArtifactCount ?? 0,
              }) || `Đã seed ${stage2Meta.seededArtifactCount ?? 0} artifacts`}
            </span>
            <span>·</span>
            <span>
              {t('requirements.phase1Citations', {
                count: stage2Meta.citationCount ?? 0,
              }) || `${stage2Meta.citationCount ?? 0} citations`}
            </span>
            {stage2Meta.evidenceSpanCount != null ? (
              <>
                <span>·</span>
                <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                  {t('requirements.phase1EvidenceSpans', {
                    count: stage2Meta.evidenceSpanCount ?? 0,
                  }) || `${stage2Meta.evidenceSpanCount ?? 0} evidence`}
                </span>
              </>
            ) : null}
            {stage2Meta.retrievedSpanCount != null && stage2Meta.retrievedSpanCount > 0 ? (
              <>
                <span>·</span>
                <span>
                  {t('requirements.phase1RetrievedSpans', {
                    count: stage2Meta.retrievedSpanCount ?? 0,
                  }) || `Retrieved ${stage2Meta.retrievedSpanCount ?? 0} spans`}
                </span>
              </>
            ) : null}
            {stage2Meta.groundingFailCount > 0 || stage2Meta.groundingPassCount > 0 ? (
              <>
                <span>·</span>
                <span>
                  {t('requirements.phase1Grounding', {
                    pass: stage2Meta.groundingPassCount ?? 0,
                    fail: stage2Meta.groundingFailCount ?? 0,
                  }) ||
                    `Grounding ${stage2Meta.groundingPassCount ?? 0}/${
                      (stage2Meta.groundingPassCount ?? 0) + (stage2Meta.groundingFailCount ?? 0)
                    }`}
                </span>
              </>
            ) : null}
            {stage2Meta.gateAPassed != null ? (
              <>
                <span>·</span>
                <span>
                  Gate A:{' '}
                  {stage2Meta.gateAPassed
                    ? t('common.ok') || 'OK'
                    : t('common.fail') || 'Fail'}
                </span>
              </>
            ) : null}
            {stage2Meta.contextPersisted ? (
              <>
                <span>·</span>
                <span>{t('requirements.phase1ContextOk') || 'AI Context: OK'}</span>
              </>
            ) : null}
          </>
        ) : null}
      </div>

      {Array.isArray(stage1Meta?.missing) && stage1Meta.missing.length ? (
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
          {t('requirements.phase1Missing') || 'Thiếu'}:{' '}
          {stage1Meta.missing
            .map((code) => {
              const key = `requirements.phase1Missing_${code}`;
              const label = t(key);
              return label && label !== key ? label : code;
            })
            .join(', ')}
        </p>
      ) : null}
      {errorMsg ? (
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">{errorMsg}</p>
      ) : null}
      {runMonitor && busyStage === 2 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {t('requirements.phase1JobMonitor', {
            stage: runMonitor.stage || '—',
            compute: runMonitor.computeStatus || '—',
            callback: runMonitor.callbackStatus || '—',
          }) ||
            `Job: ${runMonitor.stage || '—'} · compute ${runMonitor.computeStatus || '—'} · callback ${runMonitor.callbackStatus || '—'}`}
          {runMonitor.computeStatus === 'completed' &&
          runMonitor.callbackStatus &&
          runMonitor.callbackStatus !== 'acked'
            ? ` — ${t('requirements.phase1Finalizing') || 'Đang ghi kết quả…'}`
            : null}
        </p>
      ) : null}

      <Phase1AiRequirementProgress
        step={gate1Done ? 6 : pipeline?.step || (stage2Meta?.done ? 5 : 0)}
        substep={gate1Done ? null : pipeline?.substep || null}
        t={t}
      />

      {!gate1Done ? (
        <div className="mt-3">
          <button
            type="button"
            disabled={!canRun || busy || dataGateOpen}
            onClick={runAiRequirement}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {t('requirements.phase1RunCta') || 'Chạy AI Requirement'}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-300">
          {t('requirements.phase1ToPhase2') || 'Sang Phase 2'}
          {' — '}
          {t('requirements.understandingGate1Done') ||
            'Gate 1 đã duyệt — có thể chạy AI Planning (HOW).'}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!projectId}
          onClick={() =>
            navigate(buildPhase1ModulePath(projectId, 'analysis-fr', { organizationId }))
          }
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted/50 disabled:opacity-40"
        >
          <ListChecks className="h-4 w-4" />
          {t('requirements.understandingEditArtifacts') || 'Sửa artifacts (FR)'}
        </button>
        <button
          type="button"
          disabled={!organizationId || !packId}
          onClick={() =>
            navigate(
              buildCollaborateRequirementsPath(organizationId, {
                packId,
                projectId,
              })
            )
          }
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted/50 disabled:opacity-40"
        >
          <Eye className="h-4 w-4" />
          {t('requirements.phase1PreviewCta') || 'Preview pack (làm tay)'}
        </button>
        {!gate1Done && stage2Meta?.done ? (
          <button
            type="button"
            onClick={() => setGate1Open(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted/50"
          >
            {t('requirements.phase1OpenGate1') || 'Mở review Gate 1'}
          </button>
        ) : null}
      </div>
      <Phase1DataGateReviewModal
        open={dataGateOpen}
        preview={dataGatePreview}
        busy={busy}
        t={t}
        onLoadPage={loadGatePage}
        onPass={() => decideDataGate('pass')}
        onReject={() => decideDataGate('reject')}
      />
      <Phase1Gate1ReviewModal
        open={gate1Open && !gate1Done}
        packStatus={packStatus}
        canSubmit={canSubmit}
        canApprove={canApprove}
        summary={stage2Meta}
        busy={busy}
        t={t}
        onClose={() => setGate1Open(false)}
        onSubmit={submitGate1}
        onApprove={approveGate1}
      />
    </section>
  );
}
