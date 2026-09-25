import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  FileSearch,
  Loader2,
  ListChecks,
  Send,
  Sparkles,
  CheckCircle2,
  Eye,
} from 'lucide-react';
import { requirementAPI } from '../../../services/api/requirementAPI';
import { useAppStrings } from '../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import { buildPhase1ModulePath } from './nav/phase1NavConfig';
import { buildCollaborateRequirementsPath } from '../../../utils/suitePathUtils';
import { approveRequirementPackWithGate1, formatGate1ApproveError } from '../../requirements/approveRequirementPackWithGate1';
import RequirementHitlJourney from '../../requirements/RequirementHitlJourney';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
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
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [busyStage, setBusyStage] = useState(null);
  const [packStatus, setPackStatus] = useState('');
  const [projectPlanStatus, setProjectPlanStatus] = useState('');
  const [stage1Meta, setStage1Meta] = useState(null);
  const [stage2Meta, setStage2Meta] = useState(null);
  const [loop1Feedback, setLoop1Feedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

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
      setStage2Meta((prev) => ({
        ...(prev || {}),
        done: true,
        pending: false,
        mode: phaseWhat?.mode || 'g4',
        g4RequirementCount: Array.isArray(g4?.requirements) ? g4.requirements.length : 0,
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

  useEffect(() => {
    if (!isAi || !organizationId || !packId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        if (!cancelled) await refresh();
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAi, organizationId, packId, refresh]);

  const runStage1 = async () => {
    if (!canRun || busy || !organizationId || !packId) return;
    setBusy(true);
    setBusyStage(1);
    setErrorMsg('');
    try {
      const res = await requirementAPI.startPhaseAiPlanning(organizationId, packId, {
        phase: 'what',
        mode: 'prepare_only',
      });
      const data = unwrap(res);
      setStage1Meta({
        intakeCorpusChars: Number(data?.intakeCorpusChars) || 0,
        excerptsCount: Number(data?.excerptsCount) || 0,
        skippedCount: Number(data?.skippedCount) || 0,
        missing: data?.readiness?.missing || [],
        prefillApplied: Boolean(data?.readiness?.prefillApplied),
        status: String(data?.status || ''),
      });
      if (data?.status) setPackStatus(String(data.status));
      toast.success(
        t('requirements.phase1Stage1Ok') || 'Đoạn 1: đã chuẩn bị dữ liệu đầu vào.'
      );
      await refresh();
    } catch (error) {
      const msg = resolveApiErrorMessage(error, {
        t,
        fallback: t('requirements.phase1Stage1Fail') || 'Không chuẩn bị được Đoạn 1.',
      });
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      setBusyStage(null);
    }
  };

  const runStage2 = async () => {
    if (!canRun || busy || !organizationId || !packId) return;
    setBusy(true);
    setBusyStage(2);
    setErrorMsg('');
    try {
      const feedback = String(loop1Feedback || '').trim().slice(0, 2000);
      const res = await requirementAPI.startPhaseAiPlanning(organizationId, packId, {
        phase: 'what',
        mode: 'g4',
        force: Boolean(stage2Meta?.done),
        ...(feedback ? { feedback } : {}),
      });
      const data = unwrap(res);
      const acceptedRemote =
        res?.status === 202 ||
        (data?.accepted === true && data?.remote === true) ||
        data?.httpStatus === 202;

      if (acceptedRemote) {
        const deadline = Date.now() + 300_000;
        let ready = false;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 2000));
          const pack = await refresh();
          const phaseWhat = pack?.aiAnalysis?.phaseRuns?.phase_what;
          if (phaseWhat?.status === 'ready') {
            ready = true;
            break;
          }
          if (phaseWhat?.status === 'failed') {
            throw new Error(
              phaseWhat?.error?.message ||
                t('requirements.phase1Stage2Fail') ||
                'G4 Understanding failed'
            );
          }
        }
        if (!ready) {
          throw new Error(
            t('requirements.phase1Stage2Timeout') ||
              'G4 Understanding đang chạy quá lâu — thử làm mới trang.'
          );
        }
        toast.success(
          t('requirements.phase1Stage2G4Ok') ||
            'Đoạn 2: G4 Understanding sẵn sàng — tiếp tục Gate 1.'
        );
      } else {
        setStage2Meta({
          done: true,
          toolsRan: Boolean(data?.toolsRan),
          gateAPassed: Boolean(data?.gateAPassed),
          factsCount: Number(data?.factsCount) || 0,
          proposedDeltaCount: Number(data?.proposedDeltaCount) || 0,
          seededArtifactCount: Number(data?.seededArtifactCount) || 0,
          skippedLlm: Boolean(data?.skippedLlm),
          status: String(data?.status || ''),
        });
        toast.success(
          t('requirements.phase1Stage2Ok') ||
            'Đoạn 2: tools + đề xuất SRS đã đổ vào pack/artifacts.'
        );
      }
      if (data?.status) setPackStatus(String(data.status));
      if (data?.feedbackApplied) setLoop1Feedback('');
      onPipelineDone?.(data);
      await refresh();
      if (projectId) {
        navigate(buildPhase1ModulePath(projectId, 'analysis-fr', { organizationId }));
      }
    } catch (error) {
      const msg = resolveApiErrorMessage(error, {
        t,
        fallback: t('requirements.phase1Stage2Fail') || 'Không chạy được Đoạn 2.',
      });
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      setBusyStage(null);
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
          {t('requirements.understandingPackStatus') || 'Pack'}: {packStatus || '—'}
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

      {!gate1Done ? (
        <div className="mt-3 space-y-2">
          <label className="block text-xs text-muted-foreground">
            {t('requirements.phase1Loop1Label') ||
              'Loop 1 — Feedback khi chạy lại Đoạn 2 (tuỳ chọn)'}
            <textarea
              value={loop1Feedback}
              onChange={(e) => setLoop1Feedback(e.target.value.slice(0, 2000))}
              rows={2}
              disabled={busy}
              placeholder={
                t('requirements.phase1Loop1Placeholder') ||
                'VD: Bổ sung FR đăng nhập MFA; làm rõ actor…'
              }
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground disabled:opacity-40"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canRun || busy}
              onClick={runStage1}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted/50 disabled:opacity-40"
            >
              {busyStage === 1 ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSearch className="h-4 w-4" />
              )}
              {t('requirements.phase1Stage1Cta') || 'Đoạn 1: Chuẩn bị input'}
            </button>
            <button
              type="button"
              disabled={!canRun || busy}
              onClick={runStage2}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {busyStage === 2 ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {stage2Meta?.done
                ? t('requirements.phase1Stage2Rerun') || 'Chạy lại Đoạn 2 (Loop 1)'
                : t('requirements.phase1Stage2Cta') || 'Đoạn 2: Tools + đề xuất SRS'}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-300">
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
        {!gate1Done && packStatus !== 'under_review' ? (
          <button
            type="button"
            disabled={!canSubmit || busy}
            onClick={submitGate1}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted/50 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
            {t('requirements.understandingGate1Cta') || 'Gửi duyệt Gate 1'}
          </button>
        ) : null}
        {!gate1Done && packStatus === 'under_review' ? (
          <button
            type="button"
            disabled={!canApprove || busy}
            onClick={approveGate1}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600/40 px-3 py-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300 disabled:opacity-40"
          >
            <CheckCircle2 className="h-4 w-4" />
            {t('requirements.phase1ApproveCta') || 'Duyệt Gate 1'}
          </button>
        ) : null}
      </div>
    </section>
  );
}
