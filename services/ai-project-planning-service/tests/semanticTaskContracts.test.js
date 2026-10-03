/**
 * T2 — SemanticTask contracts complete fields
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  listSemanticTasks,
  requiredContractFields,
  getSemanticTask,
} = require('../src/semantic/semanticTaskRegistry');

describe('semanticTaskContracts', () => {
  it('has BG…Data + FR + deterministic tasks', () => {
    const ids = listSemanticTasks().map((t) => t.id);
    for (const id of [
      'bg',
      'br',
      'nfr',
      'scope',
      'bpm',
      'interface',
      'fr',
      'uc',
      'data',
      'glossary',
      'assumption',
      'traceability',
    ]) {
      assert.ok(ids.includes(id), id);
    }
  });

  it('every task has required contract fields', () => {
    const fields = requiredContractFields();
    for (const task of listSemanticTasks()) {
      for (const f of fields) {
        assert.ok(task[f] != null, `${task.id}.${f}`);
      }
    }
  });

  it('FR allows runtime; glossary does not', () => {
    assert.equal(getSemanticTask('fr').allowsRuntime, true);
    assert.equal(getSemanticTask('glossary').allowsRuntime, false);
  });
});
