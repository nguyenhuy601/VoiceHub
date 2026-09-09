const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROUTES_PATH = path.join(
  __dirname,
  '../src/routes/internalOrganization.routes.js'
);
const CONTROLLER_PATH = path.join(
  __dirname,
  '../src/controllers/internalOrganization.controller.js'
);

/** Path strings S2S callers depend on — must stay on the router (R2: no URL change). */
const S2S_PATHS = [
  '/voice-channel-access/:organizationId/:userId/:channelId',
  '/membership/:organizationId/:userId',
  '/memberships/:organizationId',
  '/org/:organizationId/summary',
  '/ai-task-context',
  '/sync-membership-placement',
  '/sync-membership-placement-org',
  '/backfill-role-scope-assignments',
  '/sync-hierarchy-roles',
  '/ensure-membership',
  '/transfer-owner',
  '/organizations',
  '/purge-organization',
  '/purge-all-organizations',
  '/organizations/:organizationId/users/:userId/project-visibility-context',
  '/organizations/:organizationId/requirement-access-policy',
  '/organizations/:organizationId/master-data/enabled-project-roles',
  '/organizations/:organizationId/master-data/enabled-positions',
  '/organizations/:orgId/departments/roster',
  '/organizations/:orgId/users/:userId/placement',
  '/project-workgroup-channel',
  '/project-channel/:organizationId/:projectId',
  '/project-workgroup-channel/:channelId/members',
];

describe('internalOrganization routes contract (R2)', () => {
  it('keeps every S2S path on the router file', () => {
    const src = fs.readFileSync(ROUTES_PATH, 'utf8');
    for (const p of S2S_PATHS) {
      assert.ok(src.includes(`'${p}'`), `missing path ${p}`);
    }
  });

  it('does not inline async (req, res) handlers on the router', () => {
    const src = fs.readFileSync(ROUTES_PATH, 'utf8');
    assert.equal(
      /async\s*\(\s*req\s*,\s*res\s*\)/.test(src),
      false,
      'routes must delegate to controllers'
    );
  });

  it('defines named controller handlers used by the router', () => {
    const src = fs.readFileSync(CONTROLLER_PATH, 'utf8');
    const required = [
      'getVoiceChannelAccess',
      'getMembershipRole',
      'listActiveMemberships',
      'getOrgSummary',
      'postAiTaskContext',
      'syncMembershipPlacement',
      'syncMembershipPlacementOrg',
      'backfillRoleScopeAssignments',
      'syncHierarchyRolesInternal',
      'ensureMembership',
      'transferOwner',
      'listOrganizationsInternal',
      'purgeOrganization',
      'purgeAllOrganizations',
      'getEnabledProjectRoles',
      'getEnabledPositions',
      'getDepartmentRoster',
      'getUserPlacement',
      'createProjectWorkgroupChannel',
      'getProjectChannel',
      'updateProjectWorkgroupMembers',
    ];
    for (const name of required) {
      assert.ok(src.includes(`async function ${name}`), `missing handler ${name}`);
      assert.ok(src.includes(`  ${name},`), `missing export ${name}`);
    }
  });
});
