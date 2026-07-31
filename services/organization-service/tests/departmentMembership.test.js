const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  planSetMembers,
  planSetHead,
  planRemoveMember,
} = require('../src/services/departmentMembership.service');

function dept(id, members, head = null) {
  return { _id: id, members, head };
}

describe('departmentMembership planners', () => {
  it('T1: moving user from dept A to B removes from A and clears head on A if needed', () => {
    const depts = [dept('A', ['u1', 'u2'], 'u1'), dept('B', ['u3'], null)];
    const patches = planSetMembers(depts, 'B', ['u3', 'u1']);
    const byId = Object.fromEntries(patches.map((p) => [p.deptId, p]));
    assert.deepEqual(byId.B.members.sort(), ['u1', 'u3'].sort());
    assert.deepEqual(byId.A.members, ['u2']);
    assert.equal(byId.A.head, null);
  });

  it('T2: setHead auto-adds user to members', () => {
    const depts = [dept('A', ['u2'], null)];
    const patches = planSetHead(depts, 'A', 'u1');
    assert.equal(patches.length, 1);
    assert.equal(patches[0].head, 'u1');
    assert.ok(patches[0].members.includes('u1'));
    assert.ok(patches[0].members.includes('u2'));
  });

  it('T3: removeMember while head throws 409', () => {
    const depts = [dept('A', ['u1', 'u2'], 'u1')];
    assert.throws(
      () => planRemoveMember(depts, 'A', 'u1'),
      (err) => err.statusCode === 409 && err.errorCode === 'DEPT_HEAD_MUST_REASSIGN'
    );
  });

  it('T3b: setMembers omitting current head throws 409', () => {
    const depts = [dept('A', ['u1', 'u2'], 'u1')];
    assert.throws(
      () => planSetMembers(depts, 'A', ['u2']),
      (err) => err.statusCode === 409 && err.errorCode === 'DEPT_HEAD_MUST_REASSIGN'
    );
  });

  it('T4: setHead clears head on other department for same user', () => {
    const depts = [dept('A', ['u1'], 'u1'), dept('B', ['u2'], null)];
    const patches = planSetHead(depts, 'B', 'u1');
    const byId = Object.fromEntries(patches.map((p) => [p.deptId, p]));
    assert.equal(byId.B.head, 'u1');
    assert.ok(byId.B.members.includes('u1'));
    assert.equal(byId.A.head, null);
  });

  it('T5: merge add onto incomplete FE list still keeps head via full nextIds', () => {
    // Simulate addMembers: next = current members + head + new user (even if FE had [])
    const depts = [dept('B', ['u-head'], 'u-head')];
    const nextFromAdd = ['u-head', 'u-new'];
    const patches = planSetMembers(depts, 'B', nextFromAdd);
    assert.deepEqual(patches[0].members.sort(), ['u-head', 'u-new'].sort());
    assert.equal(patches[0].head, 'u-head');
  });
});
