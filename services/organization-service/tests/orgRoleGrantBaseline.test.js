const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ROLE_GRANTS,
  POSITION_ROLE_CODE,
  hasCode,
} = require('../src/services/orgRoleGrantBaseline.service');

test('department manager has invite and create project, not policy or delete', () => {
  assert.equal(hasCode('DEPARTMENT_MANAGER', 'organization.employee.invite'), true);
  assert.equal(hasCode('DEPARTMENT_MANAGER', 'project.project.create'), true);
  assert.equal(hasCode('DEPARTMENT_MANAGER', 'organization.employee.view'), true);
  assert.equal(hasCode('DEPARTMENT_MANAGER', 'communication.chat.send'), true);
  assert.equal(hasCode('DEPARTMENT_MANAGER', 'organization.policy.update'), false);
  assert.equal(hasCode('DEPARTMENT_MANAGER', 'organization.employee.delete'), false);
  assert.equal(hasCode('department_manager', 'organization.employee.invite'), true);
});

test('product manager position maps to resource manager without policy', () => {
  assert.equal(POSITION_ROLE_CODE.product_manager, 'RESOURCE_MANAGER');
  assert.equal(hasCode('RESOURCE_MANAGER', 'project.project.create'), true);
  assert.equal(hasCode('RESOURCE_MANAGER', 'organization.policy.update'), false);
});

test('developer and BA positions stay on MEMBER without create project', () => {
  assert.equal(POSITION_ROLE_CODE.software_developer, 'MEMBER');
  assert.equal(POSITION_ROLE_CODE.business_analyst, 'MEMBER');
  assert.equal(hasCode('MEMBER', 'project.project.create'), false);
  assert.equal(hasCode('MEMBER', 'organization.employee.invite'), false);
  const view = ROLE_GRANTS.MEMBER.find(([code]) => code === 'organization.employee.view');
  assert.equal(view[1], 'SELF');
});

test('engineering manager maps to department manager; director is not a shared position', () => {
  assert.equal(POSITION_ROLE_CODE.engineering_manager, 'DEPARTMENT_MANAGER');
  assert.equal(POSITION_ROLE_CODE.director, undefined);
  assert.equal(hasCode('TEAM_LEAD', 'organization.employee.invite'), false);
  assert.equal(hasCode('HR_APPROVER', 'project.project.create'), false);
  assert.ok(ROLE_GRANTS.AUDITOR.every(([code]) => code.endsWith('.view')));
  assert.equal(
    ROLE_GRANTS.DIRECTOR.some(([code]) => code.startsWith('system.permission_group.')),
    false
  );
});
