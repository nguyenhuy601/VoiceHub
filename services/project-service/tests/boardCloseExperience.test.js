const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildClosedBoardExperiences,
  buildFactLine,
} = require('../src/utils/boardCloseExperience');

const BOARD_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const PM = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const DEV = 'cccccccccccccccccccccccc';
const WATCH = 'dddddddddddddddddddddddd';
const ROLE_PM = '111111111111111111111111';
const ROLE_DEV = '222222222222222222222222';
const ROLE_WATCH = '333333333333333333333333';

const board = {
  _id: BOARD_ID,
  title: 'VoiceHub',
  dueDate: '2026-08-01T00:00:00.000Z',
};

const roles = [
  { _id: ROLE_PM, key: 'project_manager', label: 'project_manager' },
  { _id: ROLE_DEV, key: 'developer', label: 'developer' },
  { _id: ROLE_WATCH, key: 'watcher', label: 'watcher' },
];

describe('boardCloseExperience', () => {
  it('U1 fact line contains 8/10 and due date, no percent', () => {
    const line = buildFactLine({
      boardTitle: 'VoiceHub',
      roleLabel: 'developer',
      done: 8,
      total: 10,
      dueLabel: '2026-08-01',
    });
    assert.match(line, /8\/10/);
    assert.match(line, /2026-08-01/);
    assert.ok(!line.includes('%'));

    const tasks = [];
    for (let i = 0; i < 10; i += 1) {
      tasks.push({
        status: i < 8 ? 'done' : 'todo',
        assigneeId: DEV,
        assignments: [{ userId: DEV, slot: 'primary' }],
      });
    }
    const rows = buildClosedBoardExperiences({
      board,
      memberships: [{ userId: DEV, projectRoleId: ROLE_DEV }],
      roles,
      tasks,
    });
    assert.equal(rows.length, 1);
    assert.match(rows[0].work, /8\/10/);
    assert.ok(!rows[0].work.includes('%'));
    assert.equal(rows[0].source, 'closed_board');
    assert.equal(rows[0].status, 'suggested');
    assert.equal(rows[0].evidenceBoardId, BOARD_ID);
  });

  it('U2 watcher with 0 assigned tasks is skipped; PM with 0 cards is kept', () => {
    const rows = buildClosedBoardExperiences({
      board,
      memberships: [
        { userId: WATCH, projectRoleId: ROLE_WATCH },
        { userId: PM, projectRoleId: ROLE_PM },
      ],
      roles,
      tasks: [],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].userId, PM);
    assert.equal(rows[0].isProjectManager, true);
    assert.match(rows[0].work, /project_manager/);
  });
});
