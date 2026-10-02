import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  HOW_MONITOR_STEPS,
  WHAT_MACRO_STEPS,
  resolveActiveStepIndex,
  resolveAiHitlMonitorPhase,
  stepVisualState,
} from './aiHitlMonitorPhase';
import {
  formatElapsed,
  resolveWhatProgressViewModel,
} from './whatProgressViewModel';

/** Prefer last known macro/substep for same run — blocks post-resume flash to step 1. */
function applyStickyWhatProgress(vm, stickyRef) {
  const runId = String(vm?.runId || '');
  const sticky = stickyRef.current;
  if (!runId || vm?.state === 'idle' || vm?.state === 'failed' || vm?.state === 'cancelled') {
    stickyRef.current = { runId: '', macroStep: 0, substep: null };
    return vm;
  }
  let macroStep = Number(vm.macroStep) || 0;
  let substep = vm.substep || null;
  if (sticky.runId === runId) {
    if (macroStep > 0 && sticky.macroStep > macroStep) {
      macroStep = sticky.macroStep;
      substep = sticky.substep || substep;
    } else if (!macroStep && sticky.macroStep > 0) {
      macroStep = sticky.macroStep;
      substep = sticky.substep || substep;
    } else if (!substep && sticky.substep) {
      substep = sticky.substep;
      if (!macroStep) macroStep = sticky.macroStep;
    }
  }
  if (macroStep > 0) {
    stickyRef.current = { runId, macroStep, substep };
  } else if (sticky.runId !== runId) {
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

function MacroRow({ macros, activeMacro, phaseDone, t }) {
  return (
    <ol className="mt-2 flex flex-wrap gap-1.5" aria-label="Phase WHAT steps">
      {macros.map((item) => {
        const done = phaseDone || (activeMacro > 0 && item.step < activeMacro);
        const isCurrent = !phaseDone && item.step === activeMacro;
        return (
          <li
            key={item.step}
            className={`rounded-full px-2 py-0.5 text-[11px] ${
              isCurrent
                ? 'bg-primary text-primary-foreground'
                : done
                  ? 'bg-emerald-600/15 text-emerald-800 dark:text-emerald-300'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {item.step}. {labelOf(t, item.labelKey, item.fallback)}
          </li>
        );
      })}
    </ol>
  );
}

function SubstepChecklist({ substeps, activeSubstep, phaseDone, t }) {
  if (!substeps?.length) return null;
  const activeIndex = activeSubstep ? substeps.indexOf(activeSubstep) : -1;
  return (
    <ul className="mt-2 space-y-0.5 text-xs" aria-live="polite">
      {substeps.map((id, index) => {
        const state = stepVisualState(index, activeIndex, phaseDone);
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
            {labelOf(t, `requirements.phase1Substep_${id}`, id)}
          </li>
        );
      })}
    </ul>
  );
}

function ActivityLine({ vm, t }) {
  if (!vm.showSpinner && !vm.waitingHuman) return null;
  if (vm.waitingHuman) return null;

  const { activity } = vm;
  let text = labelOf(t, 'requirements.aiHitlMonitorProcessing', 'Đang xử lý…');
  if (activity?.kind === 'call_tool') {
    const tool = activity.toolName || '—';
    text =
      labelOf(t, 'requirements.aiHitlMonitorCallingTool', 'Đang gọi tool: {tool}').replace(
        '{tool}',
        tool
      ) || `Đang gọi tool: ${tool}`;
  } else if (activity?.labelKey) {
    const fallbacks = {
      understand: 'Đang hiểu ngữ cảnh…',
      plan: 'Đang lập kế hoạch…',
      observe: 'Đang quan sát kết quả…',
      evaluate: 'Đang đánh giá…',
    };
    text = labelOf(t, activity.labelKey, fallbacks[activity.kind] || text);
  }

  return (
    <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
      <span>{text}</span>
      <span className="tabular-nums text-muted-foreground">{formatElapsed(vm.elapsedMs)}</span>
    </p>
  );
}

function MetaLine({ label, value }) {
  if (!value) return null;
  return (
    <p className="text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground/80">{label}:</span> {value}
    </p>
  );
}

function StepChecklist({ steps, activeIndex, phaseDone, t }) {
  return (
    <ul className="mt-2 space-y-1 text-xs" aria-live="polite">
      {steps.map((step, index) => {
        const state = stepVisualState(index, activeIndex, phaseDone);
        const className =
          state === 'current'
            ? 'font-medium text-foreground'
            : state === 'done'
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-muted-foreground';
        const mark = state === 'current' ? '● ' : state === 'done' ? '✓ ' : '○ ';
        return (
          <li key={step.id} className={className}>
            {mark}
            {labelOf(t, step.labelKey, step.fallback)}
          </li>
        );
      })}
    </ul>
  );
}

function WhatMonitorBody({ liveRun, phaseWhat, packStatus, pipeline, phaseDone, t }) {
  const [now, setNow] = useState(() => Date.now());
  const stickyRef = useRef({ runId: '', macroStep: 0, substep: null });
  const liveForWhat =
    liveRun ||
    (pipeline?.substep
      ? { pipelineSubstep: pipeline.substep, pipelineStep: pipeline.step }
      : null);

  const inFlight =
    !phaseDone &&
    (['pending', 'running', 'waiting_human', 'queued'].includes(
      String(liveForWhat?.status || phaseWhat?.status || '').toLowerCase()
    ) ||
      Boolean(liveForWhat?.pipelineSubstep));

  useEffect(() => {
    if (!inFlight || phaseDone) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [inFlight, phaseDone]);

  const rawVm = resolveWhatProgressViewModel(
    liveForWhat,
    phaseWhat,
    now,
    undefined,
    packStatus
  );
  const vm = phaseDone ? rawVm : applyStickyWhatProgress(rawVm, stickyRef);
  const activeMacro = phaseDone ? 6 : vm.macroStep > 0 ? vm.macroStep : stickyRef.current.macroStep || 0;

  return (
    <section className="rounded-md border border-border bg-card px-3 py-3">
      <h3 className="text-sm font-semibold text-foreground">
        {labelOf(t, 'requirements.aiHitlMonitorWhatTitle', 'Phase WHAT — Requirement AI')}
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {labelOf(t, vm.descriptionKey, vm.descriptionFallback)}
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
      {vm.showSoftHint && !vm.waitingHuman ? (
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
          {labelOf(t, vm.descriptionKey, vm.descriptionFallback)}
        </p>
      ) : null}
      <MacroRow
        macros={WHAT_MACRO_STEPS}
        activeMacro={activeMacro > 0 ? activeMacro : 1}
        phaseDone={phaseDone}
        t={t}
      />
      {!phaseDone && activeMacro >= 1 && activeMacro <= 4 ? (
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
      {phaseDone ? (
        <SubstepChecklist
          substeps={WHAT_MACRO_STEPS.find((m) => m.step === 4)?.substeps || []}
          activeSubstep="meta_gate"
          phaseDone
          t={t}
        />
      ) : null}
      <div className="mt-3 space-y-0.5 border-t border-border pt-2">
        <MetaLine label="Run" value={String(vm.runId || '')} />
        <MetaLine
          label="Updated"
          value={
            vm.progressUpdatedAt
              ? String(vm.progressUpdatedAt)
              : vm.elapsedMs
                ? formatElapsed(vm.elapsedMs)
                : ''
          }
        />
      </div>
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
  packStatus = '',
  pipeline = null,
  bootstrapping = false,
  t,
}) {
  const phase = resolveAiHitlMonitorPhase({
    packStatus,
    phaseWhat,
    phaseHow,
    liveRun,
  });

  const packNorm = String(packStatus || '').trim().toLowerCase();
  const showHowReady =
    phase === 'what_done' &&
    packNorm === 'approved' &&
    !['pending', 'running', 'waiting_human'].includes(String(phaseHow?.status || '').toLowerCase());

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
      <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
        {labelOf(
          t,
          'requirements.aiHitlMonitorIdle',
          'Chưa chạy AI. Bấm «Chạy AI WHAT» để bắt đầu — Monitor sẽ hiện từng bước WHAT.'
        )}
      </p>
    );
  } else if (phase === 'what') {
    body = (
      <WhatMonitorBody
        liveRun={liveRun}
        phaseWhat={phaseWhat}
        packStatus={packStatus}
        pipeline={pipeline}
        phaseDone={false}
        t={t}
      />
    );
  } else if (showHowReady) {
    body = (
      <section className="rounded-md border border-border bg-card px-3 py-3">
        <h3 className="text-sm font-semibold text-foreground">
          {labelOf(t, 'requirements.aiHitlMonitorHowTitle', 'Phase HOW — Planning AI')}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {labelOf(
            t,
            'requirements.aiHitlMonitorHowReady',
            'Gate 1 xong — mở tab Duyệt / chạy AI Planning (HOW).'
          )}
        </p>
        <StepChecklist steps={HOW_MONITOR_STEPS} activeIndex={-1} phaseDone={false} t={t} />
      </section>
    );
  } else if (phase === 'what_done') {
    body = (
      <WhatMonitorBody
        liveRun={liveRun}
        phaseWhat={phaseWhat}
        packStatus={packStatus}
        pipeline={pipeline}
        phaseDone
        t={t}
      />
    );
  } else if (phase === 'how' || phase === 'how_done') {
    const activeIndex = resolveActiveStepIndex(
      phase === 'how_done' ? 'how_done' : 'how',
      liveRun,
      phaseHow
    );
    const toolName = String(liveRun?.currentTool || '').trim();
    body = (
      <section className="rounded-md border border-border bg-card px-3 py-3">
        <h3 className="text-sm font-semibold text-foreground">
          {labelOf(t, 'requirements.aiHitlMonitorHowTitle', 'Phase HOW — Planning AI')}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {phase === 'how_done'
            ? labelOf(
                t,
                'requirements.aiHitlMonitorHowDone',
                'HOW xong — mở tab Duyệt để xác nhận Gate 2 & kích hoạt.'
              )
            : labelOf(
                t,
                'requirements.aiHitlMonitorHowHint',
                'Đang chạy agent + tools. Chỉ hiện phase HOW.'
              )}
        </p>
        {phase === 'how' && toolName ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
            {labelOf(t, 'requirements.aiHitlMonitorCallingTool', 'Đang gọi tool: {tool}').replace(
              '{tool}',
              toolName
            )}
          </p>
        ) : null}
        <StepChecklist
          steps={HOW_MONITOR_STEPS}
          activeIndex={activeIndex}
          phaseDone={phase === 'how_done'}
          t={t}
        />
        <div className="mt-3 space-y-0.5 border-t border-border pt-2">
          <MetaLine label="Run" value={String(liveRun?.runId || phaseHow?.remoteRunId || '')} />
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          {labelOf(t, 'requirements.aiHitlMonitorTitle', 'Theo dõi LangGraph / AI run')}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {labelOf(
            t,
            'requirements.aiHitlMonitorHint',
            'Hiển thị đúng phase đang chạy (WHAT hoặc HOW) với từng bước AI.'
          )}
        </p>
      </div>
      {body}
    </div>
  );
}
