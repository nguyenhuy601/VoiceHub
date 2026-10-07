const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pickSprintBoardId } = require('../src/utils/project/sprintBoardScope');

const projectId = '64b0000000000000000000aa';
const ownBoard = '64b0000000000000000000bb';
const otherBoard = '64b0000000000000000000cc';
const defaultBoardId = '64b0000000000000000000dd';

describe('pickSprintBoardId', () => {
  it('keeps a board that belongs to the authorized project', () => {
    const picked = pickSprintBoardId({
      requestedBoardId: ownBoard,
      projectId,
      defaultBoardId,
      foundBoard: { _id: ownBoard, projectId, isActive: true },
    });
    assert.equal(picked, ownBoard);
  });

  it('falls back when the board belongs to another project', () => {
    const picked = pickSprintBoardId({
      requestedBoardId: otherBoard,
      projectId,
      defaultBoardId,
      foundBoard: { _id: otherBoard, projectId: '64b0000000000000000000ee', isActive: true },
    });
    assert.equal(picked, defaultBoardId);
  });

  it('falls back when the lookup missed or the id is not a string', () => {
    assert.equal(
      pickSprintBoardId({
        requestedBoardId: otherBoard,
        projectId,
        defaultBoardId,
        foundBoard: null,
      }),
      defaultBoardId
    );
    assert.equal(
      pickSprintBoardId({
        requestedBoardId: { $ne: null },
        projectId,
        defaultBoardId,
        foundBoard: { _id: ownBoard, projectId, isActive: true },
      }),
      defaultBoardId
    );
  });
});

describe('createProjectSprint board lookup', () => {
  it('loads the board with the authorized projectId before creating the sprint', () => {
    const src = fs
      .readFileSync(path.join(__dirname, '../src/services/project.service.js'), 'utf8')
      .replace(/\r\n/g, '\n');
    const start = src.indexOf('async function createProjectSprint');
    const next = src.indexOf('async function patchProjectSprint', start);
    const body = src.slice(start, next);
    const lookup = body.indexOf('TaskBoard.findOne');
    const create = body.indexOf('Sprint.create');
    assert.ok(lookup >= 0 && create > lookup);
    assert.ok(body.includes('projectId,'));
    assert.ok(body.includes('pickSprintBoardId'));
    assert.equal(body.includes('let bid = boardId'), false);
  });
});
