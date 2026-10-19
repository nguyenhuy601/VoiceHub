import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canActAdmin, RBAC_GRANT } from './rbacUiGrantMap.js';

function grantsOf(map) {
  const normalized = {};
  for (const [k, v] of Object.entries(map || {})) {
    normalized[String(k).toLowerCase()] = v;
  }
  return {
    hasGrant: (key) => Object.prototype.hasOwnProperty.call(normalized, String(key || '').toLowerCase()),
    scopeOf: (key) => normalized[String(key || '').toLowerCase()] || null,
  };
}

describe('canActAdmin', () => {
  it('systemAdmin: maintain keys true; invite/delete/lock false', () => {
    const ctx = { ...grantsOf({}), isSystemAdmin: true };
    assert.equal(canActAdmin(RBAC_GRANT.EMPLOYEE_VIEW, ctx), true);
    assert.equal(canActAdmin(RBAC_GRANT.ORG_ROLE_UPDATE, ctx), true);
    assert.equal(canActAdmin(RBAC_GRANT.POSITION_CREATE, ctx), true);
    assert.equal(canActAdmin(RBAC_GRANT.STRUCTURE_VIEW, ctx), true);
    assert.equal(canActAdmin(RBAC_GRANT.MASTER_DATA_VIEW, ctx), true);
    assert.equal(canActAdmin(RBAC_GRANT.MASTER_DATA_UPDATE, ctx), true);
    assert.equal(canActAdmin(RBAC_GRANT.EMPLOYEE_INVITE, ctx), false);
    assert.equal(canActAdmin(RBAC_GRANT.EMPLOYEE_DELETE, ctx), false);
    assert.equal(canActAdmin(RBAC_GRANT.EMPLOYEE_DISABLE, ctx), false);
    assert.equal(canActAdmin(RBAC_GRANT.EMPLOYEE_RESET_PASSWORD, ctx), false);
    assert.equal(canActAdmin(RBAC_GRANT.DEPT_CREATE, ctx), false);
  });

  it('member with invite grant: invite true, delete false', () => {
    const ctx = {
      ...grantsOf({
        [RBAC_GRANT.EMPLOYEE_VIEW]: 'ORGANIZATION',
        [RBAC_GRANT.EMPLOYEE_INVITE]: 'ORGANIZATION',
      }),
      isSystemAdmin: false,
    };
    assert.equal(canActAdmin(RBAC_GRANT.EMPLOYEE_INVITE, ctx), true);
    assert.equal(canActAdmin(RBAC_GRANT.EMPLOYEE_DELETE, ctx), false);
  });

  it('SELF scope không mở CTA admin', () => {
    const ctx = {
      ...grantsOf({ [RBAC_GRANT.EMPLOYEE_UPDATE]: 'SELF' }),
      isSystemAdmin: false,
    };
    assert.equal(canActAdmin(RBAC_GRANT.EMPLOYEE_UPDATE, ctx), false);
  });

  it('empty grant key → false', () => {
    assert.equal(canActAdmin('', grantsOf({})), false);
  });
});
