const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildProjectDraft,
  buildTeamAssignSuggestions,
  inferResponsibilityKeyFromText,
} = require('../src/services/aiBoardDraft.builder');

describe('aiBoardDraft.builder', () => {
  it('builds project draft with status + team lists', () => {
    const d = buildProjectDraft({
      brief: 'HĐ Q2 Module đăng nhập. Hạn cuối tháng.',
      teams: [{ _id: '1', name: 'Dev' }, { _id: '2', name: 'QA' }],
    });
    assert.ok(d.title);
    assert.ok(d.projectCode);
    assert.ok(d.lists.some((l) => l.title === 'Xong'));
    assert.ok(d.lists.some((l) => l.title === 'Team Dev'));
    assert.ok(d.lists.some((l) => l.title === 'Team QA'));
  });

  it('builds team assign suggestions with assignees', () => {
    const rows = buildTeamAssignSuggestions({
      listTitle: 'Team Dev',
      boardTitle: 'PRJ',
      members: [{ userId: 'aaaaaaaaaaaaaaaaaaaaaaaa', displayName: 'NV1' }],
      maxCards: 3,
    });
    assert.equal(rows.length, 3);
    assert.equal(rows[0].assigneeId, 'aaaaaaaaaaaaaaaaaaaaaaaa');
    assert.ok(rows[0].dueDate);
  });

  it('prefers Responsibility-suggested members (Excel primaryDomain → product)', () => {
    const huy = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const other = 'cccccccccccccccccccccccc';
    const rows = buildTeamAssignSuggestions({
      listTitle: 'Team Product',
      boardTitle: 'VoiceHub Mobile',
      members: [
        { userId: other, displayName: 'Dev khác', suggested: false },
        { userId: huy, displayName: 'Nguyễn Huy', suggested: true },
      ],
      maxCards: 3,
    });
    assert.ok(rows.every((r) => r.assigneeId === huy));
  });

  it('infers responsibility key from list/brief (ba/scrum → product)', () => {
    assert.equal(inferResponsibilityKeyFromText('Team Product'), 'product');
    assert.equal(inferResponsibilityKeyFromText('Scrum / BA onboard'), 'product');
    assert.equal(inferResponsibilityKeyFromText('Team Backend'), 'backend');
    assert.equal(inferResponsibilityKeyFromText('Dự án chung'), '');
  });
});
