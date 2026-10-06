import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOW_MACRO_STEPS,
  HOW_MONITOR_STEPS,
  matchHowStepIndex,
  resolveHowActiveStepId,
  resolveHowProgressViewModel,
  formatElapsed,
} from './howProgressViewModel.js';
import { resolveActiveStepIndex } from './aiHitlMonitorPhase.js';

describe('howProgressViewModel', () => {
  it('macro groups cover flat HOW catalog in order', () => {
    const flat = HOW_MACRO_STEPS.flatMap((m) => m.substeps);
    assert.deepEqual(
      flat,
      HOW_MONITOR_STEPS.map((s) => s.id)
    );
    assert.equal(HOW_MACRO_STEPS.length, 3);
    assert.ok(flat.includes('WbsTool'));
    assert.ok(flat.includes('ProjectPlanTool'));
  });

  it('call_tool + currentTool=WbsTool → checklist on WbsTool (not understand)', () => {
    const id = resolveHowActiveStepId({
      status: 'running',
      currentNode: 'call_tool',
      currentTool: 'WbsTool',
    });
    assert.equal(id, 'WbsTool');
    const idx = resolveActiveStepIndex(
      'how',
      { status: 'running', currentNode: 'call_tool', currentTool: 'WbsTool' },
      { status: 'pending' }
    );
    assert.equal(HOW_MONITOR_STEPS[idx].id, 'WbsTool');
    assert.ok(idx > 0, 'must not stay on understand (index 0)');
  });

  it('execute + currentTool=ScheduleTool → ScheduleTool', () => {
    const id = resolveHowActiveStepId({
      currentNode: 'execute',
      currentTool: 'ScheduleTool',
    });
    assert.equal(id, 'ScheduleTool');
  });

  it('node understand / select / plan map correctly', () => {
    assert.equal(resolveHowActiveStepId({ currentNode: 'understand' }), 'understand');
    assert.equal(resolveHowActiveStepId({ currentNode: 'select' }), 'select');
    assert.equal(resolveHowActiveStepId({ currentNode: 'plan' }), 'select');
  });

  it('fuzzy match Wbs → WbsTool', () => {
    assert.equal(HOW_MONITOR_STEPS[matchHowStepIndex('Wbs')].id, 'WbsTool');
  });

  it('view-model: macro 2 + elapsed + call_tool activity while Wbs runs', () => {
    const started = Date.now() - 65_000;
    const vm = resolveHowProgressViewModel(
      {
        status: 'running',
        currentNode: 'call_tool',
        currentTool: 'WbsTool',
        startedAt: new Date(started).toISOString(),
        runId: 'run-how-1',
      },
      { status: 'pending' },
      started + 65_000
    );
    assert.equal(vm.macroStep, 2);
    assert.equal(vm.activeStepId, 'WbsTool');
    assert.deepEqual(vm.activeMacroSubsteps[0], 'WbsTool');
    assert.equal(vm.activity.kind, 'call_tool');
    assert.equal(vm.activity.toolName, 'WbsTool');
    assert.equal(vm.showSpinner, true);
    assert.equal(vm.elapsedMs, 65_000);
    assert.equal(formatElapsed(vm.elapsedMs), '01:05');
  });

  it('view-model: observe → macro 3', () => {
    const vm = resolveHowProgressViewModel(
      { status: 'running', currentNode: 'observe', startedAt: Date.now() },
      { status: 'pending' }
    );
    assert.equal(vm.macroStep, 3);
    assert.equal(vm.activeStepId, 'observe');
  });

  it('how_done resolves last step', () => {
    const idx = resolveActiveStepIndex('how_done', null, { status: 'ready' });
    assert.equal(HOW_MONITOR_STEPS[idx].id, 'ProjectPlanTool');
  });
});
