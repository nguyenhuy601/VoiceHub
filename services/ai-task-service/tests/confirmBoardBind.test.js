const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveConfirmBoardTargets } = require('../src/utils/confirmBoardBind');

const BID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const LID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const TID = 'cccccccccccccccccccccccc';

describe('resolveConfirmBoardTargets', () => {
  it('allows omit board/list (personal task path)', () => {
    const out = resolveConfirmBoardTargets({}, { draft: {} });
    assert.equal(out.ok, true);
    assert.equal(out.boardId, undefined);
  });

  it('rejects partial/invalid board+list', () => {
    const out = resolveConfirmBoardTargets({ boardId: BID, listId: 'nope' }, { draft: {} });
    assert.equal(out.ok, false);
    assert.equal(out.errorCode, 'AI_CONFIRM_BOARD_INVALID');
  });

  it('accepts valid board+list', () => {
    const out = resolveConfirmBoardTargets({ boardId: BID, listId: LID }, { draft: {} });
    assert.equal(out.ok, true);
    assert.equal(out.boardId, BID);
    assert.equal(out.listId, LID);
  });

  it('rejects ownerTeamId mismatch vs draft', () => {
    const out = resolveConfirmBoardTargets(
      { ownerTeamId: TID },
      { draft: { teamId: BID } }
    );
    assert.equal(out.ok, false);
    assert.equal(out.errorCode, 'AI_CONFIRM_OWNER_TEAM_MISMATCH');
  });

  it('accepts matching ownerTeamId', () => {
    const out = resolveConfirmBoardTargets(
      { ownerTeamId: TID },
      { draft: { ownerTeamId: TID } }
    );
    assert.equal(out.ok, true);
    assert.equal(out.ownerTeamId, TID);
  });
});
