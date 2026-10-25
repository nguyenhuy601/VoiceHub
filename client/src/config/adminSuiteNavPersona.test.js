import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RBAC_GRANT } from './rbacUiGrantMap.js';
import {
  ADMIN_SUITE_PERSONA,
  resolveAdminSuiteNavPersona,
} from './adminSuiteNavPersona.js';

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

describe('resolveAdminSuiteNavPersona', () => {
  it('Provider (isSystemAdmin) → Quản trị Hạ tầng /app/admin', () => {
    const result = resolveAdminSuiteNavPersona({
      isSystemAdmin: true,
      ...grantsOf({ [RBAC_GRANT.ORG_ROLE_UPDATE]: 'ORGANIZATION' }),
    });
    assert.equal(result.persona, ADMIN_SUITE_PERSONA.PROVIDER);
    assert.equal(result.labelKey, 'nav.adminSuiteProvider');
    assert.equal(result.path, '/app/admin');
  });

  it('Enterprise IT (organization_role.update) → Suite Quản trị', () => {
    const result = resolveAdminSuiteNavPersona({
      isSystemAdmin: false,
      ...grantsOf({
        [RBAC_GRANT.ORG_ROLE_UPDATE]: 'ORGANIZATION',
        [RBAC_GRANT.AUDIT_VIEW]: 'ORGANIZATION',
        [RBAC_GRANT.EMPLOYEE_INVITE]: 'ORGANIZATION',
      }),
    });
    assert.equal(result.persona, ADMIN_SUITE_PERSONA.ENTERPRISE);
    assert.equal(result.labelKey, 'nav.adminSuiteEnterprise');
    assert.equal(result.path, '/app/admin');
  });

  it('Director/Auditor (audit.view, không org_role.update) → Báo cáo & Kiểm toán', () => {
    const result = resolveAdminSuiteNavPersona({
      isSystemAdmin: false,
      ...grantsOf({
        [RBAC_GRANT.AUDIT_VIEW]: 'ORGANIZATION',
        [RBAC_GRANT.EMPLOYEE_VIEW]: 'ORGANIZATION',
        [RBAC_GRANT.EMPLOYEE_INVITE]: 'ORGANIZATION',
      }),
    });
    assert.equal(result.persona, ADMIN_SUITE_PERSONA.AUDIT);
    assert.equal(result.labelKey, 'nav.adminSuiteAudit');
    assert.equal(result.path, '/app/admin/audit');
  });

  it('HR (employee.invite/update page scope) → Quản lý Nhân sự', () => {
    const result = resolveAdminSuiteNavPersona({
      isSystemAdmin: false,
      ...grantsOf({
        [RBAC_GRANT.EMPLOYEE_VIEW]: 'ORGANIZATION',
        [RBAC_GRANT.EMPLOYEE_INVITE]: 'ORGANIZATION',
        [RBAC_GRANT.EMPLOYEE_UPDATE]: 'ORGANIZATION',
      }),
    });
    assert.equal(result.persona, ADMIN_SUITE_PERSONA.HR);
    assert.equal(result.labelKey, 'nav.adminSuiteHr');
    assert.equal(result.path, '/app/admin/users');
  });

  it('Fallback opener khác → Quản trị tổ chức', () => {
    const result = resolveAdminSuiteNavPersona({
      isSystemAdmin: false,
      ...grantsOf({
        [RBAC_GRANT.DEPT_VIEW]: 'ORGANIZATION',
        [RBAC_GRANT.STRUCTURE_VIEW]: 'ORGANIZATION',
      }),
    });
    assert.equal(result.persona, ADMIN_SUITE_PERSONA.ORG);
    assert.equal(result.labelKey, 'nav.adminSuiteOrg');
    assert.equal(result.path, '/app/admin');
  });

  it('employee.update SELF không mở persona HR', () => {
    const result = resolveAdminSuiteNavPersona({
      isSystemAdmin: false,
      ...grantsOf({ [RBAC_GRANT.EMPLOYEE_UPDATE]: 'SELF' }),
    });
    assert.equal(result.persona, ADMIN_SUITE_PERSONA.ORG);
  });
});
