/**
 * Org-level Project Visibility Policy — SSOT normalize + defaults.
 * Used by organization-service (settings) and project-service (resolve).
 */

const VISIBILITY_AUDIENCES = Object.freeze([
  'system_admins',
  'organization_admins',
  'directors',
  'project_managers',
  'project_members',
  'related_department_managers',
  'related_department_members',
  'all_employees',
]);

const INFORMATION_LEVELS = Object.freeze(['summary', 'details', 'confidential']);

const INFORMATION_LEVEL_RANK = Object.freeze({
  summary: 1,
  details: 2,
  confidential: 3,
});

const DEFAULT_DISCOVER_AUDIENCES = Object.freeze({
  system_admins: true,
  organization_admins: true,
  directors: true,
  project_managers: true,
  project_members: true,
  related_department_managers: true,
  related_department_members: false,
  all_employees: false,
});

const DEFAULT_INFORMATION_LEVELS = Object.freeze({
  system_admins: 'confidential',
  organization_admins: 'confidential',
  directors: 'details',
  project_managers: 'confidential',
  project_members: 'details',
  related_department_managers: 'summary',
  related_department_members: 'summary',
  all_employees: 'summary',
});

function isValidInformationLevel(level) {
  return INFORMATION_LEVELS.includes(String(level || '').trim().toLowerCase());
}

function maxInformationLevel(levels = []) {
  let best = 'summary';
  let bestRank = 0;
  for (const raw of levels) {
    const level = String(raw || '').trim().toLowerCase();
    const rank = INFORMATION_LEVEL_RANK[level] || 0;
    if (rank > bestRank) {
      bestRank = rank;
      best = level;
    }
  }
  return best;
}

/**
 * @param {object} [raw]
 * @returns {{
 *   discoverAudiences: Record<string, boolean>,
 *   defaultInformationLevels: Record<string, string>,
 *   allowProjectManagerOverride: boolean,
 * }}
 */
function normalizeProjectVisibilityPolicy(raw = {}) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const discoverIn =
    input.discoverAudiences && typeof input.discoverAudiences === 'object'
      ? input.discoverAudiences
      : {};
  const levelsIn =
    input.defaultInformationLevels && typeof input.defaultInformationLevels === 'object'
      ? input.defaultInformationLevels
      : {};

  const discoverAudiences = {};
  const defaultInformationLevels = {};

  for (const audience of VISIBILITY_AUDIENCES) {
    if (audience === 'system_admins') {
      discoverAudiences.system_admins = true;
    } else if (Object.prototype.hasOwnProperty.call(discoverIn, audience)) {
      discoverAudiences[audience] = Boolean(discoverIn[audience]);
    } else {
      discoverAudiences[audience] = Boolean(DEFAULT_DISCOVER_AUDIENCES[audience]);
    }

    const levelRaw = levelsIn[audience];
    if (isValidInformationLevel(levelRaw)) {
      defaultInformationLevels[audience] = String(levelRaw).trim().toLowerCase();
    } else {
      defaultInformationLevels[audience] = DEFAULT_INFORMATION_LEVELS[audience];
    }
  }

  return {
    discoverAudiences,
    defaultInformationLevels,
    allowProjectManagerOverride:
      input.allowProjectManagerOverride === undefined
        ? true
        : Boolean(input.allowProjectManagerOverride),
  };
}

function defaultProjectVisibilityPolicy() {
  return normalizeProjectVisibilityPolicy({});
}

module.exports = {
  VISIBILITY_AUDIENCES,
  INFORMATION_LEVELS,
  INFORMATION_LEVEL_RANK,
  DEFAULT_DISCOVER_AUDIENCES,
  DEFAULT_INFORMATION_LEVELS,
  isValidInformationLevel,
  maxInformationLevel,
  normalizeProjectVisibilityPolicy,
  defaultProjectVisibilityPolicy,
};
