const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  pickAuditFields,
  buildBeforeAfter,
  isProjectAuditV1Enabled,
  createAppendOnlyDeleteError,
} = require('../src/utils/auditSnapshot');
const {
  classifyProjectHealth,
  aggregateDirectorHealth,
} = require('../src/utils/directorHealth');

describe('Phase 6 governance', () => {
  it('T1 shape: before/after field-level snapshot (PATCH project)', () => {
    const before = { title: 'A', status: 'planning', dueDate: null, isActive: true };
    const after = { title: 'B', status: 'in_development', dueDate: '2026-01-01', isActive: true };
    const snap = buildBeforeAfter(before, after, ['title', 'status', 'dueDate']);
    assert.equal(snap.before.title, 'A');
    assert.equal(snap.after.title, 'B');
    assert.equal(snap.after.status, 'in_development');
    assert.deepEqual(pickAuditFields(before, ['title']), { title: 'A' });
  });

  it('T2: user API cannot delete audit (append-only)', () => {
    const err = createAppendOnlyDeleteError();
    assert.equal(err.statusCode, 403);
    assert.equal(err.errorCode, 'AUDIT_APPEND_ONLY');
  });

  it('T3: dashboard counts khớp fixture', () => {
    const asOf = new Date('2026-07-01T00:00:00Z');
    const projects = [
      { _id: '1', title: 'Late', status: 'in_development', dueDate: '2026-06-01', isActive: true },
      { _id: '2', title: 'Ok', status: 'planning', dueDate: '2026-12-01', isActive: true },
      { _id: '3', title: 'Done', status: 'closed', dueDate: '2026-01-01', isActive: true },
      { _id: '4', title: 'Arch', status: 'planning', isActive: false },
    ];
    assert.equal(classifyProjectHealth(projects[0], asOf), 'delayed');
    assert.equal(classifyProjectHealth(projects[1], asOf), 'on_track');
    assert.equal(classifyProjectHealth(projects[2], asOf), 'completed');
    assert.equal(classifyProjectHealth(projects[3], asOf), 'completed');
    const agg = aggregateDirectorHealth(projects, asOf);
    assert.equal(agg.counts.delayed, 1);
    assert.equal(agg.counts.onTrack, 1);
    assert.equal(agg.counts.completed, 2);
    assert.equal(agg.counts.total, 4);
  });

  it('T4: archived classification — inactive counts as completed (list hides by default)', () => {
    const p = { _id: 'x', title: 'Archived', status: 'planning', isActive: false };
    assert.equal(classifyProjectHealth(p), 'completed');
  });

  it('audit flag defaults on', () => {
    assert.equal(typeof isProjectAuditV1Enabled(), 'boolean');
  });
});
