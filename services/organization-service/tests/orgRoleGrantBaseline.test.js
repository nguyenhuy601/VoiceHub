const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ROLE_GRANTS,
  POSITION_ROLE_CODE,
  hasCode,
} = require('../src/services/orgRoleGrantBaseline.service');

test('department manager has invite and create project, not policy or delete', () => {
  assert.equal(hasCode('department_manager', 'organization.employee.invite'), true);
  assert.equal(hasCode('department_manager', 'project.project.create'), true);
  assert.equal(hasCode('department_manager', 'organization.employee.view'), true);
  assert.equal(hasCode('department_manager', 'communication.chat.send'), true);
  assert.equal(hasCode('department_manager', 'organization.policy.update'), false);
  assert.equal(hasCode('department_manager', 'organization.employee.delete'), false);
});

test('product manager position maps to resource manager without policy', () => {
  assert.equal(POSITION_ROLE_CODE.product_manager, 'resource_manager');
  assert.equal(hasCode('resource_manager', 'project.project.create'), true);
  assert.equal(hasCode('resource_manager', 'organization.policy.update'), false);
});

test('developer and BA positions stay on member without create project', () => {
  assert.equal(POSITION_ROLE_CODE.software_developer, 'member');
  assert.equal(POSITION_ROLE_CODE.business_analyst, 'member');
  assert.equal(hasCode('member', 'project.project.create'), false);
  assert.equal(hasCode('member', 'organization.employee.invite'), false);
  const view = ROLE_GRANTS.member.find(([code]) => code === 'organization.employee.view');
  assert.equal(view[1], 'SELF');
});

test('engineering manager maps to department manager; director is not a shared position', () => {
  assert.equal(POSITION_ROLE_CODE.engineering_manager, 'department_manager');
  assert.equal(POSITION_ROLE_CODE.director, undefined);
  assert.equal(hasCode('team_lead', 'organization.employee.invite'), false);
  assert.equal(hasCode('hr_approver', 'project.project.create'), false);
  assert.ok(ROLE_GRANTS.auditor.every(([code]) => code.endsWith('.view')));
  assert.equal(
    ROLE_GRANTS.director.some(([code]) => code.startsWith('system.permission_group.')),
    false
  );
});
