const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  collectSprintMemberIds,
  intersectionUserIds,
  findOverlappingActiveSprint,
} = require('../src/utils/sprintMemberOverlap');

describe('sprintMemberOverlap', () => {
  it('T1: disjoint member sets → no overlap', () => {
    const a = collectSprintMemberIds([
      { assigneeId: 'A' },
      { assigneeId: 'B', assignments: [{ userId: 'C' }] },
    ]);
    const b = collectSprintMemberIds([
      { assigneeId: 'D' },
      { assignments: [{ userId: 'E' }, { userId: 'F' }] },
    ]);
    assert.deepEqual([...a].sort(), ['A', 'B', 'C'].sort());
    assert.deepEqual([...b].sort(), ['D', 'E', 'F'].sort());
    assert.equal(
      findOverlappingActiveSprint({
        candidateSprintId: 's2',
        candidateMemberIds: b,
        activeSprintsWithMembers: [{ sprintId: 's1', memberIds: a }],
      }),
      null
    );
  });

  it('T2: shared member → overlap', () => {
    const overlap = findOverlappingActiveSprint({
      candidateSprintId: 's2',
      candidateMemberIds: ['A', 'D'],
      activeSprintsWithMembers: [{ sprintId: 's1', memberIds: ['A', 'B', 'C'] }],
    });
    assert.ok(overlap);
    assert.equal(overlap.sprintId, 's1');
    assert.deepEqual(overlap.overlappingUserIds, ['A']);
  });

  it('T3: no other active → allow', () => {
    assert.equal(
      findOverlappingActiveSprint({
        candidateSprintId: 's1',
        candidateMemberIds: ['A'],
        activeSprintsWithMembers: [],
      }),
      null
    );
  });

  it('T4: empty candidate members ∩ active → allow', () => {
    assert.equal(
      findOverlappingActiveSprint({
        candidateSprintId: 's2',
        candidateMemberIds: [],
        activeSprintsWithMembers: [{ sprintId: 's1', memberIds: ['A'] }],
      }),
      null
    );
  });

  it('intersectionUserIds returns shared ids', () => {
    assert.deepEqual(intersectionUserIds(['A', 'B'], new Set(['B', 'C'])), ['B']);
    assert.deepEqual(intersectionUserIds([], ['A']), []);
  });

  it('collectSprintMemberIds ignores blank ids', () => {
    const ids = collectSprintMemberIds([
      { assigneeId: null, assignments: [{ userId: '' }, { userId: 'u1' }] },
    ]);
    assert.deepEqual([...ids], ['u1']);
  });
});
