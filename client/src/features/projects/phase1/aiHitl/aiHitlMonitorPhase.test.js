import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveAiHitlMonitorPhase,
  resolveActiveStepIndex,
  stepVisualState,
  WHAT_MONITOR_STEPS,
  HOW_MONITOR_STEPS,
} from './aiHitlMonitorPhase.js';

describe('aiHitlMonitorPhase', () => {
  it('idle when no phase started', () => {
    assert.equal(
      resolveAiHitlMonitorPhase({
        packStatus: 'draft',
        phaseWhat: null,
        phaseHow: null,
      }),
      'idle'
    );
  });

  it('what when phase_what pending', () => {
    assert.equal(
      resolveAiHitlMonitorPhase({
        packStatus: 'draft',
        phaseWhat: { status: 'pending' },
        liveRun: { status: 'running', pipelineSubstep: 'parse' },
      }),
      'what'
    );
  });

  it('what when waiting_human data_review', () => {
    assert.equal(
      resolveAiHitlMonitorPhase({
        packStatus: 'draft',
        phaseWhat: { status: 'pending' },
        liveRun: { status: 'waiting_human', gate: 'data_review', pipelineSubstep: 'gate_preview' },
      }),
      'what'
    );
  });

  it('what_done when what ready / under_review', () => {
    assert.equal(
      resolveAiHitlMonitorPhase({
        packStatus: 'under_review',
        phaseWhat: { status: 'ready' },
        phaseHow: null,
      }),
      'what_done'
    );
  });

  it('how when phase_how pending after approved', () => {
    assert.equal(
      resolveAiHitlMonitorPhase({
        packStatus: 'approved',
        phaseWhat: { status: 'ready' },
        phaseHow: { status: 'pending' },
        liveRun: { status: 'running', currentNode: 'WbsTool' },
      }),
      'how'
    );
  });

  it('how_done when how ready', () => {
    assert.equal(
      resolveAiHitlMonitorPhase({
        packStatus: 'approved',
        phaseWhat: { status: 'ready' },
        phaseHow: { status: 'ready' },
      }),
      'how_done'
    );
  });

  it('WHAT active index from pipelineSubstep', () => {
    const idx = resolveActiveStepIndex(
      'what',
      { pipelineSubstep: 'quality' },
      { status: 'pending' }
    );
    assert.equal(WHAT_MONITOR_STEPS[idx].id, 'quality');
  });

  it('WHAT catalog includes derive before meta_gate', () => {
    const deriveIdx = WHAT_MONITOR_STEPS.findIndex((s) => s.id === 'derive');
    const evalIdx = WHAT_MONITOR_STEPS.findIndex((s) => s.id === 'evaluate_local');
    const metaIdx = WHAT_MONITOR_STEPS.findIndex((s) => s.id === 'meta_gate');
    assert.ok(deriveIdx >= 0);
    assert.ok(evalIdx > deriveIdx);
    assert.ok(metaIdx > evalIdx);
    assert.equal(WHAT_MONITOR_STEPS.findIndex((s) => s.id === 'feasibility'), -1);
    const active = resolveActiveStepIndex(
      'what',
      { pipelineSubstep: 'derive' },
      { status: 'pending' }
    );
    assert.equal(WHAT_MONITOR_STEPS[active].id, 'derive');
  });

  it('WHAT maps legacy feasibility progress to meta_gate', () => {
    const idx = resolveActiveStepIndex(
      'what',
      { pipelineSubstep: 'feasibility' },
      { status: 'running' }
    );
    assert.equal(WHAT_MONITOR_STEPS[idx].id, 'meta_gate');
  });

  it('HOW active index matches tool node', () => {
    const idx = resolveActiveStepIndex(
      'how',
      { currentNode: 'ScheduleTool' },
      { status: 'pending' }
    );
    assert.equal(HOW_MONITOR_STEPS[idx].id, 'ScheduleTool');
  });

  it('HOW fuzzy match without Tool suffix', () => {
    const idx = resolveActiveStepIndex('how', { currentNode: 'Wbs' }, { status: 'running' });
    assert.equal(HOW_MONITOR_STEPS[idx].id, 'WbsTool');
  });

  it('stepVisualState marks done/current/pending', () => {
    assert.equal(stepVisualState(0, 2), 'done');
    assert.equal(stepVisualState(2, 2), 'current');
    assert.equal(stepVisualState(3, 2), 'pending');
    assert.equal(stepVisualState(0, 0, true), 'done');
  });
});
