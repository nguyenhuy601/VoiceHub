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
const {
  hasDirectorOrAuditorRole,
  membershipIsOrgAdmin,
  buildActiveProjectsFilter,
} = require('../src/utils/governanceAccess');

describe('Phase 6 governance T1–T6', () => {
  it('T1: PATCH project audit shape — before/after field-level', () => {
    const before = { title: 'A', status: 'planning', dueDate: null, isActive: true };
    const after = { title: 'B', status: 'in_development', dueDate: '2026-01-01', isActive: true };
    const snap = buildBeforeAfter(before, after, ['title', 'status', 'dueDate']);
    assert.equal(snap.before.title, 'A');
    assert.equal(snap.after.title, 'B');
    assert.equal(snap.after.status, 'in_development');
    assert.deepEqual(pickAuditFields(before, ['title']), { title: 'A' });
  });

  it('T2: master_data enabled patch audit shape (old/new flags)', () => {
    const before = {
      companySize: 'startup',
      enabledOrganizationRoleKeys: ['director'],
      enabledProjectRoleKeys: ['project_manager'],
    };
    const after = {
      companySize: 'startup',
      enabledOrganizationRoleKeys: ['director', 'auditor'],
      enabledProjectRoleKeys: ['project_manager'],
    };
    const snap = buildBeforeAfter(before, after, [
      'companySize',
      'enabledOrganizationRoleKeys',
      'enabledProjectRoleKeys',
    ]);
    assert.deepEqual(snap.before.enabledOrganizationRoleKeys, ['director']);
    assert.deepEqual(snap.after.enabledOrganizationRoleKeys, ['director', 'auditor']);
    assert.equal(snap.before.companySize, snap.after.companySize);
  });

  it('T3: user API cannot delete audit (append-only)', () => {
    const err = createAppendOnlyDeleteError();
    assert.equal(err.statusCode, 403);
    assert.equal(err.errorCode, 'AUDIT_APPEND_ONLY');
  });

  it('T4: dashboard counts khớp fixture', () => {
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
    assert.equal(agg.budget.enabled, false);
  });

  it('T5: auditor/director gate policy; member thường forbidden', () => {
    assert.equal(membershipIsOrgAdmin('admin'), true);
    assert.equal(membershipIsOrgAdmin('member'), false);
    assert.equal(hasDirectorOrAuditorRole(['auditor']), true);
    assert.equal(hasDirectorOrAuditorRole(['director']), true);
    assert.equal(hasDirectorOrAuditorRole(['organization_administrator']), true);
    assert.equal(hasDirectorOrAuditorRole(['collaborator']), false);
    assert.equal(hasDirectorOrAuditorRole([]), false);
  });

  it('T6: archive ẩn default list (isActive filter)', () => {
    const defaultQ = buildActiveProjectsFilter('org1', { includeArchived: false });
    assert.equal(defaultQ.isActive, true);
    const withArch = buildActiveProjectsFilter('org1', { includeArchived: true });
    assert.equal(withArch.isActive, undefined);
    assert.equal(classifyProjectHealth({ isActive: false, status: 'planning' }), 'completed');
  });

  it('audit flag is boolean', () => {
    assert.equal(typeof isProjectAuditV1Enabled(), 'boolean');
  });
});
