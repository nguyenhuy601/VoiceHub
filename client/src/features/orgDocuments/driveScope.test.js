import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRIVE_SCOPE,
  driveScopeEmptyKey,
  driveScopeTitleKey,
  resolveDriveScope,
} from './driveScope.js';

describe('resolveDriveScope', () => {
  it('ưu tiên project rồi team rồi phòng rồi org', () => {
    assert.equal(
      resolveDriveScope({
        organizationId: 'o',
        departmentId: 'd',
        teamId: 't',
        projectId: 'p',
      }),
      DRIVE_SCOPE.PROJECT
    );
    assert.equal(
      resolveDriveScope({ organizationId: 'o', departmentId: 'd', teamId: 't' }),
      DRIVE_SCOPE.TEAM
    );
    assert.equal(
      resolveDriveScope({ organizationId: 'o', departmentId: 'd' }),
      DRIVE_SCOPE.DEPARTMENT
    );
    assert.equal(resolveDriveScope({ organizationId: 'o' }), DRIVE_SCOPE.ORG);
    assert.equal(resolveDriveScope({}), DRIVE_SCOPE.PERSONAL);
  });

  it('bỏ qua chuỗi trống', () => {
    assert.equal(
      resolveDriveScope({ organizationId: 'o', departmentId: '  ', teamId: '' }),
      DRIVE_SCOPE.ORG
    );
  });

  it('title/empty key theo scope', () => {
    assert.equal(driveScopeTitleKey(DRIVE_SCOPE.TEAM), 'documents.driveTitleTeam');
    assert.equal(driveScopeEmptyKey(DRIVE_SCOPE.DEPARTMENT), 'documents.driveEmptyDepartment');
    assert.equal(driveScopeEmptyKey(DRIVE_SCOPE.PROJECT), 'documents.driveEmptyProject');
  });
});
