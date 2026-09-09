import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectTeamMemberIds,
  filterAddTeamMemberCandidates,
  filterMembersForTeam,
  isMemberInTeam,
} from './filterTeamMembers.js';

test('collectTeamMemberIds includes members and leader', () => {
  const ids = collectTeamMemberIds({
    leader: 'lead-1',
    members: ['u1', { _id: 'u2' }, { userId: 'u3' }],
  });
  assert.deepEqual([...ids].sort(), ['lead-1', 'u1', 'u2', 'u3']);
});

test('no teamId keeps the full list', () => {
  const rows = [{ userId: 'a' }, { userId: 'b' }];
  assert.equal(filterMembersForTeam(rows, '', null).length, 2);
  assert.equal(filterMembersForTeam(rows, null, null).length, 2);
});

test('matches placement teamId on member or raw', () => {
  assert.equal(
    isMemberInTeam({ userId: 'a', teamId: 't1' }, 't1', { members: [] }),
    true
  );
  assert.equal(
    isMemberInTeam({ userId: 'b', raw: { team: 't1' } }, 't1', { members: [] }),
    true
  );
  assert.equal(
    isMemberInTeam({ userId: 'c', teamId: 'other' }, 't1', { members: [] }),
    false
  );
});

test('falls back to Team.members / leader ids', () => {
  const team = { members: ['u1', { id: 'u2' }], leader: 'lead-1' };
  assert.equal(isMemberInTeam({ userId: 'u1' }, 't1', team), true);
  assert.equal(isMemberInTeam({ userId: 'lead-1' }, 't1', team), true);
  assert.equal(isMemberInTeam({ userId: 'outsider' }, 't1', team), false);
});

test('filterMembersForTeam keeps only team roster', () => {
  const team = { members: ['u2'] };
  const rows = [
    { userId: 'u1', teamId: 't1' },
    { userId: 'u2' },
    { userId: 'u3', teamId: 't9' },
  ];
  const filtered = filterMembersForTeam(rows, 't1', team);
  assert.deepEqual(
    filtered.map((r) => r.userId).sort(),
    ['u1', 'u2']
  );
});

test('filterAddTeamMemberCandidates keeps same dept not already in team', () => {
  const team = { department: 'dep-be', members: ['u-in'] };
  const rows = [
    { userId: 'u-in', departmentId: 'dep-be' },
    { userId: 'u-be', departmentId: 'dep-be' },
    { userId: 'u-qa', departmentId: 'dep-qa' },
    { userId: 'u-raw', raw: { department: 'dep-be' } },
    { userId: '' },
  ];
  const filtered = filterAddTeamMemberCandidates(rows, 't1', team);
  assert.deepEqual(
    filtered.map((r) => r.userId).sort(),
    ['u-be', 'u-raw']
  );
});

test('filterAddTeamMemberCandidates without team dept keeps org-wide not in team', () => {
  const team = { members: ['u1'] };
  const rows = [
    { userId: 'u1', departmentId: 'dep-be' },
    { userId: 'u2', departmentId: 'dep-qa' },
  ];
  const filtered = filterAddTeamMemberCandidates(rows, 't1', team);
  assert.deepEqual(
    filtered.map((r) => r.userId),
    ['u2']
  );
});
