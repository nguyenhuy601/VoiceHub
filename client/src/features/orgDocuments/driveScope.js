/** Corpus kho tài liệu — một UI, khác data theo location. */

export const DRIVE_SCOPE = Object.freeze({
  ORG: 'org',
  DEPARTMENT: 'department',
  TEAM: 'team',
  PROJECT: 'project',
  PERSONAL: 'personal',
});

export function resolveDriveScope({
  organizationId = '',
  departmentId = '',
  teamId = '',
  projectId = '',
} = {}) {
  if (String(projectId || '').trim()) return DRIVE_SCOPE.PROJECT;
  if (String(teamId || '').trim()) return DRIVE_SCOPE.TEAM;
  if (String(departmentId || '').trim()) return DRIVE_SCOPE.DEPARTMENT;
  if (String(organizationId || '').trim()) return DRIVE_SCOPE.ORG;
  return DRIVE_SCOPE.PERSONAL;
}

export function driveScopeTitleKey(scope) {
  switch (scope) {
    case DRIVE_SCOPE.TEAM:
      return 'documents.driveTitleTeam';
    case DRIVE_SCOPE.DEPARTMENT:
      return 'documents.driveTitleDepartment';
    case DRIVE_SCOPE.PROJECT:
      return 'documents.driveTitleProject';
    case DRIVE_SCOPE.PERSONAL:
      return 'documents.driveTitlePersonal';
    default:
      return 'documents.driveTitleOrg';
  }
}

export function driveScopeHintKey(scope) {
  switch (scope) {
    case DRIVE_SCOPE.TEAM:
      return 'documents.driveHintTeam';
    case DRIVE_SCOPE.DEPARTMENT:
      return 'documents.driveHintDepartment';
    case DRIVE_SCOPE.PROJECT:
      return 'documents.driveHintProject';
    case DRIVE_SCOPE.PERSONAL:
      return 'documents.driveHintPersonal';
    default:
      return 'documents.driveHintOrg';
  }
}

export function driveScopeEmptyKey(scope) {
  switch (scope) {
    case DRIVE_SCOPE.TEAM:
      return 'documents.driveEmptyTeam';
    case DRIVE_SCOPE.DEPARTMENT:
      return 'documents.driveEmptyDepartment';
    case DRIVE_SCOPE.PROJECT:
      return 'documents.driveEmptyProject';
    case DRIVE_SCOPE.PERSONAL:
      return 'documents.personalEmpty';
    default:
      return 'documents.orgEmpty';
  }
}
