/**
 * T6 / T7 — FR via Runtime; non-FR Runtime when sheet + policy ON
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { runSemanticTask, TASK_POLICIES } = require('../src/semantic');

describe('frViaSemanticRuntime', () => {
  it('task=FR delegates to frRuntimeFn', async () => {
    let called = false;
    const out = await runSemanticTask({
      taskId: 'fr',
      rows: [{ id: 'c1' }],
      frRuntimeFn: async () => {
        called = true;
        return {
          items: [{ logicalId: 'FR-1', title: 'A' }],
          llmCalls: 1,
          semanticOutput: { ok: true },
          proposalFragment: { section: 'functionalRequirements', items: [{ logicalId: 'FR-1' }] },
          coverage: { status: 'AVAILABLE' },
        };
      },
      env: { AI_PLANNING_LLM: '1' },
    });
    assert.equal(called, true);
    assert.equal(out.status, TASK_POLICIES.RUN);
    assert.equal(out.llmCalls, 1);
    assert.ok(out.proposalFragment);
  });
});

describe('nonFrRuntimeOn', () => {
  it('calls runtime path for BR when sheet + policy RUN (LLM off → degrade, not skip)', async () => {
    const out = await runSemanticTask({
      taskId: 'br',
      rows: [{ id: 'BR-1', title: 'Must approve', description: 'if amount > X' }],
      forcePolicy: TASK_POLICIES.RUN,
      env: { ...process.env, AI_PLANNING_LLM: '0' },
    });
    // LLM disabled → degrade to deterministic extract, not invent
    assert.ok(
      out.status === TASK_POLICIES.DETERMINISTIC_ONLY || out.status === TASK_POLICIES.RUN
    );
    assert.ok(out.items.length >= 1);
    assert.equal(out.items[0].origin.type, 'EXTRACTED');
    assert.equal(out.items[0].provenance.producer, 'deterministic');
  });

  it('mock Runtime when LLM on stamps AI_SYNTHESIS', async () => {
    const runtimePath = require.resolve('../src/semantic/semanticRuntime');
    const taskPath = require.resolve('../src/semantic/runSemanticTask');
    delete require.cache[taskPath];
    delete require.cache[runtimePath];
    const semanticRuntime = require('../src/semantic/semanticRuntime');
    semanticRuntime.invokeSemanticRuntime = async () => ({
      ok: true,
      skipped: false,
      data: {
        rules: [{ ruleId: 'BR-S1', ruleCondition: 'a', ruleAction: 'b', statement: 'rule' }],
      },
      usage: { tokens: 10 },
      error: null,
    });
    delete require.cache[taskPath];
    const { runSemanticTask: runFresh } = require('../src/semantic/runSemanticTask');
    const { TASK_POLICIES: TP } = require('../src/semantic/semanticTaskRegistry');
    try {
      const out = await runFresh({
        taskId: 'br',
        rows: [{ id: 'BR-1', title: 'x' }],
        forcePolicy: TP.RUN,
        env: { ...process.env, AI_PLANNING_LLM: '1' },
      });
      assert.equal(out.status, TP.RUN);
      assert.equal(out.llmCalls, 1);
      assert.equal(out.items[0].origin.type, 'AI_SYNTHESIS');
      assert.equal(out.items[0].provenance.producer, 'semantic_runtime');
    } finally {
      delete require.cache[taskPath];
      delete require.cache[runtimePath];
      require('../src/semantic/semanticRuntime');
      require('../src/semantic/runSemanticTask');
    }
  });
});
