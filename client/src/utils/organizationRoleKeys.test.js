import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractOrganizationRoleKeys,
  resolveNavRoleFromOrgKeys,
} from './organizationRoleKeys.js';

describe('extractOrganizationRoleKeys', () => {
  it('gộp key từ object + mảng', () => {
    assert.deepEqual(
      extractOrganizationRoleKeys(
        { myOrganizationRoles: [{ roleKey: 'director' }] },
        ['team_lead', 'director']
      ),
      ['director', 'team_lead']
    );
  });
});

describe('resolveNavRoleFromOrgKeys', () => {
  it('department_manager → deptHead', () => {
    assert.equal(resolveNavRoleFromOrgKeys(['department_manager']), 'deptHead');
  });

  it('team_lead → teamLeader', () => {
    assert.equal(resolveNavRoleFromOrgKeys([{ key: 'team_lead' }]), 'teamLeader');
  });

  it('director → manager', () => {
    assert.equal(resolveNavRoleFromOrgKeys(['director']), 'manager');
  });
});
