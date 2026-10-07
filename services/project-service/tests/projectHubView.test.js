const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  isHubView,
  toProjectHubView,
} = require('../src/utils/project/projectHubView');

describe('isHubView', () => {
  it('accepts hub (case-insensitive)', () => {
    assert.equal(isHubView('hub'), true);
    assert.equal(isHubView('HUB'), true);
  });

  it('rejects empty or other views', () => {
    assert.equal(isHubView(''), false);
    assert.equal(isHubView(undefined), false);
    assert.equal(isHubView('card'), false);
    assert.equal(isHubView('full'), false);
  });
});

describe('toProjectHubView', () => {
  it('omits budget/closure/workflow dumps and slims boards', () => {
    const out = toProjectHubView({
      _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      title: 'Hub Proj',
      deliveryPhase: 'development',
      capabilities: { permissions: ['project:edit'] },
      defaultBoardId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      boards: [
        {
          _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
          title: 'Main',
          isActive: true,
          lists: [{ _id: 'l1', cards: [{ title: 'x' }] }],
          workflowId: 'w1',
        },
      ],
      budgetStub: { amount: 99 },
      budget: { total: 1 },
      closureSnapshot: { closedAt: '2026-01-01' },
      methodologySettings: { wipLimit: 5 },
      visibilityPolicy: { mode: 'private' },
      informationLevelOverrides: [{ role: 'x' }],
      uatChecklist: [{ id: 1 }],
      uatEvidence: [{ url: 'x' }],
      uatSignOff: { notes: 'secret' },
      workflowDefinition: { states: [] },
      workTypeConfig: { types: [] },
      priorityConfig: { levels: [] },
      uatStatus: 'none',
      releaseReadyStatus: 'none',
      access: { discover: true, informationLevel: 'details' },
    });

    assert.equal(out.title, 'Hub Proj');
    assert.equal(out.deliveryPhase, 'development');
    assert.deepEqual(out.capabilities, { permissions: ['project:edit'] });
    assert.equal(out.defaultBoardId, 'bbbbbbbbbbbbbbbbbbbbbbbb');
    assert.equal(out.uatStatus, 'none');
    assert.ok(out.workTypeConfig);
    assert.ok(out.priorityConfig);
    assert.ok(out.access);

    assert.equal(out.budgetStub, undefined);
    assert.equal(out.budget, undefined);
    assert.equal(out.closureSnapshot, undefined);
    assert.equal(out.methodologySettings, undefined);
    assert.equal(out.visibilityPolicy, undefined);
    assert.equal(out.uatChecklist, undefined);
    assert.equal(out.uatEvidence, undefined);
    assert.equal(out.uatSignOff, undefined);
    assert.equal(out.workflowDefinition, undefined);

    assert.deepEqual(out.boards, [
      { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', title: 'Main', isActive: true },
    ]);
    assert.equal(out.boards[0].lists, undefined);
  });

  it('handles missing boards safely', () => {
    const out = toProjectHubView({ title: 'X' });
    assert.equal(out.title, 'X');
    assert.equal(out.boards, undefined);
  });
});
