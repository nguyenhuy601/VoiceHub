const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  mergeGenerationHealth,
  buildGenerationHealthFromMeta,
} = require('../src/contracts/generationHealthContract');

describe('generationHealthContract', () => {
  it('T4: OR-preserves partial across successful later stage', () => {
    const afterSemantic = buildGenerationHealthFromMeta({
      partial: true,
      task: 'semantic',
      coverage: { analyzed: 35, total: 40 },
    });
    assert.equal(afterSemantic.partial, true);
    const afterEngine = mergeGenerationHealth(afterSemantic, {
      partial: false,
      failedTasks: [],
    });
    assert.equal(afterEngine.partial, true);
    assert.ok(afterEngine.failedTasks.includes('semantic'));
    assert.equal(afterEngine.coverage.total, 40);
  });

  it('unions failedTasks', () => {
    const m = mergeGenerationHealth(
      { partial: true, failedTasks: ['semantic'] },
      { partial: true, failedTasks: ['conflict'] }
    );
    assert.deepEqual(m.failedTasks.sort(), ['conflict', 'semantic']);
  });
});
