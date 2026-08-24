const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveProjectChannelPermissions,
  isProjectScopedChannel,
  serializeProjectChannel,
} = require('../src/utils/projectChannelAcl');

describe('projectChannelAcl', () => {
  it('org channel is not project-scoped', () => {
    assert.equal(isProjectScopedChannel({ name: 'general', department: 'd1' }), false);
    assert.equal(resolveProjectChannelPermissions({ channel: { name: 'general' } }), null);
  });

  it('hides project channel when not a project member', () => {
    const perms = resolveProjectChannelPermissions({
      channel: { projectId: 'p1', projectChannelKind: 'general', type: 'chat' },
      userId: 'u1',
      isProjectMember: false,
      isInOrgTeam: false,
    });
    assert.equal(perms.canSee, false);
    assert.equal(perms.canRead, false);
    assert.equal(perms.canWrite, false);
  });

  it('general: project member can read and write', () => {
    const perms = resolveProjectChannelPermissions({
      channel: { projectId: 'p1', projectChannelKind: 'general', type: 'chat' },
      userId: 'u1',
      isProjectMember: true,
      isInOrgTeam: false,
    });
    assert.equal(perms.canSee, true);
    assert.equal(perms.canRead, true);
    assert.equal(perms.canWrite, true);
  });

  it('announcement: member reads; only leader/members write', () => {
    const ch = {
      projectId: 'p1',
      projectChannelKind: 'announcement',
      type: 'announcement',
      leader: 'pm1',
      members: ['sm1'],
    };
    const reader = resolveProjectChannelPermissions({
      channel: ch,
      userId: 'dev1',
      isProjectMember: true,
      isInOrgTeam: false,
    });
    assert.equal(reader.canRead, true);
    assert.equal(reader.canWrite, false);

    const pm = resolveProjectChannelPermissions({
      channel: ch,
      userId: 'pm1',
      isProjectMember: true,
      isInOrgTeam: false,
    });
    assert.equal(pm.canWrite, true);
  });

  it('team kind requires org team membership', () => {
    const ch = { projectId: 'p1', projectChannelKind: 'team', team: 't-be', type: 'chat' };
    const outsider = resolveProjectChannelPermissions({
      channel: ch,
      userId: 'fe1',
      isProjectMember: true,
      isInOrgTeam: false,
    });
    assert.equal(outsider.canSee, false);

    const insider = resolveProjectChannelPermissions({
      channel: ch,
      userId: 'be1',
      isProjectMember: true,
      isInOrgTeam: true,
    });
    assert.equal(insider.canSee, true);
    assert.equal(insider.canWrite, true);
  });

  it('cross_team: project member can read and write', () => {
    const perms = resolveProjectChannelPermissions({
      channel: { projectId: 'p1', projectChannelKind: 'cross_team', type: 'chat' },
      userId: 'u1',
      isProjectMember: true,
      isInOrgTeam: false,
    });
    assert.equal(perms.canSee, true);
    assert.equal(perms.canRead, true);
    assert.equal(perms.canWrite, true);
  });

  it('serializes FE payload without work names', () => {
    const row = serializeProjectChannel({
      _id: 'c1',
      name: 'general',
      type: 'chat',
      projectId: 'p1',
      projectChannelKind: 'general',
      projectName: 'Coffee',
    });
    assert.equal(row.projectId, 'p1');
    assert.equal(row.name, 'general');
    assert.equal(row.projectName, 'Coffee');
  });
});
