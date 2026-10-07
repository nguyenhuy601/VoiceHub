const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  isValidObjectId,
  collectRequestedOrgIds,
  resolveRoleBoundOrg,
  resolveRequestOrg,
  buildRoleOrgFilter,
  roleOrgIdsFromDoc,
} = require('../src/utils/roleOrgScope');

const OID_A = '507f1f77bcf86cd799439011';
const OID_B = '507f1f77bcf86cd799439012';
const OID_ROLE = '507f191e810c19729de860ea';

describe('roleOrgScope', () => {
  it('isValidObjectId chấp nhận ObjectId 24 hex, từ chối chuỗi ngắn', () => {
    assert.equal(isValidObjectId(OID_A), true);
    assert.equal(isValidObjectId('not-an-id'), false);
    assert.equal(isValidObjectId(''), false);
  });

  it('collectRequestedOrgIds gom distinct từ body/query/params', () => {
    const set = collectRequestedOrgIds({
      body: { organizationId: OID_A, serverId: OID_A },
      query: { organizationId: OID_B },
      params: { serverId: OID_A },
    });
    assert.deepEqual([...set].sort(), [OID_A, OID_B].sort());
  });

  it('resolveRoleBoundOrg: không có org role → 404; mismatch client → 404; khớp → ok', () => {
    assert.equal(resolveRoleBoundOrg({ requestedOrgIds: [OID_A], roleOrgIds: [] }).ok, false);
    const mismatch = resolveRoleBoundOrg({
      requestedOrgIds: new Set([OID_A]),
      roleOrgIds: [OID_B],
    });
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.status, 404);
    assert.equal(mismatch.errorCode, 'ROLE_NOT_FOUND');

    const ok = resolveRoleBoundOrg({
      requestedOrgIds: [OID_B],
      roleOrgIds: [OID_B],
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.organizationId, OID_B);

    const noClient = resolveRoleBoundOrg({
      requestedOrgIds: [],
      roleOrgIds: [OID_B],
    });
    assert.equal(noClient.ok, true);
    assert.equal(noClient.organizationId, OID_B);
  });

  it('resolveRequestOrg: thiếu → 400 ROLE_ORG_REQUIRED; lệch → ROLE_ORG_MISMATCH; một id → ok', () => {
    const missing = resolveRequestOrg({ requestedOrgIds: [] });
    assert.equal(missing.errorCode, 'ROLE_ORG_REQUIRED');
    const mismatch = resolveRequestOrg({ requestedOrgIds: [OID_A, OID_B] });
    assert.equal(mismatch.errorCode, 'ROLE_ORG_MISMATCH');
    const ok = resolveRequestOrg({ requestedOrgIds: new Set([OID_A, OID_A]) });
    assert.equal(ok.ok, true);
    assert.equal(ok.organizationId, OID_A);
  });

  it('buildRoleOrgFilter kèm isActive và $or org', () => {
    const filter = buildRoleOrgFilter(OID_ROLE, OID_A);
    assert.equal(filter._id, OID_ROLE);
    assert.equal(filter.isActive, true);
    assert.deepEqual(filter.$or, [{ organizationId: OID_A }, { serverId: OID_A }]);
  });

  it('roleOrgIdsFromDoc ưu tiên organizationId', () => {
    assert.deepEqual(roleOrgIdsFromDoc({ organizationId: OID_A, serverId: OID_A }), [OID_A]);
    assert.deepEqual(roleOrgIdsFromDoc({ organizationId: OID_A, serverId: OID_B }), [OID_A, OID_B]);
  });
});

describe('roleOrgScope source-contract', () => {
  const root = path.join(__dirname, '..', 'src');

  it('middleware dùng roleOrgScope helpers', () => {
    const mgr = fs.readFileSync(path.join(root, 'middleware', 'requireOrgRoleManager.js'), 'utf8');
    const access = fs.readFileSync(path.join(root, 'middleware', 'requireRoleAccess.js'), 'utf8');
    assert.match(mgr, /resolveRoleBoundOrg|resolveRequestOrg/);
    assert.match(mgr, /collectRequestedOrgIds/);
    assert.match(access, /resolveRoleBoundOrg|collectRequestedOrgIds/);
  });

  it('service getRoleById/updateRole/deleteRole lọc org (không findById trần)', () => {
    const svc = fs.readFileSync(path.join(root, 'services', 'role.service.js'), 'utf8');
    assert.match(svc, /buildRoleOrgFilter|organizationId/);
    assert.match(svc, /async getRoleById\(roleId,\s*organizationId\)/);
    assert.match(svc, /async updateRole\(roleId,\s*organizationId/);
    assert.match(svc, /async deleteRole\(roleId,\s*organizationId/);
    assert.doesNotMatch(svc, /async getRoleById\(roleId\)\s*\{[\s\S]*?Role\.findById\(roleId\)\s*;/);
  });
});
