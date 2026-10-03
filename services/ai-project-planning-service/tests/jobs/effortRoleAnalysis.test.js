/**
 * Effort engine — story points, confidence, optional history blend.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  COMPLEXITY_HOURS,
  COMPLEXITY_STORY_POINTS,
  runEffortEngine,
} = require('../../src/engines/effort');

function containerWithTasks(tasks, capabilities = []) {
  return {
    planning: { tasks },
    analyses: { capability: { items: capabilities } },
  };
}

describe('effortRoleAnalysis engine', () => {
  it('sets storyPoints + confidence and keeps default hours without history', () => {
    const result = runEffortEngine(
      containerWithTasks(
        [{ id: 'T1', name: 'API', suggestedRoleKey: 'backend', sourceCapabilityIds: ['CAP-1'] }],
        [{ capabilityId: 'CAP-1', complexity: 'medium' }]
      )
    );
    assert.equal(result.tasks[0].effortHours, COMPLEXITY_HOURS.medium);
    assert.equal(result.tasks[0].storyPoints, COMPLEXITY_STORY_POINTS.medium);
    assert.equal(result.tasks[0].confidence, 0.55);
    assert.equal(result.effort.totalStoryPoints, COMPLEXITY_STORY_POINTS.medium);
    assert.equal(result.effort.confidence, 0.55);
  });

  it('blends hours toward history when sampleSize present', () => {
    const without = runEffortEngine(
      containerWithTasks(
        [{ id: 'T1', name: 'API', suggestedRoleKey: 'backend', sourceCapabilityIds: ['CAP-1'] }],
        [{ capabilityId: 'CAP-1', complexity: 'high' }]
      )
    );
    const withHistory = runEffortEngine(
      containerWithTasks(
        [{ id: 'T1', name: 'API', suggestedRoleKey: 'backend', sourceCapabilityIds: ['CAP-1'] }],
        [{ capabilityId: 'CAP-1', complexity: 'high' }]
      ),
      {
        historyMetrics: {
          hoursByComplexity: { high: 20 },
          sampleSize: 50,
        },
      }
    );
    assert.equal(without.tasks[0].effortHours, 32);
    // weight = min(0.2, 50/50) = 0.2 → 32*0.8 + 20*0.2 = 29.6 → 30
    assert.equal(withHistory.tasks[0].effortHours, 30);
    assert.ok(withHistory.tasks[0].confidence > without.tasks[0].confidence);
    assert.ok(withHistory.effort.confidence > without.effort.confidence);
    assert.equal(withHistory.meta.historyBlended, true);
  });
});
