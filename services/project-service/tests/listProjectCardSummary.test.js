const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  progressPercentFromProgress,
  buildCardSummaryFields,
  profileDisplayName,
  attachListProjectCardSummaries,
  loadPmUserIdByProject,
} = require('../src/utils/project/listProjectCardSummary');

describe('progressPercentFromProgress', () => {
  it('returns null when no open/done cards', () => {
    assert.equal(progressPercentFromProgress({ doneCards: 0, openCards: 0 }), null);
    assert.equal(progressPercentFromProgress(null), null);
  });

  it('rounds percentDoneCards to 0–100', () => {
    assert.equal(progressPercentFromProgress({ doneCards: 34, openCards: 16 }), 68);
    assert.equal(progressPercentFromProgress({ doneCards: 1, openCards: 1 }), 50);
  });
});

describe('buildCardSummaryFields', () => {
  const asOf = new Date('2026-10-01T00:00:00.000Z');

  it('maps on_track health and progress', () => {
    const project = {
      status: 'in_development',
      isActive: true,
      expectedEndDate: '2026-11-30T00:00:00.000Z',
    };
    const progress = { doneCards: 34, openCards: 16, overdueCards: 0 };
    const out = buildCardSummaryFields(
      project,
      progress,
      { userId: 'u1', displayName: 'Nguyễn Văn A' },
      asOf
    );
    assert.equal(out.progressPercent, 68);
    assert.equal(out.health, 'on_track');
    assert.deepEqual(out.pm, { userId: 'u1', displayName: 'Nguyễn Văn A' });
  });

  it('marks delayed when past due', () => {
    const project = {
      status: 'in_development',
      isActive: true,
      dueDate: '2026-09-01T00:00:00.000Z',
    };
    const out = buildCardSummaryFields(project, { doneCards: 1, openCards: 1 }, null, asOf);
    assert.equal(out.health, 'delayed');
    assert.equal(out.pm, null);
  });

  it('marks paused for on_hold', () => {
    const out = buildCardSummaryFields(
      { status: 'on_hold', isActive: true },
      null,
      null,
      asOf
    );
    assert.equal(out.health, 'paused');
    assert.equal(out.progressPercent, null);
  });
});

describe('profileDisplayName', () => {
  it('prefers displayName then fullName', () => {
    assert.equal(profileDisplayName({ displayName: 'A' }, 'u1'), 'A');
    assert.equal(profileDisplayName({ fullName: 'B' }, 'u1'), 'B');
  });

  it('falls back to short id', () => {
    assert.equal(profileDisplayName(null, 'abcdef123456'), '123456');
  });
});

describe('attachListProjectCardSummaries', () => {
  it('attaches additive fields via injected deps', async () => {
    const projects = [
      {
        _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        projectId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        status: 'in_development',
        isActive: true,
        expectedEndDate: '2026-12-01T00:00:00.000Z',
      },
    ];
    const progressMap = new Map([
      [
        'aaaaaaaaaaaaaaaaaaaaaaaa',
        { doneCards: 2, openCards: 2, overdueCards: 0, cancelledCards: 0, totalCards: 4 },
      ],
    ]);

    await attachListProjectCardSummaries(projects, 'bbbbbbbbbbbbbbbbbbbbbbbb', {
      asOf: new Date('2026-10-01T00:00:00.000Z'),
      loadProgress: async () => progressMap,
      findMemberships: async () => [
        {
          projectId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
          userId: 'cccccccccccccccccccccccc',
          projectRoleId: 'dddddddddddddddddddddddd',
        },
      ],
      findRoles: async () => [{ _id: 'dddddddddddddddddddddddd', key: 'project_manager' }],
      fetchProfiles: async () =>
        new Map([['cccccccccccccccccccccccc', { displayName: 'PM One' }]]),
      logger: { warn() {} },
    });

    assert.equal(projects[0].progressPercent, 50);
    assert.equal(projects[0].health, 'on_track');
    assert.deepEqual(projects[0].pm, {
      userId: 'cccccccccccccccccccccccc',
      displayName: 'PM One',
    });
  });

  it('runs progress and pm load in parallel and reuses memberships', async () => {
    const projects = [
      {
        _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        status: 'in_development',
        isActive: true,
        expectedEndDate: '2026-12-01T00:00:00.000Z',
      },
    ];
    let findMembershipsCalls = 0;
    let overlap = false;
    let progressStarted = false;
    let pmStarted = false;

    await attachListProjectCardSummaries(projects, 'bbbbbbbbbbbbbbbbbbbbbbbb', {
      asOf: new Date('2026-10-01T00:00:00.000Z'),
      progressMode: 'card',
      memberships: [
        {
          projectId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
          userId: 'cccccccccccccccccccccccc',
          projectRoleId: 'dddddddddddddddddddddddd',
        },
      ],
      loadProgress: async (opts) => {
        progressStarted = true;
        if (pmStarted) overlap = true;
        assert.equal(opts.mode, 'card');
        await new Promise((r) => setTimeout(r, 20));
        return new Map([
          [
            'aaaaaaaaaaaaaaaaaaaaaaaa',
            { doneCards: 1, openCards: 1, overdueCards: 0, totalCards: 2 },
          ],
        ]);
      },
      findMemberships: async () => {
        findMembershipsCalls += 1;
        return [];
      },
      findRoles: async () => {
        pmStarted = true;
        if (progressStarted) overlap = true;
        await new Promise((r) => setTimeout(r, 20));
        return [{ _id: 'dddddddddddddddddddddddd', key: 'project_manager' }];
      },
      fetchProfiles: async () =>
        new Map([['cccccccccccccccccccccccc', { displayName: 'PM One' }]]),
      logger: { warn() {} },
    });

    assert.equal(findMembershipsCalls, 0);
    assert.equal(overlap, true);
    assert.equal(projects[0].progressPercent, 50);
    assert.deepEqual(projects[0].pm, {
      userId: 'cccccccccccccccccccccccc',
      displayName: 'PM One',
    });
  });

  it('survives progress loader failure', async () => {
    const projects = [
      {
        _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        status: 'planning',
        isActive: true,
      },
    ];
    await attachListProjectCardSummaries(projects, 'bbbbbbbbbbbbbbbbbbbbbbbb', {
      asOf: new Date('2026-10-01T00:00:00.000Z'),
      loadProgress: async () => {
        throw new Error('db down');
      },
      findMemberships: async () => [],
      findRoles: async () => [],
      fetchProfiles: async () => new Map(),
      logger: { warn() {} },
    });
    assert.equal(projects[0].progressPercent, null);
    assert.equal(projects[0].health, 'on_track');
    assert.equal(projects[0].pm, null);
  });
});

