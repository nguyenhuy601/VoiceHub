/** SpaceContext helpers — company vs project scope. */

import {
  COMPANY_SPACE_LEVEL,
  normalizeCompanySpaceLevel,
} from './companySpaceLevel.js';

export const SPACE_KIND = {
  COMPANY: 'company',
  PROJECT: 'project',
};

export function normalizeSpaceKind(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (raw === SPACE_KIND.PROJECT) return SPACE_KIND.PROJECT;
  return SPACE_KIND.COMPANY;
}

export function createSpaceContext({
  kind = SPACE_KIND.COMPANY,
  organizationId = '',
  departmentId = '',
  teamId = '',
  level = COMPANY_SPACE_LEVEL.DEPARTMENT,
  projectId = '',
} = {}) {
  const normalizedKind = normalizeSpaceKind(kind);
  const orgId = String(organizationId || '').trim();
  const deptId = String(departmentId || '').trim();
  const tid = String(teamId || '').trim();
  const pid = String(projectId || '').trim();
  const isCompany = normalizedKind === SPACE_KIND.COMPANY;
  const normalizedLevel = isCompany
    ? normalizeCompanySpaceLevel(tid ? level || COMPANY_SPACE_LEVEL.TEAM : level)
    : COMPANY_SPACE_LEVEL.DEPARTMENT;

  return {
    kind: normalizedKind,
    organizationId: orgId,
    departmentId: isCompany ? deptId : '',
    teamId: isCompany && normalizedLevel === COMPANY_SPACE_LEVEL.TEAM ? tid : '',
    level: isCompany
      ? tid && normalizedLevel === COMPANY_SPACE_LEVEL.TEAM
        ? COMPANY_SPACE_LEVEL.TEAM
        : COMPANY_SPACE_LEVEL.DEPARTMENT
      : COMPANY_SPACE_LEVEL.DEPARTMENT,
    projectId: normalizedKind === SPACE_KIND.PROJECT ? pid : '',
  };
}

/**
 * Company chat/roster: scope GET /members to department when SpaceContext has one.
 * Empty → org-wide (legacy collaborate / no dept yet).
 * @param {{ kind?: string, departmentId?: string } | null | undefined} space
 * @returns {string}
 */
export function resolveCompanyMembersDepartmentId(space) {
  if (normalizeSpaceKind(space?.kind) !== SPACE_KIND.COMPANY) return '';
  return String(space?.departmentId || '').trim();
}

/** Projects suite shared/work modules require projectId (RULE-08). */
export function spaceRequiresProjectId(space) {
  return normalizeSpaceKind(space?.kind) === SPACE_KIND.PROJECT;
}

export function spaceHasProjectId(space) {
  return Boolean(String(space?.projectId || '').trim());
}

export { COMPANY_SPACE_LEVEL, normalizeCompanySpaceLevel };
