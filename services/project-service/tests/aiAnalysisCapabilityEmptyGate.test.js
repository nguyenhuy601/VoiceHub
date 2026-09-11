'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  ensureAiAnalysisContainer,
  normalizeEmptyCapabilityReady,
  capabilityItemsEmpty,
  assertCapabilityConfirmable,
  createEmptyAiAnalysisContainer,
} = require('../src/utils/aiAnalysis/aiAnalysisContainer');
const { shouldSkipRerunBecauseReady } = require('../src/utils/aiAnalysis/aiAnalysisStaleGc');
const { runCapabilityAnalysis } = require('../src/utils/aiAnalysis/aiAnalysisCapability');

function readyEmptyCapabilityContainer() {
  const base = createEmptyAiAnalysisContainer();
  base.jobs.capabilityAnalysis = {
    ...base.jobs.capabilityAnalysis,
    status: 'ready',
    generatedAt: new Date().toISOString(),
    error: null,
  };
  base.analyses.capability = {
    ...base.analyses.capability,
    status: 'ready',
    items: [],
  };
  return base;
}

describe('aiAnalysisCapabilityEmptyGate', () => {
  it('normalizeEmptyCapabilityReady: ready + empty → stale', () => {
    const raw = readyEmptyCapabilityContainer();
    const { container, changed } = normalizeEmptyCapabilityReady(raw);
    assert.equal(changed, true);
    assert.equal(container.jobs.capabilityAnalysis.status, 'stale');
    assert.equal(container.jobs.capabilityAnalysis.confirmedAt, null);
    assert.equal(container.jobs.capabilityAnalysis.error, 'empty_requirement_leaves');
    assert.deepEqual(container.analyses.capability.items, []);
  });

  it('ensureAiAnalysisContainer normalizes ready + empty → stale', () => {
    const ensured = ensureAiAnalysisContainer(readyEmptyCapabilityContainer());
    assert.equal(ensured.jobs.capabilityAnalysis.status, 'stale');
    assert.equal(ensured.jobs.capabilityAnalysis.error, 'empty_requirement_leaves');
  });

  it('normalize leaves ready alone when items present', () => {
    const raw = readyEmptyCapabilityContainer();
    raw.analyses.capability.items = [
      {
        capabilityId: 'CAP-1',
        name: 'Login',
        module: 'Auth',
        sourceFrIds: ['FR-1'],
        requiredSkills: [{ name: 'backend' }],
        complexity: 'low',
        confidence: 0.8,
      },
    ];
    const { container, changed } = normalizeEmptyCapabilityReady(raw);
    assert.equal(changed, false);
    assert.equal(container.jobs.capabilityAnalysis.status, 'ready');
    assert.equal(capabilityItemsEmpty(container), false);
  });

  it('shouldSkipRerunBecauseReady: ready + empty → false', () => {
    const c = readyEmptyCapabilityContainer();
    assert.equal(shouldSkipRerunBecauseReady(c, 'capabilityAnalysis'), false);
    assert.equal(shouldSkipRerunBecauseReady(c, 'capabilityAnalysis', { force: true }), false);
  });

  it('shouldSkipRerunBecauseReady: ready + items → true', () => {
    const c = readyEmptyCapabilityContainer();
    c.analyses.capability.items = [{ capabilityId: 'CAP-1' }];
    assert.equal(shouldSkipRerunBecauseReady(c, 'capabilityAnalysis'), true);
  });

  it('assertCapabilityConfirmable throws AI_ANALYSIS_CAPABILITY_EMPTY', () => {
    const c = readyEmptyCapabilityContainer();
    assert.throws(() => assertCapabilityConfirmable(c), (err) => {
      assert.equal(err.statusCode, 409);
      assert.equal(err.errorCode, 'AI_ANALYSIS_CAPABILITY_EMPTY');
      return true;
    });
  });

  it('assertCapabilityConfirmable allows non-empty items', () => {
    const c = readyEmptyCapabilityContainer();
    c.analyses.capability.items = [{ capabilityId: 'CAP-1' }];
    assert.doesNotThrow(() => assertCapabilityConfirmable(c));
  });

  it('runCapabilityAnalysis on Module-only pack → empty items (caller marks failed)', async () => {
    const pack = {
      overview: { name: 'Demo' },
      functionalRequirements: [
        { externalId: 'M1', level: 'Module', name: 'Auth', parentExternalId: '' },
      ],
    };
    const result = await runCapabilityAnalysis(pack, { forceHeuristic: true });
    assert.equal(result.items.length, 0);
    assert.equal(result.meta.source, 'empty');
  });
});
