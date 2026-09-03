const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildProjectOverviewAggregate,
  slimOverviewProject,
} = require('../src/utils/projectOverviewAggregate');

describe('getProjectOverview shape (unit)', () => {
  it('slimOverviewProject strips heavy fields', () => {
    const slim = slimOverviewProject({
      _id: 'p1',
      projectId: 'p1',
      title: 'Demo',
      status: 'active',
      projectCode: 'DEMO',
      access: { informationLevel: 'details' },
      priorityConfig: { items: [] },
      capabilities: { canViewBoard: true },
      boards: [{ _id: 'b1' }],
      description: 'long'.repeat(100),
    });
    assert.equal(slim.projectId, 'p1');
    assert.equal(slim.title, 'Demo');
    assert.ok(!('boards' in slim));
    assert.ok(!('description' in slim));
  });

  it('aggregate response keys backward-compatible', () => {
    const data = buildProjectOverviewAggregate({ cards: [], lists: [] });
    assert.ok(data.summary);
    assert.ok(data.charts);
    assert.ok(data.planningPulse);
    assert.ok(data.healthPreview);
    assert.ok(Array.isArray(data.nextActions));
    assert.ok('activeSprint' in data);
  });
});
