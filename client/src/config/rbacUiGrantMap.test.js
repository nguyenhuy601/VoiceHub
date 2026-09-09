import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADMIN_NAV_REQUIRED_GRANT,
  RBAC_GRANT,
  canActWithGrant,
  filterAdminNavItemsByGrant,
  navItemIsAllowed,
  parseUserPermissionsPayload,
} from './rbacUiGrantMap.js';

test('team-create maps to organization.team.create', () => {
  assert.equal(ADMIN_NAV_REQUIRED_GRANT['team-create'], RBAC_GRANT.TEAM_CREATE);
  assert.equal(RBAC_GRANT.TEAM_CREATE, 'organization.team.create');
});

test('parseUserPermissionsPayload keeps data array and masterGrants sibling', () => {
  const parsed = parseUserPermissionsPayload({
    data: {
      success: true,
      data: [{ resource: 'organization', actions: ['write'] }],
      masterGrants: ['organization.team.create'],
    },
  });
  assert.equal(parsed.permissions[0].resource, 'organization');
  assert.deepEqual(parsed.masterGrants, ['organization.team.create']);
});

test('parseUserPermissionsPayload reads interceptor-unwrapped body', () => {
  const parsed = parseUserPermissionsPayload({
    success: true,
    data: [{ resource: 'organization', actions: ['write'] }],
    masterGrants: ['organization.team.create'],
  });
  assert.equal(parsed.permissions[0].resource, 'organization');
  assert.deepEqual(parsed.masterGrants, ['organization.team.create']);
});

test('parseUserPermissionsPayload reads nested data.masterGrants payload', () => {
  const parsed = parseUserPermissionsPayload({
    success: true,
    data: {
      permissions: [{ resource: 'organization', actions: ['view'] }],
      masterGrants: ['organization.team.create'],
    },
  });
  assert.equal(parsed.permissions[0].resource, 'organization');
  assert.deepEqual(parsed.masterGrants, ['organization.team.create']);
});

test('parseUserPermissionsPayload keeps TEAM_UPDATE on interceptor-unwrapped body', () => {
  const parsed = parseUserPermissionsPayload({
    success: true,
    data: [{ resource: 'organization', actions: ['write'] }],
    masterGrants: ['organization.team.view', 'organization.team.create', 'organization.team.update'],
  });
  assert.ok(parsed.masterGrants.includes('organization.team.update'));
});

test('parseUserPermissionsPayload derives grants from resource/actions', () => {
  const parsed = parseUserPermissionsPayload({
    success: true,
    data: [
      { resource: 'organization.team', actions: ['view', 'create'] },
      { resource: 'communication.channel', actions: ['update'] },
    ],
  });
  assert.ok(parsed.masterGrants.includes('organization.team.view'));
  assert.ok(parsed.masterGrants.includes('organization.team.create'));
  assert.ok(parsed.masterGrants.includes('communication.channel.update'));
});

test('nav filter hides team-create without grant unless full access', () => {
  const items = [
    { id: 'team-list' },
    { id: 'team-create', requiredGrant: RBAC_GRANT.TEAM_CREATE },
  ];
  const hasGrant = (k) => k === RBAC_GRANT.TEAM_VIEW;
  const filtered = filterAdminNavItemsByGrant(items, { isFullAccess: false, hasGrant });
  assert.deepEqual(
    filtered.map((i) => i.id),
    ['team-list']
  );
  assert.equal(navItemIsAllowed(items[1], { isFullAccess: true, hasGrant }), true);
  assert.equal(
    navItemIsAllowed(items[1], {
      isFullAccess: false,
      hasGrant: (k) => k === RBAC_GRANT.TEAM_CREATE,
    }),
    true
  );
});

test('canActWithGrant bypasses for full access', () => {
  assert.equal(canActWithGrant(true, () => false, RBAC_GRANT.TEAM_CREATE), true);
  assert.equal(canActWithGrant(false, () => false, RBAC_GRANT.TEAM_CREATE), false);
  assert.equal(canActWithGrant(false, (k) => k === RBAC_GRANT.TEAM_CREATE, RBAC_GRANT.TEAM_CREATE), true);
  assert.equal(canActWithGrant(false, () => true, ''), false);
  assert.equal(canActWithGrant(true, () => false, ''), true);
});

test('channel.view is a mapped grant', () => {
  assert.equal(RBAC_GRANT.CHANNEL_VIEW, 'communication.channel.view');
});
