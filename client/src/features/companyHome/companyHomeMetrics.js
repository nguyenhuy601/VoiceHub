/**
 * Pure helpers for company department/team home overview (Wave 1).
 * No React / API — only derive display model from shell + optional doc count.
 */

import {
  COMPANY_SPACE_LEVEL,
  listMyTeamsFromShell,
  resolveDepartmentLabel,
  resolveTeamLabel,
} from '../../utils/companySpaceLevel.js';

const UNKNOWN = '—';

/**
 * @param {unknown} files
 * @param {{ departmentId?: string, teamId?: string }} scope
 * @param {(files: unknown[], opts: object) => unknown[]} filterFn
 * @returns {number|null} null when files not loaded
 */
export function countScopedHomeDocuments(files, scope, filterFn) {
  if (!Array.isArray(files)) return null;
  if (typeof filterFn !== 'function') return files.length;
  const filtered = filterFn(files, {
    departmentId: String(scope?.departmentId || '').trim(),
    teamId: String(scope?.teamId || '').trim(),
  });
  return Array.isArray(filtered) ? filtered.length : 0;
}

/**
 * @param {object} params
 * @param {object|null} params.shell
 * @param {string} params.departmentId
 * @param {string} params.teamId
 * @param {string} params.level
 * @param {number|null} [params.documentCount]
 * @param {{
 *   homeFallback: string,
 *   teamFallback: string,
 *   deptSub: string,
 *   teamSub: (deptName: string) => string,
 *   pulseTeams: string,
 *   pulseDocs: string,
 *   distTeams: string,
 *   distDocs: string,
 * }} params.labels
 */
export function buildCompanyHomeViewModel({
  shell = null,
  departmentId = '',
  teamId = '',
  level = COMPANY_SPACE_LEVEL.DEPARTMENT,
  documentCount = null,
  labels,
} = {}) {
  const deptId = String(departmentId || '').trim();
  const tid = String(teamId || '').trim();
  const isTeam = level === COMPANY_SPACE_LEVEL.TEAM && Boolean(tid);

  const deptName =
    resolveDepartmentLabel(shell, deptId) || labels?.homeFallback || '';
  const teamName = resolveTeamLabel(shell, tid);
  const myTeams = deptId ? listMyTeamsFromShell(shell, deptId) : [];
  const teamCount = myTeams.length;

  const title = isTeam
    ? teamName || labels?.teamFallback || tid
    : deptName || labels?.homeFallback || '';
  const subtitle = isTeam
    ? typeof labels?.teamSub === 'function'
      ? labels.teamSub(deptName)
      : ''
    : labels?.deptSub || '';

  const docsKnown = documentCount != null && Number.isFinite(Number(documentCount));
  const docsValue = docsKnown ? String(Math.max(0, Number(documentCount))) : UNKNOWN;

  const pulse = [
    {
      key: 'teams',
      label: labels?.pulseTeams || '',
      value: String(teamCount),
    },
    {
      key: 'docs',
      label: labels?.pulseDocs || '',
      value: docsValue,
    },
  ];

  const docsBar = docsKnown ? Math.max(0, Number(documentCount)) : 0;
  const distMax = Math.max(teamCount, docsBar, 1);
  const distribution = [
    {
      key: 'teams',
      label: labels?.distTeams || '',
      value: teamCount,
      max: distMax,
    },
    {
      key: 'docs',
      label: labels?.distDocs || '',
      value: docsBar,
      max: distMax,
      unknown: !docsKnown,
    },
  ];

  return {
    isTeam,
    departmentId: deptId,
    teamId: isTeam ? tid : '',
    title,
    subtitle,
    deptName,
    teamName: teamName || '',
    myTeams,
    teamCount,
    documentCount: docsKnown ? Number(documentCount) : null,
    documentDisplay: docsValue,
    docsKnown,
    pulse,
    distribution,
  };
}

/**
 * Map metric card key → navigation path key used by overview.
 * Chỉ keys mirror MENU CHÍNH company (+ teams → chat).
 * @param {string} metricKey
 * @returns {'chat'|'documents'|'teams'|null}
 */
export function resolveCompanyHomeMetricNav(metricKey) {
  switch (String(metricKey || '').trim()) {
    case 'chat':
      return 'chat';
    case 'documents':
      return 'documents';
    case 'teams':
      return 'teams';
    default:
      return null;
  }
}
