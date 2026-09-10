const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  indexTaskBoardsForDashboard,
  indexProjectsForBoardIdentity,
  uniqueProjectIdsFromBoards,
  mapBoardStatsRow,
} = require('../src/services/taskStatistics.boardIdentity');

describe('taskStatistics.boardIdentity', () => {
  it('indexTaskBoardsForDashboard: title + projectId theo board', () => {
    const boardId = 'b'.repeat(24);
    const projectId = 'p'.repeat(24);
    const { titleById, projectIdByBoardId } = indexTaskBoardsForDashboard([
      { _id: boardId, title: 'Main', projectId },
      { _id: 'x'.repeat(24), title: '  ', projectId: null },
    ]);
    assert.equal(titleById.get(boardId), 'Main');
    assert.equal(projectIdByBoardId.get(boardId), projectId);
    assert.equal(titleById.get('x'.repeat(24)), 'x'.repeat(24));
    assert.equal(projectIdByBoardId.has('x'.repeat(24)), false);
  });

  it('indexProjectsForBoardIdentity + uniqueProjectIdsFromBoards', () => {
    const projectId = 'p'.repeat(24);
    const projectById = indexProjectsForBoardIdentity([
      { _id: projectId, title: 'Bán hàng', projectCode: 'BH-01' },
    ]);
    assert.deepEqual(projectById.get(projectId), {
      projectTitle: 'Bán hàng',
      projectCode: 'BH-01',
    });

    const projectIdByBoardId = new Map([
      ['b1', projectId],
      ['b2', projectId],
      ['b3', ''],
    ]);
    assert.deepEqual(uniqueProjectIdsFromBoards(projectIdByBoardId), [projectId]);
  });

  it('mapBoardStatsRow: additive identity; name vẫn là board title', () => {
    const boardId = 'b'.repeat(24);
    const projectId = 'p'.repeat(24);
    const titleById = new Map([[boardId, 'Main']]);
    const projectIdByBoardId = new Map([[boardId, projectId]]);
    const projectById = new Map([
      [projectId, { projectTitle: 'OV Demo', projectCode: 'OV' }],
    ]);

    const out = mapBoardStatsRow(
      { _id: boardId, total: 10, done: 2, open: 8, overdue: 3 },
      titleById,
      projectIdByBoardId,
      projectById
    );

    assert.equal(out.id, boardId);
    assert.equal(out.name, 'Main');
    assert.equal(out.projectId, projectId);
    assert.equal(out.projectTitle, 'OV Demo');
    assert.equal(out.projectCode, 'OV');
    assert.equal(out.overdue, 3);
  });

  it('mapBoardStatsRow: orphan board → field identity rỗng', () => {
    const boardId = 'b'.repeat(24);
    const out = mapBoardStatsRow(
      { _id: boardId, total: 1, done: 0, open: 1, overdue: 0 },
      new Map([[boardId, 'Solo']]),
      new Map(),
      new Map()
    );
    assert.equal(out.name, 'Solo');
    assert.equal(out.projectId, '');
    assert.equal(out.projectTitle, '');
    assert.equal(out.projectCode, '');
  });
});
