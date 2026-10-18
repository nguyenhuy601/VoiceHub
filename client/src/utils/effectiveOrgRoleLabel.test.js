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
    'adminUsers.roleVendor': 'Bên bán',
    'adminUsers.orgRoleNone': 'Chưa gán Vai trò tổ chức',
  })[key] || key;

describe('effectiveOrgRoleLabel', () => {
  it('vendor systemRole=admin → Bên bán', () => {
    assert.equal(
      effectiveOrgRoleLabel({ systemRole: 'admin', role: 'admin' }, { t }),
      'Bên bán'
    );
  });

  it('director assignment → Giám đốc tổ chức', () => {
    assert.equal(
      effectiveOrgRoleLabel(
        { systemRole: 'employee', role: 'member' },
        { orgRoleRows: [{ roleKey: 'director', roleLabel: 'Director' }], t }
      ),
      'Giám đốc tổ chức'
    );
  });

  it('department_manager → Trưởng phòng', () => {
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
  });

  it('buildOrgRoleRowsMapFromAssignments joins keys', () => {
    const map = buildOrgRoleRowsMapFromAssignments([
      { userId: 'u1', roleKey: 'director', roleLabel: 'Director' },
      { userId: 'u2', roleKey: 'team_lead', roleLabel: 'Team Lead' },
    ]);
    assert.equal(formatOrgRoleRowsLabel(map.u1), 'Giám đốc tổ chức');
    assert.equal(formatOrgRoleRowsLabel(map.u2), 'Trưởng nhóm');
  });

  it('memberIsSystemAdmin', () => {
    assert.equal(memberIsSystemAdmin({ systemRole: 'admin' }), true);
    assert.equal(memberIsSystemAdmin({ systemRole: 'employee' }), false);
  });
});
