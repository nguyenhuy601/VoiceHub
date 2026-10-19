const test = require('node:test');
const assert = require('node:assert/strict');
const {
  roleIsOnAllowlist,
  tickShouldBeRemoved,
  normalizeAllowlistRoleCode,
} = require('../src/services/orgRoleGrantBaseline.service');

test('UPPER and lowercase department manager are effective org roles', () => {
  assert.equal(roleIsOnAllowlist({ code: 'DEPARTMENT_MANAGER' }), true);
  assert.equal(roleIsOnAllowlist({ code: 'department_manager' }), true);
  assert.equal(normalizeAllowlistRoleCode({ code: 'org_member' }), 'MEMBER');
  assert.equal(normalizeAllowlistRoleCode({ code: 'ORG_MEMBER' }), 'MEMBER');
  assert.equal(roleIsOnAllowlist({ code: 'legacy', name: 'Thành viên tổ chức' }), true);
});

test('trim drops extra organization ticks and keeps chat send', () => {
  assert.equal(tickShouldBeRemoved('MEMBER', 'organization.structure.view'), true);
  assert.equal(tickShouldBeRemoved('MEMBER', 'organization.department.view'), true);
  assert.equal(tickShouldBeRemoved('MEMBER', 'organization.position.view'), true);
  assert.equal(tickShouldBeRemoved('MEMBER', 'organization.employee.view'), false);
  assert.equal(tickShouldBeRemoved('MEMBER', 'communication.chat.send'), false);
  assert.equal(tickShouldBeRemoved('MEMBER', 'communication.chat.view'), false);
  assert.equal(tickShouldBeRemoved('MEMBER', 'file.file.download'), false);
  assert.equal(tickShouldBeRemoved('DEPARTMENT_MANAGER', 'organization.employee.delete'), true);
});
