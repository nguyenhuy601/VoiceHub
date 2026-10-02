/**
 * T1 — SemanticTask policy: empty sheet → SKIP, 0 LLM, no cross-fill.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  runSemanticTask,
  resolveTaskPolicy,
  TASK_POLICIES,
  listSemanticTasks,
} = require('../src/semantic');

describe('semanticTaskPolicy', () => {
  it('SOURCE_SHEET_EMPTY → SKIP for BR with 0 LLM', async () => {
    let llmCalled = false;
    const orig = require('../src/semantic/semanticRuntime').invokeSemanticRuntime;
    // Monkey via env: LLM disabled
    const out = await runSemanticTask({
      taskId: 'br',
      rows: [],
      env: { ...process.env, AI_PLANNING_LLM: '0', SEMANTIC_NONFR_RUNTIME: '1' },
    });
    assert.equal(out.status, TASK_POLICIES.SKIP);
    assert.equal(out.reason, 'SOURCE_SHEET_EMPTY');
    assert.equal(out.llmCalls, 0);
    assert.equal(out.items.length, 0);
    void orig;
    void llmCalled;
  });

  it('resolveTaskPolicy empty → skip even if default RUN', () => {
    assert.equal(
      resolveTaskPolicy('bg', { sourceEmpty: true, env: { SEMANTIC_NONFR_RUNTIME: '1' } }),
      TASK_POLICIES.SKIP
    );
  });

  it('non-empty + policy run when default ON', () => {
    const p = resolveTaskPolicy('br', {
      sourceEmpty: false,
      env: { SEMANTIC_TASK_BR_POLICY: 'run' },
    });
    assert.equal(p, TASK_POLICIES.RUN);
  });

  it('registry lists semantic section tasks', () => {
    const ids = listSemanticTasks().map((t) => t.id);
    for (const id of ['bg', 'br', 'nfr', 'scope', 'bpm', 'interface', 'fr', 'uc', 'data']) {
      assert.ok(ids.includes(id), `missing ${id}`);
    }
  });
});
