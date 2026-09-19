/**
 * Per-job / per-source field projection profiles for AI preprocess (Enterprise Step 2).
 * Snapshot ingest still loads all sources once; per-job views only expose needed fields.
 */

const { sourcesForJob, SOURCE_FIELD_MANIFEST } = require('./sourceManifest');

/** Employee fields allowed in cleaned projection — no email/avatar/displayName. */
const EMPLOYEE_PROJECTION_FIELDS = Object.freeze([
  'employeeId',
  'userId',
  'role',
  'skills',
  'availability',
  'workload',
  'history',
  'isActive',
  'skillCanonicalIds',
  'roleCanonicalId',
]);

/** SRS fields for WHAT / requirement-facing jobs. */
const SRS_WHAT_FIELDS = Object.freeze([
  'overview',
  'functionalRequirements',
  'frSlices',
  'nonFunctionalRequirements',
  'technology',
  'requirementSkills',
  'staffingPlan',
  'versionNumber',
  'templateVersion',
]);

const JOB_PROJECTION_PROFILES = Object.freeze({
  hierarchyDecomposition: {
    sources: ['srs_pack'],
    srsFields: SRS_WHAT_FIELDS,
    includeEmployees: false,
    includeCalendar: false,
    includeSkillCatalog: false,
  },
  requirementAnalysis: {
    sources: ['srs_pack'],
    srsFields: SRS_WHAT_FIELDS,
    includeEmployees: false,
    includeCalendar: false,
    includeSkillCatalog: false,
  },
  capabilityAnalysis: {
    sources: ['srs_pack', 'skill_catalog'],
    srsFields: SRS_WHAT_FIELDS,
    includeEmployees: false,
    includeCalendar: false,
    includeSkillCatalog: true,
  },
  /** WHAT narrative — SRS-only (no pool/calendar fallback leak). */
  requirementInsights: {
    sources: ['srs_pack'],
    srsFields: SRS_WHAT_FIELDS,
    includeEmployees: false,
    includeCalendar: false,
    includeSkillCatalog: false,
  },
  wbsGeneration: {
    sources: ['srs_pack'],
    srsFields: SRS_WHAT_FIELDS,
    includeEmployees: false,
    includeCalendar: false,
    includeSkillCatalog: false,
  },
  dependencyAnalysis: {
    sources: ['srs_pack'],
    srsFields: ['overview', 'functionalRequirements', 'frSlices', 'technology'],
    includeEmployees: false,
    includeCalendar: false,
    includeSkillCatalog: false,
  },
  architectureRiskAnalysis: {
    sources: ['srs_pack'],
    srsFields: [
      'overview',
      'functionalRequirements',
      'frSlices',
      'nonFunctionalRequirements',
      'technology',
    ],
    includeEmployees: false,
    includeCalendar: false,
    includeSkillCatalog: false,
  },
  effortRoleAnalysis: {
    sources: ['srs_pack', 'skill_catalog'],
    srsFields: [
      'overview',
      'functionalRequirements',
      'frSlices',
      'staffingPlan',
      'requirementSkills',
    ],
    includeEmployees: false,
    includeCalendar: false,
    includeSkillCatalog: true,
  },
  sequencingCpm: {
    sources: ['srs_pack'],
    srsFields: ['overview', 'functionalRequirements', 'frSlices'],
    includeEmployees: false,
    includeCalendar: false,
    includeSkillCatalog: false,
  },
  employeeMatching: {
    sources: ['srs_pack', 'employee_pool', 'skill_catalog'],
    srsFields: ['overview', 'staffingPlan', 'requirementSkills', 'functionalRequirements'],
    includeEmployees: true,
    includeCalendar: false,
    includeSkillCatalog: true,
    employeeFields: EMPLOYEE_PROJECTION_FIELDS,
  },
  scheduleCapacity: {
    sources: ['srs_pack', 'employee_pool', 'org_calendar'],
    srsFields: ['overview', 'staffingPlan'],
    includeEmployees: true,
    includeCalendar: true,
    includeSkillCatalog: false,
    employeeFields: EMPLOYEE_PROJECTION_FIELDS,
  },
  projectPlan: {
    sources: ['srs_pack', 'org_calendar'],
    srsFields: ['overview', 'staffingPlan'],
    includeEmployees: false,
    includeCalendar: true,
    includeSkillCatalog: false,
  },
});

function getJobProjectionProfile(job) {
  const key = String(job || '').trim();
  if (JOB_PROJECTION_PROFILES[key]) return JOB_PROJECTION_PROFILES[key];
  return {
    sources: sourcesForJob(key),
    srsFields: SRS_WHAT_FIELDS,
    includeEmployees: true,
    includeCalendar: true,
    includeSkillCatalog: true,
    employeeFields: EMPLOYEE_PROJECTION_FIELDS,
  };
}

/**
 * Slim a full snapshot.projected blob to a job profile (no re-fetch).
 */
function projectSnapshotForJob(projected = {}, job) {
  const profile = getJobProjectionProfile(job);
  const srsIn = projected.srs || {};
  const srs = {};
  for (const field of profile.srsFields || []) {
    if (srsIn[field] !== undefined) srs[field] = srsIn[field];
  }

  const out = { srs };
  if (profile.includeEmployees) {
    const allow = new Set(profile.employeeFields || EMPLOYEE_PROJECTION_FIELDS);
    out.employees = (projected.employees || []).map((emp) => {
      const slim = {};
      for (const f of allow) {
        if (emp[f] !== undefined) slim[f] = emp[f];
      }
      // Compat for matching engines that still read jobTitle / availablePct
      if (emp.userId && !slim.userId) slim.userId = emp.userId;
      if (emp.role && !slim.jobTitle) slim.jobTitle = emp.role;
      if (emp.workload) {
        slim.allocatedPct = emp.workload.allocatedPct;
        slim.availablePct = emp.workload.availablePct;
        slim.capacityRange = emp.workload.capacityRange;
      }
      return slim;
    });
  }
  if (profile.includeSkillCatalog) {
    out.skillCatalog = projected.skillCatalog || { version: '', skills: [] };
  }
  if (profile.includeCalendar) {
    out.calendar = projected.calendar || { workingCalendar: {}, holidays: [] };
  }
  return out;
}

module.exports = {
  EMPLOYEE_PROJECTION_FIELDS,
  SRS_WHAT_FIELDS,
  JOB_PROJECTION_PROFILES,
  SOURCE_FIELD_MANIFEST,
  getJobProjectionProfile,
  projectSnapshotForJob,
};
