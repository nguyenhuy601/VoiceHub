const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  persistClosedProjectExperiences,
  persistClosedBoardExperiences,
} = require('../src/services/closedBoardExperience.service');

const PROJECT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BOARD_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const ROLE_DEV = '111111111111111111111111';
const DEV = 'cccccccccccccccccccccccc';

function chainFind(rows) {
  return {
    select: () => ({
      lean: async () => rows,
      sort: () => ({
        lean: async () => rows[0] || null,
      }),
    }),
    lean: async () => rows,
    sort: () => ({
      lean: async () => rows[0] || null,
    }),
  };
}

describe('closedBoardExperience.service', () => {
  it('T2 persistClosedProjectExperiences appends closed_board rows', async () => {
    const appended = [];
    const deps = {
      ProjectMembership: {
        find: () =>
          chainFind([{ userId: DEV, projectRoleId: ROLE_DEV }]),
      },
      ProjectRole: {
        find: () =>
          chainFind([{ _id: ROLE_DEV, key: 'developer', label: 'developer' }]),
      },
      Task: {
        find: () =>
          chainFind([
            {
              status: 'done',
              completedAt: new Date(),
              assigneeId: DEV,
              assignments: [{ userId: DEV, slot: 'primary' }],
            },
          ]),
      },
      TaskBoard: {
        findOne: () => ({
          select: () => ({
            sort: () => ({
              lean: async () => ({ _id: BOARD_ID, title: 'Main' }),
            }),
          }),
        }),
      },
      appendClosedBoardExperience: async (userId, experience) => {
        appended.push({ userId, experience });
        return { ok: true };
      },
    };

    const result = await persistClosedProjectExperiences({
      project: {
        _id: PROJECT_ID,
        title: 'VoiceHub',
        expectedEndDate: new Date('2026-08-01'),
      },
      closedAt: new Date('2026-08-01'),
      deps,
    });

    assert.equal(result.skipped, false);
    assert.ok(result.appended >= 1);
    assert.equal(appended.length, 1);
    assert.equal(appended[0].userId, DEV);
    assert.equal(appended[0].experience.source, 'closed_board');
    assert.equal(appended[0].experience.evidenceBoardId, BOARD_ID);
    assert.match(appended[0].experience.work, /1\/1/);
  });

  it('persistClosedBoardExperiences maps legacy board roles', async () => {
    const appended = [];
    const board = {
      _id: BOARD_ID,
      title: 'Legacy Board',
      dueDate: new Date('2026-07-01'),
    };
    const deps = {
      TaskBoardMember: {
        find: () =>
          chainFind([{ userId: DEV, role: 'editor' }]),
      },
      Task: {
        find: () =>
          chainFind([
            {
              status: 'done',
              completedAt: new Date(),
              assigneeId: DEV,
              assignments: [{ userId: DEV, slot: 'primary' }],
            },
          ]),
      },
      appendClosedBoardExperience: async (userId, experience) => {
        appended.push({ userId, experience });
      },
    };

    const result = await persistClosedBoardExperiences(board, deps);
    assert.equal(result.skipped, false);
    assert.ok(result.appended >= 1);
    assert.equal(appended[0].experience.source, 'closed_board');
    assert.equal(appended[0].experience.evidenceBoardId, BOARD_ID);
  });
});
