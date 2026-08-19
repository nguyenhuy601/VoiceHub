process.env.ROLE_PERMISSION_SERVICE_URL = 'http://role-permission-service:3000';
process.env.GATEWAY_INTERNAL_TOKEN = 'test-token';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  roleGrantsUserView,
  resolveMemberDirectoryAccess,
  directoryAllowsDepartmentQuery,
  memberInDirectoryUnits,
} = require('../src/utils/memberDirectoryAccess');

const USER_VIEW = [{ resource: 'user', actions: ['view'] }];
const USER_READ = [{ resource: 'user', actions: ['read'] }];
const DEPT_ID = 'abcdefdepA01';
const departments = [{ _id: DEPT_ID, name: 'Backend', division: 'div1' }];
const deptRole = {
  name: 'Phòng ban: Backend · dep_depa01',
  scope: 'DEPARTMENT',
  permissions: USER_VIEW,
};

describe('roleGrantsUserView', () => {
  it('nhận user.view / user.read / wildcard', () => {
    assert.equal(roleGrantsUserView({ permissions: USER_VIEW }), true);
    assert.equal(roleGrantsUserView({ permissions: USER_READ }), true);
    assert.equal(roleGrantsUserView({ permissions: [{ resource: '*', actions: ['*'] }] }), true);
    assert.equal(roleGrantsUserView({ permissions: [{ resource: 'department', actions: ['view'] }] }), false);
    assert.equal(roleGrantsUserView({}), false);
  });
});

describe('resolveMemberDirectoryAccess', () => {
  it('pack user.view + ORGANIZATION → all', () => {
    const access = resolveMemberDirectoryAccess([
      { name: 'Gói quyền — Thành viên', scope: 'ORGANIZATION', permissions: USER_VIEW },
    ]);
    assert.equal(access.mode, 'all');
    assert.deepEqual(access.departmentIds, []);
  });

  it('GLOBAL cùng all', () => {
    const access = resolveMemberDirectoryAccess([
      { name: 'Gói quyền — Quản trị', scope: 'GLOBAL', permissions: [{ resource: 'user', actions: ['admin'] }] },
    ]);
    assert.equal(access.mode, 'all');
  });

  it('DEPARTMENT có user.view → units + dept id từ tên', () => {
    const access = resolveMemberDirectoryAccess([deptRole], { departments });
    assert.equal(access.mode, 'units');
    assert.ok(access.departmentIds.includes(DEPT_ID));
  });

  it('role không user.view → assignment', () => {
    const access = resolveMemberDirectoryAccess([
      { name: 'Gói quyền — Thành viên', scope: 'ORGANIZATION', permissions: [{ resource: 'task', actions: ['view'] }] },
      { ...deptRole, permissions: [] },
    ]);
    assert.equal(access.mode, 'assignment');
  });

  it('mix org + dept → all (widen)', () => {
    const access = resolveMemberDirectoryAccess(
      [
        { name: 'Gói quyền — HR', scope: 'ORGANIZATION', permissions: USER_VIEW },
        deptRole,
      ],
      { departments }
    );
    assert.equal(access.mode, 'all');
  });

  it('roles rỗng hoặc PERSONAL → assignment', () => {
    assert.equal(resolveMemberDirectoryAccess([]).mode, 'assignment');
    assert.equal(
      resolveMemberDirectoryAccess([
        { name: 'Self', scope: 'PERSONAL', permissions: USER_VIEW },
      ]).mode,
      'assignment'
    );
  });
});

describe('directoryAllowsDepartmentQuery', () => {
  it('all luôn cho phép', () => {
    assert.equal(directoryAllowsDepartmentQuery({ mode: 'all' }, ['d1']), true);
  });

  it('units chỉ phòng được cấp', () => {
    const access = { mode: 'units', departmentIds: [DEPT_ID], teamIds: [], divisionIds: [] };
    assert.equal(directoryAllowsDepartmentQuery(access, [DEPT_ID]), true);
    assert.equal(directoryAllowsDepartmentQuery(access, ['other']), false);
  });

  it('assignment dùng extraAllowedIds', () => {
    const access = { mode: 'assignment', departmentIds: [], teamIds: [], divisionIds: [] };
    assert.equal(directoryAllowsDepartmentQuery(access, [DEPT_ID], [DEPT_ID]), true);
    assert.equal(directoryAllowsDepartmentQuery(access, [DEPT_ID], []), false);
  });
});

describe('memberInDirectoryUnits', () => {
  const access = { departmentIds: [DEPT_ID], teamIds: ['team1'], divisionIds: [] };

  it('viewer luôn nằm trong list', () => {
    assert.equal(memberInDirectoryUnits({ user: 'me' }, access, 'me'), true);
  });

  it('khớp departmentId', () => {
    assert.equal(memberInDirectoryUnits({ user: 'u2', departmentId: DEPT_ID }, access, 'me'), true);
    assert.equal(memberInDirectoryUnits({ user: 'u3', departmentId: 'other' }, access, 'me'), false);
  });
});
