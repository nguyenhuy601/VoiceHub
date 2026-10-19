import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterOrgRoleCatalogRows,
  isRedundantOrgRoleAliasRow,
  localizedOrgRoleDescription,
  localizedOrgRoleLabel,
  resolveOrgRoleCanonicalKey,
} from './orgRoleLocale.js';

const tVi = (path) =>
  ({
    'adminRbac.orgRoleLabel.ORG_OWNER': 'Chủ sở hữu tổ chức',
    'adminRbac.orgRoleLabel.CAPACITY_PLANNER': 'Lập kế hoạch năng lực',
    'adminRbac.orgRoleLabel.MENTOR': 'Người hướng dẫn',
    'adminRbac.orgRoleDesc.ORG_OWNER': 'Sở hữu và chịu trách nhiệm cấp tổ chức',
  })[path] || path;

const tEn = (path) =>
  ({
    'adminRbac.orgRoleLabel.ORG_OWNER': 'Organization Owner',
    'adminRbac.orgRoleLabel.CAPACITY_PLANNER': 'Capacity Planner',
    'adminRbac.orgRoleLabel.DIRECTOR': 'Organization Director',
    'adminRbac.orgRoleDesc.ORG_OWNER': 'Owns and is accountable at organization level',
  })[path] || path;

describe('orgRoleLocale', () => {
  it('resolveOrgRoleCanonicalKey aliases → UPPER', () => {
    assert.equal(resolveOrgRoleCanonicalKey('department_manager'), 'DEPARTMENT_MANAGER');
    assert.equal(resolveOrgRoleCanonicalKey('team_manager'), 'TEAM_LEAD');
    assert.equal(resolveOrgRoleCanonicalKey('ORG_OWNER'), 'ORG_OWNER');
  });

  it('localizedOrgRoleLabel theo locale — không tin DB EN khi UI VI', () => {
    assert.equal(
      localizedOrgRoleLabel('ORG_OWNER', 'Organization Owner', tVi),
      'Chủ sở hữu tổ chức'
    );
    assert.equal(
      localizedOrgRoleLabel('CAPACITY_PLANNER', 'Capacity Planner', tVi),
      'Lập kế hoạch năng lực'
    );
    assert.equal(
      localizedOrgRoleLabel('ORG_OWNER', 'Chủ sở hữu tổ chức', tEn),
      'Organization Owner'
    );
    assert.equal(
      localizedOrgRoleLabel('DIRECTOR', 'Giám đốc tổ chức', tEn),
      'Organization Director'
    );
  });

  it('fallback VI khi không có t', () => {
    assert.equal(localizedOrgRoleLabel('MENTOR', 'Mentor'), 'Người hướng dẫn');
    assert.equal(localizedOrgRoleLabel('PMO_MANAGER', 'PMO Manager'), 'Quản lý PMO');
  });

  it('localizedOrgRoleDescription theo locale', () => {
    assert.equal(
      localizedOrgRoleDescription('ORG_OWNER', 'Organization Owner owns…', tVi),
      'Sở hữu và chịu trách nhiệm cấp tổ chức'
    );
    assert.equal(
      localizedOrgRoleDescription('ORG_OWNER', '…', tEn),
      'Owns and is accountable at organization level'
    );
  });

  it('isRedundantOrgRoleAliasRow ẩn lowercase khi đã có UPPER', () => {
    const rows = [
      { key: 'department_manager', label: 'Trưởng phòng' },
      { key: 'DEPARTMENT_MANAGER', label: 'Trưởng phòng' },
      { key: 'ORG_OWNER', label: 'Organization Owner' },
    ];
    assert.equal(isRedundantOrgRoleAliasRow(rows[0], rows), true);
    assert.equal(isRedundantOrgRoleAliasRow(rows[1], rows), false);
    assert.equal(isRedundantOrgRoleAliasRow(rows[2], rows), false);
  });

  it('filterOrgRoleCatalogRows gộp sibling alias cùng canonical (team_lead + team_manager)', () => {
    const rows = [
      { key: 'team_lead', label: 'Trưởng nhóm' },
      { key: 'team_manager', label: 'Trưởng nhóm' },
      { key: 'HR_APPROVER', label: 'Nhân sự' },
      { key: 'hr_approver', label: 'Nhân sự' },
    ];
    const filtered = filterOrgRoleCatalogRows(rows);
    const keys = filtered.map((r) => r.key);
    assert.equal(keys.filter((k) => resolveOrgRoleCanonicalKey(k) === 'TEAM_LEAD').length, 1);
    assert.deepEqual(keys.filter((k) => k === 'HR_APPROVER' || k === 'hr_approver'), ['HR_APPROVER']);
  });
});
