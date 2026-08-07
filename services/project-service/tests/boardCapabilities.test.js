const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isDoneListTitle,
  buildBoardCapabilities,
} = require('../src/services/boardCapabilities');

describe('boardCapabilities', () => {
  it('detects done list titles', () => {
    assert.equal(isDoneListTitle('Xong'), true);
    assert.equal(isDoneListTitle('Done'), true);
    assert.equal(isDoneListTitle('Chờ duyệt'), false);
    assert.equal(isDoneListTitle('Chưa làm'), false);
  });

  it('NV in scope viewer-only: view, no move without edit (P2.1)', () => {
    const caps = buildBoardCapabilities({
      inWorkspaceScope: true,
      memberCanView: true,
      canCreateTask: false,
    });
    assert.equal(caps.canView, true);
    assert.equal(caps.canMoveCards, false);
    assert.equal(caps.canCreateCards, false);
    assert.equal(caps.canManageLists, false);
    assert.equal(caps.canMoveToDone, false);
    assert.equal(caps.canManageBoard, false);
    assert.equal(caps.canUseAiConfirm, false);
  });

  it('NV with memberCanEdit: can move cards', () => {
    const caps = buildBoardCapabilities({
      inWorkspaceScope: true,
      memberCanView: true,
      memberCanEdit: true,
      canCreateTask: false,
    });
    assert.equal(caps.canMoveCards, true);
  });

  it('PM/TL with canCreateTask: manage lists, cards, done', () => {
    const caps = buildBoardCapabilities({
      canCreateTask: true,
      inWorkspaceScope: true,
    });
    assert.equal(caps.canCreateCards, true);
    assert.equal(caps.canManageLists, true);
    assert.equal(caps.canMoveToDone, true);
    assert.equal(caps.canUseAiConfirm, true);
    assert.equal(caps.canManageBoard, false);
  });

  it('creator can manage board', () => {
    const caps = buildBoardCapabilities({ isCreator: true });
    assert.equal(caps.canManageBoard, true);
    assert.equal(caps.canCreateCards, true);
  });
});
