const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveActorTier,
  assignableRolesFor,
  canManageTarget,
  evaluateRoleChange,
  evaluateRemoval,
  clampInviteRole,
  isImportRoleAllowed,
} = require('../src/utils/memberRolePolicy');

function change(overrides = {}) {
  return evaluateRoleChange({
    actorTier: 'owner',
    actorUserId: 'actor',
    targetUserId: 'target',
    targetRole: 'member',
    nextRole: 'hr',
    activeOwnerCount: 0,
    ...overrides,
  });
}

describe('memberRolePolicy', () => {
  it('resolveActorTier maps membership role; unknown/member → delegate', () => {
    assert.equal(resolveActorTier('owner'), 'owner');
    assert.equal(resolveActorTier('admin'), 'admin');
    assert.equal(resolveActorTier('hr'), 'hr');
    assert.equal(resolveActorTier('member'), 'delegate');
    assert.equal(resolveActorTier(undefined), 'delegate');
  });

  it('assignable ceiling per tier', () => {
    assert.deepEqual([...assignableRolesFor('owner')], ['member', 'hr', 'admin']);
    assert.deepEqual([...assignableRolesFor('admin')], ['member', 'hr']);
    assert.deepEqual([...assignableRolesFor('delegate')], ['member', 'hr']);
    assert.deepEqual([...assignableRolesFor('hr')], ['member']);
  });

  it('canManageTarget restricts admin/delegate/hr', () => {
    assert.equal(canManageTarget('owner', 'owner'), true);
    assert.equal(canManageTarget('admin', 'admin'), false);
    assert.equal(canManageTarget('admin', 'hr'), true);
    assert.equal(canManageTarget('delegate', 'owner'), false);
    assert.equal(canManageTarget('hr', 'hr'), false);
    assert.equal(canManageTarget('hr', 'member'), true);
  });

  it('self change forbidden (checked first)', () => {
    const out = change({ targetUserId: 'actor', nextRole: 'owner' });
    assert.equal(out.ok, false);
    assert.equal(out.errorCode, 'ORG_SELF_MANAGE_FORBIDDEN');
  });

  it('owner assignment forbidden even for owner tier', () => {
    const out = change({ nextRole: 'owner' });
    assert.equal(out.status, 403);
    assert.equal(out.errorCode, 'ORG_OWNER_ASSIGN_FORBIDDEN');
  });

  it('admin cannot touch admin target nor grant admin', () => {
    assert.equal(change({ actorTier: 'admin', targetRole: 'admin', nextRole: 'member' }).errorCode, 'ORG_TARGET_ROLE_FORBIDDEN');
    assert.equal(change({ actorTier: 'admin', nextRole: 'admin' }).errorCode, 'ORG_ROLE_ASSIGN_FORBIDDEN');
    assert.equal(change({ actorTier: 'admin', nextRole: 'hr' }).ok, true);
  });

  it('hr can only keep member→member; delegate behaves like admin', () => {
    assert.equal(change({ actorTier: 'hr', nextRole: 'hr' }).errorCode, 'ORG_ROLE_ASSIGN_FORBIDDEN');
    assert.equal(change({ actorTier: 'hr', targetRole: 'hr', nextRole: 'member' }).errorCode, 'ORG_TARGET_ROLE_FORBIDDEN');
    assert.equal(change({ actorTier: 'delegate', nextRole: 'admin' }).errorCode, 'ORG_ROLE_ASSIGN_FORBIDDEN');
  });

  it('last owner cannot be demoted; second owner can', () => {
    const last = change({ targetRole: 'owner', nextRole: 'admin', activeOwnerCount: 1 });
    assert.equal(last.status, 409);
    assert.equal(last.errorCode, 'ORG_LAST_OWNER');
    assert.equal(change({ targetRole: 'owner', nextRole: 'admin', activeOwnerCount: 2 }).ok, true);
  });

  it('evaluateRemoval: self, target, last owner', () => {
    const base = { actorTier: 'owner', actorUserId: 'a', targetUserId: 'b', targetRole: 'member', activeOwnerCount: 0 };
    assert.equal(evaluateRemoval({ ...base, targetUserId: 'a' }).errorCode, 'ORG_SELF_MANAGE_FORBIDDEN');
    assert.equal(evaluateRemoval({ ...base, actorTier: 'admin', targetRole: 'owner' }).errorCode, 'ORG_TARGET_ROLE_FORBIDDEN');
    assert.equal(evaluateRemoval({ ...base, targetRole: 'owner', activeOwnerCount: 1 }).errorCode, 'ORG_LAST_OWNER');
    assert.equal(evaluateRemoval({ ...base, targetRole: 'owner', activeOwnerCount: 2 }).ok, true);
    assert.equal(evaluateRemoval(base).ok, true);
  });

  it('clampInviteRole silently downgrades over-ceiling roles', () => {
    assert.equal(clampInviteRole('owner', 'owner'), 'member');
    assert.equal(clampInviteRole('owner', 'admin'), 'admin');
    assert.equal(clampInviteRole('admin', 'admin'), 'member');
    assert.equal(clampInviteRole('admin', 'hr'), 'hr');
    assert.equal(clampInviteRole('hr', 'hr'), 'member');
    assert.equal(clampInviteRole('delegate', 'admin'), 'member');
  });

  it('isImportRoleAllowed follows ceiling and blocks owner', () => {
    assert.equal(isImportRoleAllowed('owner', 'owner'), false);
    assert.equal(isImportRoleAllowed('owner', 'admin'), true);
    assert.equal(isImportRoleAllowed('hr', 'hr'), false);
    assert.equal(isImportRoleAllowed('hr', 'member'), true);
  });
});
