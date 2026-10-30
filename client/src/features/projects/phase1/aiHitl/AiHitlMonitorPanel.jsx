import { useEffect, useRef, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import {
  HOW_MACRO_STEPS,
  WHAT_MACRO_STEPS,
  resolveAiHitlMonitorPhase,
  resolveMonitorResultsKind,
  stepVisualState,
} from './aiHitlMonitorPhase';
import {
  formatElapsed,
  resolveWhatProgressViewModel,
} from './whatProgressViewModel';

function formatClock(ms) {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '';
  try {
    return new Date(ms).toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return '';
  }
}
import { resolveHowProgressViewModel } from './howProgressViewModel';
import HowMonitorResultsPanel from './HowMonitorResultsPanel';
import { shouldShowHowMonitorResults } from './howMonitorResultsVisibility';
import WhatMonitorResultsPanel from './WhatMonitorResultsPanel';
import { shouldShowWhatMonitorResults } from './whatMonitorResultsVisibility';
import { isWaitingFrConfirm } from './frCheckpointState';
import { formatMonitorLayerActivity } from './monitorActivityLabels';
import { isHowRunWallTimedOut } from './WHAT_MONITOR_CONFIG';

/**
 * Prefer last known mid-run macro/substep for same run (fills brief gaps after resume).
 * Do NOT clamp upward (blocks re-run progress) and do NOT sticky Gate1/Approved (5+).
 */
function applyStickyWhatProgress(vm, stickyRef) {
  const runId = String(vm?.runId || '');
  const sticky = stickyRef.current;
  const state = String(vm?.state || '');
  if (!runId || state === 'idle' || state === 'failed' || state === 'cancelled') {
    stickyRef.current = { runId: '', macroStep: 0, substep: null };
    return vm;
  }
  let macroStep = Number(vm.macroStep) || 0;
  let substep = vm.substep || null;
  const inFlight = state === 'running' || state === 'queued';

  // Re-run / restart: drop sticky Gate1+ so Monitor can restart from early steps
  if (inFlight && sticky.runId === runId && sticky.macroStep >= 5) {
    stickyRef.current = { runId, macroStep: macroStep || 0, substep: substep || null };
  } else if (sticky.runId === runId) {
    // Gap-fill only (missing progress) within steps 1–4 — never force higher than live
    if (!macroStep && sticky.macroStep > 0 && sticky.macroStep < 5) {
      macroStep = sticky.macroStep;
      substep = sticky.substep || substep;
    } else if (!substep && sticky.substep && sticky.macroStep > 0 && sticky.macroStep < 5) {
      substep = sticky.substep;
      if (!macroStep) macroStep = sticky.macroStep;
    }
  }

  if (macroStep > 0 && macroStep < 5) {
    stickyRef.current = { runId, macroStep, substep };
  } else if (sticky.runId !== runId) {
    stickyRef.current = { runId, macroStep: 0, substep: null };
  } else if (macroStep >= 5 || (!macroStep && inFlight)) {
    // At Gate1+ or fresh in-flight without step: keep sticky empty / non-blocking
    stickyRef.current = { runId, macroStep: 0, substep: null };
  }

  if (macroStep === vm.macroStep && substep === vm.substep) return vm;
  const macroDef = WHAT_MACRO_STEPS.find((m) => m.step === macroStep) || null;
  return {
    ...vm,
    macroStep,
    substep,
    activeMacroSubsteps: macroDef ? [...macroDef.substeps] : vm.activeMacroSubsteps,
  };
}

function labelOf(t, key, fallback) {
  const value = typeof t === 'function' ? t(key) : '';
  return value || fallback;
}

function MacroRow({ macros, activeMacro, srsApproved, t }) {
  return (
    <ol
      className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:flex lg:flex-wrap"
      aria-label="Phase steps"
    >
      {macros.map((item) => {
        // Step 6 (Approved SRS) only green after PO approve — not when WHAT AI merely finished
        const done =
          srsApproved || (activeMacro > 0 && item.step < activeMacro);
        const isCurrent = !srsApproved && item.step === activeMacro;
        return (
          <li
            key={item.step}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] leading-snug sm:text-xs ${
              isCurrent
                ? 'bg-primary font-medium text-primary-foreground shadow-sm'
                : done
                  ? 'bg-emerald-600/15 text-emerald-800 dark:text-emerald-300'
                  : 'bg-muted/80 text-muted-foreground'
            }`}
          >
            <span className="opacity-70">{item.step}.</span>{' '}
            {labelOf(t, item.labelKey, item.fallback)}
          </li>
        );
      })}
    </ol>
  );
}

function RunTimingFooter({ elapsedMs, startedAt, completedAt, inFlight, t }) {
  const elapsed = elapsedMs > 0 ? formatElapsed(elapsedMs) : '';
  const startedLabel = formatClock(startedAt);
  const endedLabel = !inFlight ? formatClock(completedAt) : '';
  if (!elapsed && !startedLabel) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/70 pt-2.5 text-xs text-muted-foreground">
      {elapsed ? (
        <p>
          <span className="font-medium text-foreground/80">
            {labelOf(t, 'requirements.aiHitlMonitorElapsed', 'Thời gian chạy')}:
          </span>{' '}
          <span className="tabular-nums text-foreground">{elapsed}</span>
          {inFlight ? (
            <span className="ml-1 text-[10px] uppercase tracking-wide text-primary">
              {labelOf(t, 'requirements.aiHitlMonitorElapsedLive', 'đang chạy')}
            </span>
          ) : null}
        </p>
      ) : null}
      {startedLabel ? (
        <p>
          <span className="font-medium text-foreground/80">
            {labelOf(t, 'requirements.aiHitlMonitorStartedAt', 'Bắt đầu')}:
          </span>{' '}
          <span className="tabular-nums">{startedLabel}</span>
        </p>
      ) : null}
      {endedLabel ? (
        <p>
          <span className="font-medium text-foreground/80">
            {labelOf(t, 'requirements.aiHitlMonitorEndedAt', 'Kết thúc')}:
          </span>{' '}
          <span className="tabular-nums">{endedLabel}</span>
        </p>
      ) : null}
    </div>
  );
}

function SubstepChecklist({
  substeps,
  activeSubstep,
  activeSubsteps = null,
  phaseDone,
  t,
  labelKeyPrefix = 'requirements.phase1Substep_',
}) {
  if (!substeps?.length) return null;
  const activeIndex = activeSubstep ? substeps.indexOf(activeSubstep) : -1;
  const activeIndices = Array.isArray(activeSubsteps)
    ? activeSubsteps
        .map((id) => substeps.indexOf(id))
        .filter((i) => i >= 0)
    : null;
  return (
    <ul className="mt-2 space-y-0.5 text-xs" aria-live="polite">
      {substeps.map((id, index) => {
        const state = stepVisualState(index, activeIndex, phaseDone, activeIndices);
        const className =
          state === 'current'
            ? 'font-medium text-foreground'
            : state === 'done'
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-muted-foreground';
        const mark = state === 'current' ? '● ' : state === 'done' ? '✓ ' : '○ ';
        return (
          <li key={id} className={className}>
            {mark}
            {labelOf(t, `${labelKeyPrefix}${id}`, id)}
          </li>
        );
      })}
    </ul>
  );
}

function HowLayerChecklist({ layers, t }) {
  if (!layers?.length) return null;
  return (
    <ol className="mt-2 space-y-1.5" aria-live="polite">
      {layers.map((layer) => (
        <li
          key={layer.index}
          className={`rounded-md px-2 py-1 ${
            layer.state === 'current' ? 'bg-primary/10' : ''
          }`}
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {labelOf(t, 'requirements.aiHitlHowLayer', 'Lớp {n}').replace(
              '{n}',
              String(layer.index)
            )}
          </p>
          <ul className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            {layer.toolIds.map((id) => {
              const toolMeta = (layer.tools || []).find((row) => row.id === id);
              const toolStatus = String(toolMeta?.status || '');
              const running =
                toolStatus === 'running' ||
                (layer.state === 'current' && layer.activeToolIds.includes(id));
              const blocked = toolStatus === 'blocked';
              const failed = toolStatus === 'failed';
              const done =
                toolStatus === 'succeeded' ||
                (!blocked && !failed && !running && layer.state === 'done');
              const className = blocked
                ? 'font-medium text-amber-800 dark:text-amber-200'
                : failed
                  ? 'font-medium text-destructive'
                  : running
                    ? 'font-medium text-foreground'
                    : done
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-muted-foreground';
              const mark = blocked ? '⚠ ' : failed ? '✗ ' : running ? '● ' : done ? '✓ ' : '○ ';
              const blockedHint = blocked
                ? toolMeta?.blockedBy?.length
                  ? ` — ${labelOf(t, 'requirements.aiHitlMonitorToolBlockedBy', 'chặn bởi: {reasons}').replace(
                      '{reasons}',
                      toolMeta.blockedBy.join(', ')
                    )}`
                  : toolMeta?.errorMessage
                    ? ` — ${toolMeta.errorMessage}`
                    : ` — ${labelOf(t, 'requirements.aiHitlMonitorToolBlocked', 'bị chặn')}`
                : '';
              return (
                <li key={id} className={className} title={toolMeta?.errorMessage || undefined}>
                  {mark}
                  {labelOf(t, `requirements.aiHitlHowStep_${id}`, id)}
                  {blockedHint}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function ActivityLine({ vm, t }) {
  if (!vm.showSpinner && !vm.waitingHuman) return null;
  if (vm.waitingHuman) return null;

  const { activity } = vm;
  let text = labelOf(t, 'requirements.aiHitlMonitorProcessing', 'Đang xử lý…');
  if (activity?.kind === 'call_tool') {
    const names = activity.toolNames?.length ? activity.toolNames : [activity.toolName];
    text = formatMonitorLayerActivity(names, t);
  } else if (activity?.labelKey) {
    const fallbacks = {
      understand: 'Đang chuẩn bị ngữ cảnh HOW…',
      plan: 'Đang chọn tools planning…',
      observe: 'Đang tổng hợp kết quả…',
      evaluate: 'Đang đánh giá…',
    };
    text = labelOf(t, activity.labelKey, fallbacks[activity.kind] || text);
  }

  return (
    <p
      className="mt-2 flex items-center gap-1.5 text-xs font-medium text-foreground"
      aria-live="polite"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
      <span>{text}</span>
    </p>
  );
}

function ProgressStaleLine({ show, t }) {
  if (!show) return null;
  return (
    <p
      className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-900 dark:text-amber-100"
      role="status"
    >
      {labelOf(
        t,
        'requirements.aiHitlMonitorProgressStale',
        'Tiến trình chưa cập nhật gần đây — có thể đang chờ backend. Giữ tab Monitor; thử chạy lại nếu quá lâu.'
      )}
    </p>
  );
}

function RunTerminalBanner({ state, errorMessage, actionSlot = null, t }) {
  const isFailed = state === 'failed' || state === 'error';
  const isCancelled = state === 'cancelled';
  const isIncomplete = state === 'incomplete';
  if (!isFailed && !isCancelled && !isIncomplete) return null;

  const toneClass = isIncomplete
    ? 'border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100'
    : 'border-destructive/40 bg-destructive/10 text-destructive';
  const bodyClass = isIncomplete ? 'text-amber-900/90 dark:text-amber-100/90' : 'text-destructive/90';

  return (
    <div className={`mt-3 rounded-md border px-3 py-2 text-xs ${toneClass}`} role="alert">
      <p className="font-semibold text-sm">
        {isCancelled
          ? labelOf(t, 'requirements.aiHitlMonitorRunCancelled', 'Chạy AI đã bị hủy')
          : isIncomplete
            ? labelOf(t, 'requirements.aiHitlMonitorRunIncomplete', 'HOW chưa hoàn tất')
            : labelOf(t, 'requirements.aiHitlMonitorRunFailed', 'Chạy AI thất bại')}
      </p>
      {errorMessage ? (
        <p className={`mt-1 break-words ${bodyClass}`}>{errorMessage}</p>
      ) : (
        <p className={`mt-1 ${isIncomplete ? 'opacity-80' : 'text-destructive/80'}`}>
          {labelOf(
            t,
            isIncomplete
              ? 'requirements.aiHitlMonitorHowIncompleteHint'
              : 'requirements.aiHitlMonitorRunFailedHint',
            isIncomplete
              ? 'HOW dừng chưa hoàn tất. Xem kết quả partial bên dưới; chạy lại HOW nếu cần bổ sung.'
              : 'Xem lại dữ liệu đầu vào hoặc bấm chạy lại khi sẵn sàng.'
          )}
        </p>
      )}
      {actionSlot}
    </div>
  );
}

function WhatMonitorBody({
  liveRun,
  phaseWhat,
  packStatus,
  pipeline,
  phaseDone,
  hasProposeOutput = false,
  rerunWhatButton = null,
  t,
}) {
  const [now, setNow] = useState(() => Date.now());
  const stickyRef = useRef({ runId: '', macroStep: 0, substep: null });
  const packNorm = String(packStatus || '')
    .trim()
    .toLowerCase();
  const srsApproved = packNorm === 'approved' || packNorm === 'project_linked';
  const liveForWhat =
    liveRun ||
    (pipeline?.substep
      ? { pipelineSubstep: pipeline.substep, pipelineStep: pipeline.step }
      : null);

  const rawVm = resolveWhatProgressViewModel(
    liveForWhat,
    phaseWhat,
    now,
    undefined,
    packStatus,
    hasProposeOutput
  );
  const vm = phaseDone ? rawVm : applyStickyWhatProgress(rawVm, stickyRef);
  // Live badge + 1s tick while agent computes — do not stop for leftover propose rows.
  const clockLive = !phaseDone && (vm.state === 'running' || vm.state === 'queued');
  const runBusy =
    !phaseDone &&
    (clockLive ||
      hasProposeOutput ||
      vm.state === 'finalizing' ||
      vm.state === 'waiting_human');

  useEffect(() => {
    if (!clockLive) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [clockLive]);
  // WHAT AI done → step 5 (Gate 1). Step 6 only after pack approved.
  const activeMacro = srsApproved
    ? 6
    : phaseDone
      ? 5
      : vm.macroStep > 0
        ? vm.macroStep
        : stickyRef.current.macroStep || 0;

  const descTone =
    vm.showSoftHint && !vm.waitingHuman && !phaseDone && !srsApproved
      ? 'text-amber-800 dark:text-amber-200'
      : 'text-muted-foreground';

  return (
    <section className="rounded-xl border border-border/80 bg-card/95 px-3 py-3 shadow-sm sm:px-4 sm:py-4">
      <h3 className="text-sm font-semibold text-foreground sm:text-base">
        {labelOf(t, 'requirements.aiHitlMonitorWhatTitle', 'Phase WHAT — Requirement AI')}
      </h3>
      <p className={`mt-1 text-xs sm:text-sm ${descTone}`}>
        {labelOf(
          t,
          srsApproved
            ? 'requirements.aiHitlMonitorMacroDesc6'
            : phaseDone
              ? 'requirements.aiHitlMonitorMacroDesc5'
              : vm.descriptionKey,
          srsApproved
            ? 'SRS đã được duyệt.'
            : phaseDone
              ? 'Chờ duyệt Gate 1 (BA → PO).'
              : vm.descriptionFallback
        )}
      </p>
      {vm.waitingHuman ? (
        <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-900 dark:text-amber-100">
          {labelOf(
            t,
            'requirements.aiHitlMonitorDataGateHint',
            'AI đang chờ Data Gate — chuyển tab Duyệt để Pass/Reject.'
          )}
        </p>
      ) : null}
      <ProgressStaleLine show={Boolean(vm.showProgressStale)} t={t} />
      <RunTerminalBanner
        state={vm.state}
        errorMessage={vm.errorMessage}
        actionSlot={
          vm.state === 'failed' || vm.state === 'cancelled' || vm.state === 'error'
            ? rerunWhatButton
            : null
        }
        t={t}
      />
      <MacroRow
        macros={WHAT_MACRO_STEPS}
        activeMacro={activeMacro > 0 ? activeMacro : 1}
        srsApproved={srsApproved}
        t={t}
      />
      {!phaseDone &&
      vm.state !== 'failed' &&
      vm.state !== 'cancelled' &&
      vm.state !== 'error' &&
      activeMacro >= 1 &&
      activeMacro <= 4 ? (
        <div className="mt-2">
          <p className="text-[11px] font-medium text-foreground/80">
            {labelOf(t, vm.titleKey, vm.titleFallback)}
          </p>
          <SubstepChecklist
            substeps={vm.activeMacroSubsteps}
            activeSubstep={vm.substep}
            phaseDone={false}
            t={t}
          />
          <ActivityLine vm={vm} t={t} />
        </div>
      ) : null}
      {phaseDone && !srsApproved ? (
        <SubstepChecklist
          substeps={WHAT_MACRO_STEPS.find((m) => m.step === 4)?.substeps || []}
          activeSubstep="meta_gate"
          phaseDone
          t={t}
        />
      ) : null}
      {/* Same placement as HOW: action above timing footer — PO revise only */}
      {phaseDone &&
      !srsApproved &&
      !runBusy &&
      vm.state !== 'failed' &&
      vm.state !== 'cancelled' &&
      vm.state !== 'error'
        ? rerunWhatButton
        : null}
      <RunTimingFooter
        elapsedMs={vm.elapsedMs}
        startedAt={vm.startedAt}
        completedAt={vm.completedAt}
        inFlight={clockLive}
        t={t}
      />
    </section>
  );
}

/**
 * LangGraph / APS run monitor — one phase checklist at a time (RULE-M01).
 * WHAT: 3-layer UX (macro → substep → activity/tool).
 * HOW: 3-layer UX (macro → tool/node → activity + elapsed).
 */
function HowMonitorBody({
  liveRun,
  phaseHow,
  phaseDone,
  howNotStarted,
  hasProposeOutput = false,
  startHowButton,
  rerunHowButton,
  t,
}) {
  const [now, setNow] = useState(() => Date.now());
  const vm = resolveHowProgressViewModel(liveRun, phaseHow, now, hasProposeOutput);
  // Live badge + 1s tick while agent/tools compute — Gate1 rollup ≠ end of run.
  const clockLive =
    !phaseDone && !howNotStarted && (vm.state === 'running' || vm.state === 'queued');
  const runBusy =
    !phaseDone &&
    !howNotStarted &&
    (clockLive ||
      hasProposeOutput ||
      vm.state === 'finalizing' ||
      vm.state === 'waiting_human');

  useEffect(() => {
    if (!clockLive) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [clockLive]);
  const howFailed = vm.state === 'failed' || vm.state === 'cancelled' || vm.state === 'error';
  const howIncomplete = vm.state === 'incomplete';
  const howTerminalStopped = howFailed || howIncomplete;
  const activeMacro = phaseDone
    ? 3
    : howNotStarted || howTerminalStopped
      ? 0
      : vm.macroStep || 1;

  return (
    <section className="rounded-xl border border-border/80 bg-card/95 px-3 py-3 shadow-sm sm:px-4 sm:py-4">
      <h3 className="text-sm font-semibold text-foreground sm:text-base">
        {labelOf(t, 'requirements.aiHitlMonitorHowTitle', 'Phase HOW — Planning AI')}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
        {phaseDone
          ? labelOf(
              t,
              'requirements.aiHitlMonitorHowDone',
              'HOW xong — mở tab Duyệt để xác nhận Gate 2 & kích hoạt.'
            )
          : howNotStarted
            ? labelOf(
                t,
                'requirements.aiHitlMonitorHowReady',
                'Gate 1 xong — chạy AI Planning (HOW) tại đây.'
              )
            : howIncomplete
              ? labelOf(
                  t,
                  'requirements.aiHitlMonitorHowIncompleteHint',
                  'HOW dừng chưa hoàn tất. Xem kết quả partial bên dưới; chạy lại HOW nếu cần bổ sung.'
                )
              : howFailed
                ? labelOf(
                    t,
                    'requirements.aiHitlMonitorHowFailedHint',
                    'Phiên HOW đã dừng. Bấm Chạy lại HOW để thử lại.'
                  )
                : labelOf(t, vm.descriptionKey, vm.descriptionFallback)}
      </p>
      <ProgressStaleLine show={Boolean(vm.showProgressStale)} t={t} />
      <RunTerminalBanner
        state={vm.state}
        errorMessage={vm.errorMessage}
        actionSlot={
          howTerminalStopped ? rerunHowButton : null
        }
        t={t}
      />
      <MacroRow
        macros={HOW_MACRO_STEPS}
        activeMacro={activeMacro}
        srsApproved={phaseDone}
        t={t}
      />
      {!phaseDone &&
      !howNotStarted &&
      !howTerminalStopped &&
      activeMacro >= 1 &&
      activeMacro <= 3 ? (
        <div className="mt-2">
          <p className="text-[11px] font-medium text-foreground/80">
            {labelOf(t, vm.titleKey, vm.titleFallback)}
          </p>
          {vm.showPlanningLayers ? (
            <HowLayerChecklist layers={vm.planningLayers} t={t} />
          ) : (
            <SubstepChecklist
              substeps={vm.activeMacroSubsteps}
              activeSubstep={vm.activeStepId}
              activeSubsteps={vm.activeStepIds}
              phaseDone={false}
              t={t}
              labelKeyPrefix="requirements.aiHitlHowStep_"
            />
          )}
          <ActivityLine vm={vm} t={t} />
        </div>
      ) : null}
      {howIncomplete && !phaseDone && !howNotStarted ? (
        <div className="mt-2">
          <HowLayerChecklist layers={vm.planningLayers} t={t} />
        </div>
      ) : null}
      {phaseDone ? (
        <>
          <HowLayerChecklist layers={vm.planningLayers} t={t} />
          <SubstepChecklist
            substeps={HOW_MACRO_STEPS.find((m) => m.step === 3)?.substeps || []}
            activeSubstep="feasibility"
            phaseDone
            t={t}
            labelKeyPrefix="requirements.aiHitlHowStep_"
          />
        </>
      ) : null}
      {howNotStarted ? startHowButton : null}
      {/* Terminal stop: nút nằm trong RunTerminalBanner (actionSlot) — tránh nhân đôi. */}
      {phaseDone ||
      (!howNotStarted && !runBusy && !howTerminalStopped)
        ? rerunHowButton
        : null}
      <RunTimingFooter
        elapsedMs={vm.elapsedMs}
        startedAt={vm.startedAt}
        completedAt={vm.completedAt}
        inFlight={clockLive}
        t={t}
      />
    </section>
  );
}

/**
 * LangGraph / APS run monitor — one phase checklist at a time (RULE-M01).
 * WHAT: 3-layer UX (macro → substep → activity/tool).
 */
export default function AiHitlMonitorPanel({
  liveRun = null,
  phaseWhat = null,
  phaseHow = null,
  pack = null,
  packStatus = '',
  pipeline = null,
  bootstrapping = false,
  /** 'what' | 'how' | null — re-run start window; force progress UI + hide stale tables. */
  awaitingFreshRun = null,
  canStartWhat = false,
  canRerunWhat = false,
  canRunHow = false,
  canRerunHow = false,
  whatStartBusy = false,
  howStartBusy = false,
  onStartWhat = null,
  onRerunWhat = null,
  onStartHow = null,
  onRerunHow = null,
  organizationId = null,
  packId = null,
  onRefresh = null,
  onOpenGate2 = null,
  canConfirmWbs = true,
  canApprovePlan = false,
  t,
}) {
  let phase = resolveAiHitlMonitorPhase({
    packStatus,
    phaseWhat,
    phaseHow,
    liveRun,
  });
  // Re-run / start loading: show in-progress checklist, not prior *_done + old tables.
  if (awaitingFreshRun === 'what') phase = 'what';
  else if (awaitingFreshRun === 'how') phase = 'how';

  const packNorm = String(packStatus || '').trim().toLowerCase();
  const howStatus = String(phaseHow?.status || '').trim().toLowerCase();
  const whatStatus = String(phaseWhat?.status || '').trim().toLowerCase();
  const liveStatus = String(liveRun?.status || '').trim().toLowerCase();
  const howNotStarted =
    packNorm === 'approved' &&
    ![
      'pending',
      'running',
      'queued',
      'waiting_human',
      'waiting_external',
      'ready',
      'completed',
      'confirmed',
      'failed',
      'error',
      'stopped',
      'incomplete',
      'cancelled',
    ].includes(howStatus);
  const showHowReady =
    phase === 'what_done' &&
    packNorm === 'approved' &&
    howNotStarted;
  const howStatusInFlight = ['pending', 'running', 'queued', 'waiting_human'].includes(
    howStatus
  );
  const howWallStale = isHowRunWallTimedOut(liveRun, phaseHow);
  // Zombie BE "running" past wall → not in-flight for disable / poll UX.
  const howInFlight = howStatusInFlight && !howWallStale;
  const startBusy = Boolean(whatStartBusy || howStartBusy);
  const whatPhaseReady = ['ready', 'completed', 'confirmed'].includes(whatStatus);
  const howPhaseReady = ['ready', 'completed', 'confirmed'].includes(howStatus);
  // Hide results only while the active phase is truly in-flight. Sticky liveRun
  // (waiting_human / running) after phase_* already ready must not blank Monitor
  // while Duyệt already shows the first AI baseline from srsProposal / planning.
  const monitorInFlight =
    Boolean(awaitingFreshRun) ||
    startBusy ||
    (!whatPhaseReady &&
      ['pending', 'running', 'queued', 'waiting_human'].includes(whatStatus)) ||
    howInFlight ||
    (!whatPhaseReady &&
      !howPhaseReady &&
      ['pending', 'running', 'queued', 'waiting_human'].includes(liveStatus) &&
      !howWallStale);

  const startWhatButton =
    canStartWhat && typeof onStartWhat === 'function' ? (
      <button
        type="button"
        disabled={whatStartBusy}
        onClick={onStartWhat}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
      >
        {whatStartBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Play className="h-4 w-4" aria-hidden />
        )}
        {labelOf(t, 'requirements.aiHitlStartWhat', 'Chạy AI WHAT')}
      </button>
    ) : null;

  const rerunWhatButton =
    canRerunWhat && typeof onRerunWhat === 'function' ? (
      <button
        type="button"
        disabled={whatStartBusy}
        onClick={onRerunWhat}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-40"
        title={labelOf(
          t,
          'requirements.aiHitlReviseUnderReviewHint',
          'Chạy lại AI — reset duyệt BA→PO, BA phải xác nhận lại'
        )}
      >
        {whatStartBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Play className="h-4 w-4" aria-hidden />
        )}
        {labelOf(t, 'requirements.aiHitlRevise', 'AI revise / chạy lại')}
      </button>
    ) : null;

  const startHowButton =
    howNotStarted && typeof onStartHow === 'function' ? (
      <button
        type="button"
        disabled={!canRunHow || howStartBusy}
        onClick={onStartHow}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
      >
        {howStartBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Play className="h-4 w-4" aria-hidden />
        )}
        {labelOf(t, 'requirements.aiPlanningStart', 'Chạy AI Planning')}
      </button>
    ) : null;

  const showRerunHow =
    typeof onRerunHow === 'function' &&
    !howNotStarted &&
    (canRerunHow || (howWallStale && canRunHow));
  const rerunHowButton = showRerunHow ? (
      <button
        type="button"
        disabled={howStartBusy || howInFlight}
        onClick={onRerunHow}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-40"
        title={labelOf(
          t,
          'requirements.aiHitlRerunHowHint',
          'Chạy lại Phase HOW (WBS…Schedule) — Gate 2 reset về PM'
        )}
      >
        {howStartBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Play className="h-4 w-4" aria-hidden />
        )}
        {labelOf(t, 'requirements.aiHitlRerunHow', 'Chạy lại HOW')}
      </button>
    ) : null;

  let body = null;

  if (phase === 'idle' && bootstrapping) {
    body = (
      <section className="rounded-md border border-border bg-card px-3 py-4">
        <p className="flex items-center gap-2 text-sm text-foreground">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
          {labelOf(
            t,
            'requirements.aiHitlMonitorBootstrapping',
            'Đang khởi động AI WHAT sau khi tạo dự án nháp…'
          )}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {labelOf(
            t,
            'requirements.aiHitlMonitorBootstrappingHint',
            'Chuẩn bị dữ liệu đầu vào rồi chạy phân tích — Monitor sẽ cập nhật từng bước.'
          )}
        </p>
      </section>
    );
  } else if (phase === 'idle') {
    body = (
      <section className="rounded-md border border-dashed border-border bg-card px-3 py-4">
        <p className="text-sm text-muted-foreground">
          {labelOf(
            t,
            'requirements.aiHitlMonitorIdle',
            'Chưa chạy AI. Bấm «Chạy AI WHAT» để bắt đầu — Monitor sẽ hiện từng bước WHAT.'
          )}
        </p>
        {startWhatButton}
      </section>
    );
  } else if (phase === 'what') {
    body = (
      <WhatMonitorBody
        liveRun={liveRun}
        phaseWhat={phaseWhat}
        packStatus={packStatus}
        pipeline={pipeline}
        phaseDone={false}
        hasProposeOutput={!awaitingFreshRun && shouldShowWhatMonitorResults(pack)}
        rerunWhatButton={rerunWhatButton}
        t={t}
      />
    );
  } else if (showHowReady) {
    body = (
      <HowMonitorBody
        liveRun={liveRun}
        phaseHow={phaseHow}
        phaseDone={false}
        howNotStarted
        hasProposeOutput={false}
        startHowButton={startHowButton}
        rerunHowButton={rerunHowButton}
        t={t}
      />
    );
  } else if (phase === 'what_done') {
    body = (
      <WhatMonitorBody
        liveRun={liveRun}
        phaseWhat={phaseWhat}
        packStatus={packStatus}
        pipeline={pipeline}
        phaseDone
        hasProposeOutput={!awaitingFreshRun && shouldShowWhatMonitorResults(pack)}
        rerunWhatButton={rerunWhatButton}
        t={t}
      />
    );
  } else if (phase === 'how' || phase === 'how_done') {
    body = (
      <HowMonitorBody
        liveRun={liveRun}
        phaseHow={phaseHow}
        phaseDone={phase === 'how_done'}
        howNotStarted={phase === 'how' && howNotStarted}
        hasProposeOutput={
          !awaitingFreshRun && phase === 'how'
            ? shouldShowHowMonitorResults(pack)
            : phase === 'how_done'
        }
        startHowButton={startHowButton}
        rerunHowButton={rerunHowButton}
        t={t}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:gap-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground sm:text-base">
          {labelOf(t, 'requirements.aiHitlMonitorTitle', 'Theo dõi tiến trình AI')}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          {labelOf(
            t,
            'requirements.aiHitlMonitorHint',
            'Theo dõi từng bước WHAT / HOW. Kết quả phân tích ở bên dưới — duyệt quyết định ở tab Duyệt.'
          )}
        </p>
      </div>
      {body}
      {((!monitorInFlight &&
        resolveMonitorResultsKind(phase, showHowReady) === 'what' &&
        shouldShowWhatMonitorResults(pack)) ||
        (resolveMonitorResultsKind(phase, showHowReady) === 'what' &&
          isWaitingFrConfirm(pack))) ? (
        <WhatMonitorResultsPanel
          pack={pack}
          t={t}
          organizationId={organizationId}
          packId={packId}
          onRefresh={onRefresh}
          canConfirmFr={canConfirmWbs}
        />
      ) : null}
      {!monitorInFlight &&
      resolveMonitorResultsKind(phase, showHowReady) === 'how' &&
      shouldShowHowMonitorResults(pack) ? (
        <HowMonitorResultsPanel
          pack={pack}
          t={t}
          organizationId={organizationId}
          packId={packId}
          onRefresh={onRefresh}
          onOpenGate2={onOpenGate2}
          canConfirmWbs={canConfirmWbs}
          canApprovePlan={canApprovePlan}
        />
      ) : null}
    </div>
  );
}
