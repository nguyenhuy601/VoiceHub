const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  collectTrustedAssigneeIds,
  resolveTeamAssignAssigneeId,
  normalizeTeamAssignItems,
} = require('../src/utils/teamAssignAssignee');

const TRUSTED = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const EVIL = 'bbbbbbbbbbbbbbbbbbbbbbbb';

describe('teamAssignAssignee', () => {
  it('collects ids from suggestions and members', () => {
    const set = collectTrustedAssigneeIds({
      suggestions: [{ assigneeId: TRUSTED }],
      members: [{ userId: 'cccccccccccccccccccccccc' }],
    });
    assert.equal(set.has(TRUSTED), true);
    assert.equal(set.has('cccccccccccccccccccccccc'), true);
  });

  it('rejects untrusted assignee', () => {
    const set = collectTrustedAssigneeIds({ suggestions: [{ assigneeId: TRUSTED }] });
    assert.equal(resolveTeamAssignAssigneeId(EVIL, set), undefined);
    assert.equal(resolveTeamAssignAssigneeId(TRUSTED, set), TRUSTED);
  });

  it('normalize drops evil assignee from body items', () => {
    const items = normalizeTeamAssignItems(
      [{ title: 'Card', assigneeId: EVIL }],
      { suggestions: [{ title: 'Card', assigneeId: TRUSTED }], members: [{ userId: TRUSTED }] }
    );
    assert.equal(items[0].assigneeId, undefined);
    assert.equal(items[0].title, 'Card');
  });
});
