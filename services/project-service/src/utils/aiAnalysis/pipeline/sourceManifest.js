/**
 * Whitelist of sources + fields for AI Analysis snapshot projection.
 * Jobs declare which sources they need; resolveSources intersects with this.
 */

const SOURCE_IDS = Object.freeze([
  'srs_pack',
  'employee_pool',
  'skill_catalog',
  'org_calendar',
  /** View on employee history (verified PE) — not a separate fetch. */
  'project_history',
]);

/** Field lists used by fieldProjection — do not dump full DB docs. */
const SOURCE_FIELD_MANIFEST = Object.freeze({
  srs_pack: Object.freeze([
    'overview',
    'functionalRequirements',
    'nonFunctionalRequirements',
    'staffingPlan',
    'requirementSkills',
    'technology',
    'versionNumber',
    'templateVersion',
  ]),
  employee_pool: Object.freeze([
    'userId',
    'employeeId',
    'jobTitle',
    'membershipRole',
    'availability',
    'allocatedPct',
    'availablePct',
    'capacityRange',
    'skills',
    'capability',
    'performance',
    'isActive',
    'employeeCode',
    'projectCount',
    'resourceConfig',
    'maxConcurrentProjects',
    'history',
  ]),
  skill_catalog: Object.freeze(['version', 'skills']),
  org_calendar: Object.freeze(['workingCalendar', 'holidays']),
  /** Verified PE slice: cv_parse | closed_board | excel_import | manual. */
  project_history: Object.freeze([
    'role',
    'domain',
    'months',
    'projectName',
    'work',
    'source',
    'year',
  ]),
});

/** Which sources each planning job typically needs (after common filter). */
const JOB_SOURCE_NEEDS = Object.freeze({
  hierarchyDecomposition: ['srs_pack'],
  requirementAnalysis: ['srs_pack'],
  capabilityAnalysis: ['srs_pack', 'skill_catalog'],
  requirementInsights: ['srs_pack'],
  wbsGeneration: ['srs_pack'],
  dependencyAnalysis: ['srs_pack'],
  architectureRiskAnalysis: ['srs_pack'],
  effortRoleAnalysis: ['srs_pack', 'skill_catalog'],
  sequencingCpm: ['srs_pack'],
  employeeMatching: ['srs_pack', 'employee_pool', 'skill_catalog', 'project_history'],
  scheduleCapacity: ['srs_pack', 'employee_pool', 'org_calendar'],
  projectPlan: ['srs_pack', 'org_calendar'],
});

function sourcesForJob(job) {
  const key = String(job || '').trim();
  return JOB_SOURCE_NEEDS[key] || [...SOURCE_IDS];
}

module.exports = {
  SOURCE_IDS,
  SOURCE_FIELD_MANIFEST,
  JOB_SOURCE_NEEDS,
  sourcesForJob,
};
