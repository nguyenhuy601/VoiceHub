const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  extractAssigneeHints,
  resolveHint,
  buildMemberDirectory,
  applyAssigneeResolution,
} = require('../src/utils/planning/planningAssigneeResolve');

describe('planningAssigneeResolve', () => {
  const members = [
    { userId: 'u1', email: 'alice@voicehub.local', displayName: 'Alice Nguyen' },
    { userId: 'u2', email: 'bob@voicehub.local', displayName: 'Bob' },
    { userId: 'u3', email: 'twin@voicehub.local', displayName: 'Sam' },
    { userId: 'u4', email: 'other@voicehub.local', displayName: 'Sam' },
  ];

  it('extracts hints from structured + top-level', () => {
    const hints = extractAssigneeHints({
      assigneeEmail: 'a@x.com',
      structured: { assigneeName: 'Alice' },
    });
    assert.ok(hints.includes('a@x.com'));
    assert.ok(hints.includes('Alice'));
  });

  it('matches by email and name', () => {
    const dir = buildMemberDirectory(members);
    assert.equal(resolveHint('alice@voicehub.local', dir).status, 'matched');
    assert.equal(resolveHint('Alice Nguyen', dir).userId, 'u1');
    assert.equal(resolveHint('nobody@x.com', dir).status, 'unresolved');
    assert.equal(resolveHint('Sam', dir).status, 'ambiguous');
  });

  it('applies assigneeUserId on matched dump rows', () => {
    const rows = [
      {
        kind: 'WBS',
        externalKey: 'WBS-1',
        structured: { assigneeEmail: 'bob@voicehub.local' },
      },
      {
        kind: 'WBS',
        externalKey: 'WBS-2',
        structured: { assigneeName: 'Ghost User' },
      },
    ];
    const report = applyAssigneeResolution(rows, members);
    assert.equal(rows[0].structured.assigneeUserId, 'u2');
    assert.equal(report.summary.matched, 1);
    assert.equal(report.summary.unresolved, 1);
  });
});
