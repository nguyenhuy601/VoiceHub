import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveWhatProgressViewModel,
  resetWhatProgressFallbackTotalForTests,
  WHAT_MACRO_STEPS,
} from './whatProgressViewModel.js';
import { resolveActiveStepIndex, WHAT_MONITOR_STEPS } from './aiHitlMonitorPhase.js';

describe('resolveWhatProgressViewModel', () => {
  beforeEach(() => {
    resetWhatProgressFallbackTotalForTests();
  });

  it('T7 pipelineSubstep=parse → index parse / macro 2', () => {
    const vm = resolveWhatProgressViewModel(
      { status: 'running', pipelineStep: 2, pipelineSubstep: 'parse', startedAt: Date.now() },
      { status: 'pending' },
      Date.now()
    );
    assert.equal(vm.substep, 'parse');
    assert.equal(vm.macroStep, 2);
    assert.deepEqual(vm.activeMacroSubsteps, WHAT_MACRO_STEPS[1].substeps);
    const idx = resolveActiveStepIndex(
      'what',
      { pipelineSubstep: 'parse' },
      { status: 'pending' }
    );
    assert.equal(WHAT_MONITOR_STEPS[idx].id, 'parse');
  });

  it('T8 missing substep + legacy node prepare → fallback prepare', () => {
    const vm = resolveWhatProgressViewModel(
      { status: 'running', currentNode: 'prepare', startedAt: Date.now() },
      { status: 'pending' },
      Date.now()
    );
    assert.equal(vm.substep, 'prepare');
    assert.equal(vm.usedLegacyFallback, true);
  });

  it('T8b running without substep → no invented prepare / macro 0', () => {
    const vm = resolveWhatProgressViewModel(
      { status: 'running', currentNode: 'execute', startedAt: Date.now() },
      { status: 'pending' },
      Date.now()
    );
    assert.equal(vm.substep, null);
    assert.equal(vm.macroStep, 0);
    assert.equal(vm.usedLegacyFallback, true);
  });

  it('T9 explicit substep wins over node', () => {
    const vm = resolveWhatProgressViewModel(
      {
        status: 'running',
        pipelineSubstep: 'parse',
        pipelineStep: 2,
        currentNode: 'execute',
        currentTool: 'RequirementAnalysisTool',
        startedAt: Date.now(),
      },
      { status: 'pending' },
      Date.now()
    );
    assert.equal(vm.substep, 'parse');
    assert.equal(vm.activity.kind, 'call_tool');
    assert.equal(vm.activity.toolName, 'RequirementAnalysisTool');
  });

  it('T10 prepare + elapsed 11999 → showSoftHint false', () => {
    const started = 1_000_000;
    const vm = resolveWhatProgressViewModel(
      {
        status: 'running',
        pipelineSubstep: 'prepare',
        pipelineStep: 1,
        startedAt: new Date(started).toISOString(),
      },
      { status: 'pending' },
      started + 11_999,
      { softHintMs: 12_000, softHintLongMs: 20_000 }
    );
    assert.equal(vm.showSoftHint, false);
  });

  it('T11 prepare + elapsed 12000 → showSoftHint true', () => {
    const started = 1_000_000;
    const vm = resolveWhatProgressViewModel(
      {
        status: 'running',
        pipelineSubstep: 'prepare',
        pipelineStep: 1,
        startedAt: new Date(started).toISOString(),
      },
      { status: 'pending' },
      started + 12_000,
      { softHintMs: 12_000, softHintLongMs: 20_000 }
    );
    assert.equal(vm.showSoftHint, true);
  });

  it('T12 waiting_human → no spinner', () => {
    const vm = resolveWhatProgressViewModel(
      {
        status: 'waiting_human',
        gate: 'data_review',
        pipelineSubstep: 'gate_preview',
        pipelineStep: 2,
        startedAt: Date.now(),
      },
      { status: 'pending' },
      Date.now()
    );
    assert.equal(vm.waitingHuman, true);
    assert.equal(vm.showSpinner, false);
    assert.equal(vm.state, 'waiting_human');
  });

  it('call_tool activity exposes tool name', () => {
    const vm = resolveWhatProgressViewModel(
      {
        status: 'running',
        pipelineStep: 4,
        pipelineSubstep: 'derive',
        currentNode: 'call_tool',
        currentTool: 'WbsTool',
        startedAt: Date.now(),
      },
      { status: 'pending' },
      Date.now()
    );
    assert.equal(vm.macroStep, 4);
    assert.equal(vm.activity.kind, 'call_tool');
    assert.equal(vm.activity.toolName, 'WbsTool');
    assert.equal(vm.showSpinner, true);
  });
});