describe('loadPmUserIdByProject', () => {
  it('picks first project_manager per project (fallback $in roleIds)', async () => {
    const map = await loadPmUserIdByProject(['aaaaaaaaaaaaaaaaaaaaaaaa'], {
      findMemberships: async () => [
        {
          projectId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
          userId: 'u-pm',
          projectRoleId: 'dddddddddddddddddddddddd',
        },
        {
          projectId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
          userId: 'u-dev',
          projectRoleId: 'eeeeeeeeeeeeeeeeeeeeeeee',
        },
      ],
      findRoles: async () => [
        { _id: 'dddddddddddddddddddddddd', key: 'project_manager' },
        { _id: 'eeeeeeeeeeeeeeeeeeeeeeee', key: 'developer' },
      ],
    });
    assert.equal(map.get('aaaaaaaaaaaaaaaaaaaaaaaa'), 'u-pm');
  });

  it('uses preloaded memberships without findMemberships', async () => {
    let findCalls = 0;
    const map = await loadPmUserIdByProject(['aaaaaaaaaaaaaaaaaaaaaaaa'], {
      memberships: [
        {
          projectId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
          userId: 'u-pm',
          projectRoleId: 'dddddddddddddddddddddddd',
        },
      ],
      findMemberships: async () => {
        findCalls += 1;
        return [];
      },
      findRoles: async () => [{ _id: 'dddddddddddddddddddddddd', key: 'project_manager' }],
    });
    assert.equal(findCalls, 0);
    assert.equal(map.get('aaaaaaaaaaaaaaaaaaaaaaaa'), 'u-pm');
  });

  it('resolves PM via organizationId + role key (not $in all roleIds)', async () => {
    let findRolesFilter = null;
    const map = await loadPmUserIdByProject(['aaaaaaaaaaaaaaaaaaaaaaaa'], {
      organizationId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      memberships: [
        {
          projectId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
          userId: 'u-pm',
          projectRoleId: 'dddddddddddddddddddddddd',
        },
        {
          projectId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
          userId: 'u-dev',
          projectRoleId: 'eeeeeeeeeeeeeeeeeeeeeeee',
        },
      ],
      findMemberships: async () => {
        throw new Error('should not fetch memberships');
      },
      findRoles: async (filter) => {
        findRolesFilter = filter;
        return [{ _id: 'dddddddddddddddddddddddd', key: 'project_manager' }];
      },
    });
    assert.equal(findRolesFilter.key, 'project_manager');
    assert.equal(String(findRolesFilter.organizationId), 'bbbbbbbbbbbbbbbbbbbbbbbb');
    assert.equal('_id' in findRolesFilter, false);
    assert.equal(map.get('aaaaaaaaaaaaaaaaaaaaaaaa'), 'u-pm');
  });
});
