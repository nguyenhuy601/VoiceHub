const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { decideAssign } = require('../src/services/assignmentDecide');

describe('decideAssign', () => {
  it('thiếu role → deny', () => {
    const r = decideAssign({
      actorRoles: [{ key: 'project_manager', canAssign: true }],
      targetRoles: [],
      actorCanAssign: true,
      edgeCount: 0,
    });
    assert.equal(r.ok, false);
    assert.match(r.message, /Project Team/);
  });

  it('actor không canAssign → deny', () => {
    const r = decideAssign({
      actorRoles: [{ key: 'developer', label: 'Dev', canAssign: false }],
      targetRoles: [{ key: 'developer', label: 'Dev' }],
      actorCanAssign: false,
      edgeCount: 0,
    });
    assert.equal(r.ok, false);
    assert.match(r.message, /không có quyền Assign/);
  });

  it('graph rỗng + canAssign → allow', () => {
    const r = decideAssign({
      actorRoles: [{ key: 'project_manager', canAssign: true }],
      targetRoles: [{ key: 'developer' }],
      actorCanAssign: true,
      edgeCount: 0,
      hasEdge: false,
    });
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'same_project_no_delegation_graph');
  });

  it('canAssign + graph không có cạnh (SM → DevOps) → allow', () => {
    const r = decideAssign({
      actorRoles: [{ key: 'scrum_master', label: 'Dự án — Scrum Master', canAssign: true }],
      targetRoles: [{ key: 'devops_engineer', label: 'Dự án — DevOps Engineer' }],
      actorCanAssign: true,
      edgeCount: 14,
      hasEdge: false,
    });
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'same_project_can_assign');
  });

  it('không canAssign + có graph nhưng không cạnh → deny', () => {
    const r = decideAssign({
      actorRoles: [{ key: 'backend_developer', label: 'Dev', canAssign: false }],
      targetRoles: [{ key: 'project_manager', label: 'PM' }],
      actorCanAssign: false,
      edgeCount: 3,
      hasEdge: false,
    });
    assert.equal(r.ok, false);
    assert.match(r.message, /không có quyền Assign/);
  });

  it('có cạnh → allow', () => {
    const r = decideAssign({
      actorRoles: [{ key: 'project_manager', canAssign: true }],
      targetRoles: [{ key: 'developer' }],
      actorCanAssign: true,
      edgeCount: 2,
      hasEdge: true,
    });
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'delegation_edge');
  });

  it('không canAssign nhưng có cạnh → allow', () => {
    const r = decideAssign({
      actorRoles: [{ key: 'qa_engineer', label: 'QA' }],
      targetRoles: [{ key: 'backend_developer', label: 'BE' }],
      actorCanAssign: false,
      edgeCount: 3,
      hasEdge: true,
    });
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'delegation_edge');
  });
});
