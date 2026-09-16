const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  isCardListView,
  toProjectListCardItem,
} = require('../src/utils/project/projectListCardView');

describe('isCardListView', () => {
  it('accepts card and list_card', () => {
    assert.equal(isCardListView('card'), true);
    assert.equal(isCardListView('list_card'), true);
    assert.equal(isCardListView('CARD'), true);
  });

  it('rejects empty or other views', () => {
    assert.equal(isCardListView(''), false);
    assert.equal(isCardListView(undefined), false);
    assert.equal(isCardListView('full'), false);
  });
});

describe('toProjectListCardItem', () => {
  it('keeps card fields and strips nested/config noise', () => {
    const out = toProjectListCardItem({
      _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      projectId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      organizationId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      title: 'Cafe',
      projectCode: 'QLDAC-1',
      description: 'Desc',
      status: 'in_development',
      priority: 'high',
      visibility: 'private',
      startDate: '2026-09-01T00:00:00.000Z',
      expectedEndDate: '2026-11-30T00:00:00.000Z',
      dueDate: null,
      relatedDepartmentIds: ['d1'],
      isActive: true,
      defaultBoardId: 'cccccccccccccccccccccccc',
      memberCount: 12,
      membersCount: 12,
      access: {
        discover: true,
        informationLevel: 'confidential',
        audiences: ['project_members', 'all_employees'],
      },
      myMembership: {
        isMember: true,
        projectRoleKeys: ['project_manager', 'developer'],
      },
      progressPercent: 68,
      health: 'on_track',
      pm: { userId: 'u1', displayName: 'Nguyễn A' },
      boards: [{ _id: 'cccccccccccccccccccccccc', title: 'Main' }],
      methodologySettings: { wipLimit: 0 },
      budgetStub: { amount: 1 },
      requiredProjectRoles: [{ roleKey: 'backend_developer', requiredCount: 1 }],
      priorityConfig: { items: [] },
      workTypeConfig: null,
      customer: { name: 'X' },
      closureSnapshot: {},
      visibilityPolicy: {},
      __v: 0,
    });

    assert.equal(out.title, 'Cafe');
    assert.equal(out.projectCode, 'QLDAC-1');
    assert.equal(out.defaultBoardId, 'cccccccccccccccccccccccc');
    assert.equal(out.progressPercent, 68);
    assert.equal(out.health, 'on_track');
    assert.deepEqual(out.pm, { userId: 'u1', displayName: 'Nguyễn A' });
    assert.deepEqual(out.access, {
      discover: true,
      informationLevel: 'confidential',
    });
    assert.deepEqual(out.myMembership, { isMember: true });
    assert.equal(out.boards, undefined);
    assert.equal(out.methodologySettings, undefined);
    assert.equal(out.budgetStub, undefined);
    assert.equal(out.requiredProjectRoles, undefined);
    assert.equal(out.priorityConfig, undefined);
    assert.equal(out.customer, undefined);
    assert.equal(out.__v, undefined);
    assert.equal(out.myMembership.projectRoleKeys, undefined);
    assert.equal(out.access.audiences, undefined);
  });

  it('null-safe progress and pm', () => {
    const out = toProjectListCardItem({
      _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      title: 'X',
      progressPercent: null,
      pm: null,
      access: {},
      myMembership: { isMember: false },
    });
    assert.equal(out.progressPercent, null);
    assert.equal(out.pm, null);
    assert.equal(out.myMembership.isMember, false);
  });
});
