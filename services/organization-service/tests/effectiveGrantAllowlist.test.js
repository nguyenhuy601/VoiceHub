const test = require('node:test');
const assert = require('node:assert/strict');
const {
  roleIsOnAllowlist,
  tickShouldBeRemoved,
  normalizeAllowlistRoleCode,
} = require('../src/services/orgRoleGrantBaseline.service');

test('uppercase department manager is not an effective org role', () => {
  assert.equal(roleIsOnAllowlist({ code: 'DEPARTMENT_MANAGER' }), false);
  assert.equal(roleIsOnAllowlist({ code: 'department_manager' }), true);
  assert.equal(normalizeAllowlistRoleCode({ code: 'org_member' }), 'member');
  assert.equal(roleIsOnAllowlist({ code: 'legacy', name: 'Thành viên tổ chức' }), true);
});

test('trim drops extra organization ticks and keeps chat send', () => {
  assert.equal(tickShouldBeRemoved('member', 'organization.structure.view'), true);
  assert.equal(tickShouldBeRemoved('member', 'organization.department.view'), true);
  assert.equal(tickShouldBeRemoved('member', 'organization.position.view'), true);
  assert.equal(tickShouldBeRemoved('member', 'organization.employee.view'), false);
  assert.equal(tickShouldBeRemoved('member', 'communication.chat.send'), false);
  assert.equal(tickShouldBeRemoved('member', 'communication.chat.view'), false);
  assert.equal(tickShouldBeRemoved('member', 'file.file.download'), false);
  assert.equal(tickShouldBeRemoved('DEPARTMENT_MANAGER', 'organization.employee.delete'), false);
});
