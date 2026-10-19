import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterHiddenOrgRolePermissionGroups,
  isHiddenOrgRolePermission,
} from './orgRolePermissionVisibility.js';

describe('isHiddenOrgRolePermission', () => {
  it('hides branch and division prefixes', () => {
    assert.equal(isHiddenOrgRolePermission('organization.branch.view'), true);
    assert.equal(isHiddenOrgRolePermission('organization.division.update'), true);
    assert.equal(isHiddenOrgRolePermission('organization.department.view'), false);
    assert.equal(isHiddenOrgRolePermission(''), false);
  });
});

describe('filterHiddenOrgRolePermissionGroups', () => {
  it('drops empty modules after filter', () => {
    const filtered = filterHiddenOrgRolePermissionGroups([
      {
        key: 'org',
        modules: [
          {
            key: 'branch',
            permissions: [{ key: 'organization.branch.view' }],
          },
          {
            key: 'dept',
            permissions: [
              { key: 'organization.department.view' },
              { key: 'organization.division.view' },
            ],
          },
        ],
      },
    ]);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].modules.length, 1);
    assert.equal(filtered[0].modules[0].permissions.length, 1);
    assert.equal(filtered[0].modules[0].permissions[0].key, 'organization.department.view');
  });
});
