import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterProjectRoleCatalogRows,
  localizedProjectRoleLabel,
  localizedProjectRoleShortLabel,
  resolveProjectRoleCanonicalKey,
} from './projectRoleLocale.js';

const tVi = (path) =>
  ({
    'adminRbac.projectRoleLabelPrefix': 'Dự án — ',
    'adminRbac.projectRoleLabel.PROJECT_MANAGER': 'Quản lý dự án',
    'adminRbac.projectRoleLabel.PRODUCT_OWNER': 'Chủ sản phẩm',
    'adminRbac.projectRoleLabel.SCRUM_MASTER': 'Điều phối Scrum',
    'adminRbac.projectRoleLabel.SOLUTION_ARCHITECT': 'Kiến trúc sư giải pháp',
  })[path] || path;

const tEn = (path) =>
  ({
    'adminRbac.projectRoleLabelPrefix': 'Project — ',
    'adminRbac.projectRoleLabel.PROJECT_MANAGER': 'Project Manager',
    'adminRbac.projectRoleLabel.PRODUCT_OWNER': 'Product Owner',
  })[path] || path;

describe('projectRoleLocale', () => {
  it('canonical key', () => {
    assert.equal(resolveProjectRoleCanonicalKey('project_manager'), 'PROJECT_MANAGER');
    assert.equal(resolveProjectRoleCanonicalKey('tech_lead'), 'TECHNICAL_LEAD');
  });

  it('localized prefix + suffix theo locale', () => {
    assert.equal(
      localizedProjectRoleLabel('project_manager', 'Dự án — Project Manager', tVi),
      'Dự án — Quản lý dự án'
    );
    assert.equal(
      localizedProjectRoleLabel('project_manager', 'Dự án — Quản lý dự án', tEn),
      'Project — Project Manager'
    );
    assert.equal(
      localizedProjectRoleLabel('solution_architect', 'Dự án — Solution Architect', tVi),
      'Dự án — Kiến trúc sư giải pháp'
    );
  });

  it('short label bỏ prefix và theo locale', () => {
    assert.equal(
      localizedProjectRoleShortLabel('product_owner', 'Product Owner', tVi),
      'Chủ sản phẩm'
    );
    assert.equal(
      localizedProjectRoleShortLabel('scrum_master', 'Scrum Master', tVi),
      'Điều phối Scrum'
    );
    assert.equal(
      localizedProjectRoleShortLabel('project_manager', 'Project Manager', tEn),
      'Project Manager'
    );
  });

  it('filterProjectRoleCatalogRows ẩn alias khi đã có UPPER', () => {
    const rows = [
      { key: 'tech_lead', label: 'Legacy' },
      { key: 'TECHNICAL_LEAD', label: 'Trưởng kỹ thuật' },
      { key: 'QA_ENGINEER', label: 'QA' },
    ];
    const filtered = filterProjectRoleCatalogRows(rows);
    assert.deepEqual(
      filtered.map((r) => r.key),
      ['TECHNICAL_LEAD', 'QA_ENGINEER']
    );
  });
});
