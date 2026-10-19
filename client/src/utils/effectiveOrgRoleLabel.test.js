import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildOrgRoleRowsMapFromAssignments,
  canonicalizeOrgRoleLabel,
  effectiveOrgRoleLabel,
  formatOrgRoleRowsLabel,
  memberIsSystemAdmin,
} from './effectiveOrgRoleLabel.js';

const t = (key) =>
  ({
    'adminUsers.roleVendor': 'Nhà cung cấp',
    'adminUsers.orgRoleNone': 'Chưa gán Vai trò tổ chức',
  })[key] || key;

describe('effectiveOrgRoleLabel', () => {
  it('vendor systemRole=admin → Nhà cung cấp', () => {
    assert.equal(
      effectiveOrgRoleLabel({ systemRole: 'admin', role: 'admin' }, { t }),
      'Nhà cung cấp'
    );
  });

  it('director assignment → Giám đốc tổ chức', () => {
    assert.equal(
      effectiveOrgRoleLabel(
        { systemRole: 'employee', role: 'member' },
        { orgRoleRows: [{ roleKey: 'DIRECTOR', roleLabel: 'Director' }], t }
      ),
      'Giám đốc tổ chức'
    );
  });

  it('ORG_OWNER EN trong DB → nhãn VI qua t', () => {
    const tFull = (key) =>
      ({
        'adminUsers.roleVendor': 'Nhà cung cấp',
        'adminUsers.orgRoleNone': 'Chưa gán Vai trò tổ chức',
        'adminRbac.orgRoleLabel.ORG_OWNER': 'Chủ sở hữu tổ chức',
      })[key] || key;
    assert.equal(
      effectiveOrgRoleLabel(
        { systemRole: 'employee' },
        {
          orgRoleRows: [{ roleKey: 'ORG_OWNER', roleLabel: 'Organization Owner' }],
          t: tFull,
        }
      ),
      'Chủ sở hữu tổ chức'
    );
  });

  it('DEPARTMENT_MANAGER / lowercase → Trưởng phòng', () => {
    assert.equal(
      effectiveOrgRoleLabel(
        { role: 'member' },
        { orgRoleRows: [{ roleKey: 'DEPARTMENT_MANAGER' }], t }
      ),
      'Trưởng phòng'
    );
    assert.equal(
      effectiveOrgRoleLabel(
        { role: 'member' },
        { orgRoleRows: [{ roleKey: 'department_manager' }], t }
      ),
      'Trưởng phòng'
    );
  });

  it('no rows → chưa gán (không hiện membership admin)', () => {
    assert.equal(
      effectiveOrgRoleLabel({ role: 'admin', systemRole: 'employee' }, { t }),
      'Chưa gán Vai trò tổ chức'
    );
  });
});

describe('canonicalizeOrgRoleLabel / map', () => {
  it('maps EN Director label via key', () => {
    assert.equal(canonicalizeOrgRoleLabel('director', 'Director'), 'Giám đốc tổ chức');
    assert.equal(canonicalizeOrgRoleLabel('DIRECTOR', 'Director'), 'Giám đốc tổ chức');
  });

  it('buildOrgRoleRowsMapFromAssignments joins keys', () => {
    const map = buildOrgRoleRowsMapFromAssignments([
      { userId: 'u1', roleKey: 'DIRECTOR', roleLabel: 'Director' },
      { userId: 'u2', roleKey: 'TEAM_LEAD', roleLabel: 'Team Lead' },
    ]);
    assert.equal(formatOrgRoleRowsLabel(map.u1), 'Giám đốc tổ chức');
    assert.equal(formatOrgRoleRowsLabel(map.u2), 'Trưởng nhóm');
  });

  it('memberIsSystemAdmin', () => {
    assert.equal(memberIsSystemAdmin({ systemRole: 'admin' }), true);
    assert.equal(memberIsSystemAdmin({ systemRole: 'employee' }), false);
  });
});
