const test = require('node:test');
const assert = require('node:assert/strict');
const {
  employeeViewScope,
  scopeOpensAdminTable,
  filterMembersByEmployeeView,
} = require('../src/utils/employeeViewMemberScope');

test('SELF không mở bảng quản trị', () => {
  assert.equal(scopeOpensAdminTable('SELF'), false);
  assert.equal(scopeOpensAdminTable('DEPARTMENT'), true);
  assert.equal(scopeOpensAdminTable('ORGANIZATION'), true);
});

test('DEPARTMENT chưa có phòng thì chỉ còn mình', () => {
  const rows = filterMembersByEmployeeView({
    viewerUserId: 'u1',
    scope: 'DEPARTMENT',
    departmentMemberIds: [],
    members: [{ user: 'u1' }, { user: 'u2' }, { user: 'u3' }],
  });
  assert.deepEqual(rows.map((row) => row.user), ['u1']);
});

test('DEPARTMENT có roster thì giữ người trong phòng và chính mình', () => {
  const rows = filterMembersByEmployeeView({
    viewerUserId: 'lead',
    scope: 'DEPARTMENT',
    departmentMemberIds: ['a', 'b'],
    members: [{ user: 'lead' }, { user: 'a' }, { user: 'z' }],
  });
  assert.deepEqual(rows.map((row) => row.user), ['lead', 'a']);
});

test('ORGANIZATION giữ cả danh sách', () => {
  const members = [{ user: 'a' }, { user: 'b' }];
  const rows = filterMembersByEmployeeView({
    viewerUserId: 'a',
    scope: 'ORGANIZATION',
    departmentMemberIds: [],
    members,
  });
  assert.equal(rows.length, 2);
  assert.equal(employeeViewScope({ 'organization.employee.view': 'department' }), 'DEPARTMENT');
});
