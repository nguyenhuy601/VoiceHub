/**
 * Split filtered canonical data into AI Context (LLM) vs Tool/Analytical data.
 */

const crypto = require('crypto');

const LLM_JOBS = new Set([
  'hierarchyDecomposition',
  'requirementAnalysis',
  'capabilityAnalysis',
  'wbsGeneration',
  'dependencyAnalysis',
  'architectureRiskAnalysis',
]);

function fingerprint(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32);
}

/**
 * @param {string} job
 * @param {object} jobFiltered — from applyJobFilter
 * @param {{ snapshotId?: string }} opts
 * @returns {{ aiContext: object|null, toolData: object|null, inputFingerprint: string }}
 */
function splitContext(job, jobFiltered = {}, opts = {}) {
  const key = String(job || '').trim();
  const snapshotId = String(opts.snapshotId || '').trim() || null;

  const aiContext = {
    snapshotId,
    overview: jobFiltered.overview || {},
    frSlices: (jobFiltered.frSlices || []).slice(0, 200),
    fr: (jobFiltered.fr || [])
      .filter((r) => String(r.level || '') === 'Requirement' || !r.level)
      .slice(0, 200)
      .map((r) => ({
        id: r.externalId,
        title: r.name,
        description: r.description,
        ac: r.acceptanceCriteria,
        module: r.moduleLabel,
        feature: r.featureLabel,
        skillCanonicalIds: r.skillCanonicalIds,
        roleCanonical: r.roleCanonical,
      })),
    nfr: (jobFiltered.nonFunctionalRequirements || []).slice(0, 50),
    technology: (jobFiltered.technology || []).slice(0, 30),
    requiredSkills: jobFiltered.merged?.requiredSkillIds || [],
  };

  const toolData = {
    snapshotId,
    employees: jobFiltered.employees || [],
    staffing: jobFiltered.staffing || {},
    requirementSkills: jobFiltered.requirementSkills || [],
    merged: jobFiltered.merged || {},
    calendar: jobFiltered.calendar || { workingCalendar: {}, holidays: [] },
    overview: {
      startDate: jobFiltered.overview?.startDate || null,
      deadline: jobFiltered.overview?.deadline || null,
      name: jobFiltered.overview?.name,
    },
    skillCatalog: jobFiltered.skillCatalog || {},
    filterMeta: jobFiltered.filterMeta || {},
  };

  const useLlm = LLM_JOBS.has(key);
  const useTool =
    key === 'effortRoleAnalysis' ||
    key === 'sequencingCpm' ||
    key === 'employeeMatching' ||
    key === 'scheduleCapacity' ||
    key === 'projectPlan' ||
    !useLlm;

  const result = {
    aiContext: useLlm ? aiContext : null,
    toolData: useTool || !useLlm ? toolData : useLlm ? null : toolData,
    inputFingerprint: fingerprint({
      snapshotId,
      job: key,
      ai: useLlm ? aiContext : null,
      tool: useTool ? toolData : null,
    }),
  };

  // Engine-heavy jobs still get toolData; LLM jobs get aiContext (and light tool null)
  if (useLlm && !useTool) {
    result.toolData = null;
  }
  if (!useLlm) {
    result.aiContext = null;
  }
  // Matching/schedule need tool only
  if (
    key === 'employeeMatching' ||
    key === 'scheduleCapacity' ||
    key === 'sequencingCpm' ||
    key === 'effortRoleAnalysis' ||
    key === 'projectPlan'
  ) {
    result.aiContext = null;
    result.toolData = toolData;
    result.inputFingerprint = fingerprint({
      snapshotId,
      job: key,
      tool: toolData,
    });
  }

  return result;
}

module.exports = {
  LLM_JOBS,
  splitContext,
  fingerprint,
};
