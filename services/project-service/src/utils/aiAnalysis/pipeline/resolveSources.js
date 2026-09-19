/**
 * Resolve which sources to load for an Analysis Snapshot (not full DB).
 * Snapshot create: all system sources once. Per-job: sourcesForJob.
 */

const { SOURCE_IDS, sourcesForJob } = require('./sourceManifest');

const SOURCE_REASONS = Object.freeze({
  srs_pack: 'requirement_pack_primary',
  employee_pool: 'org_resource_pool_for_matching',
  skill_catalog: 'capability_whitelist_pin',
  org_calendar: 'working_calendar_holidays',
});

/**
 * @param {{ includeEmployees?: boolean, includeCalendar?: boolean, includeSkills?: boolean, job?: string }} opts
 * @returns {{ id: string, reason: string }[]}
 */
function resolveSources(opts = {}) {
  if (opts.job) {
    const ids = sourcesForJob(opts.job);
    return ids
      .filter((id) => SOURCE_IDS.includes(id))
      .map((id) => ({ id, reason: SOURCE_REASONS[id] || 'job_source' }));
  }

  const includeEmployees = opts.includeEmployees !== false;
  const includeCalendar = opts.includeCalendar !== false;
  const includeSkills = opts.includeSkills !== false;

  const out = [{ id: 'srs_pack', reason: SOURCE_REASONS.srs_pack }];
  if (includeEmployees) {
    out.push({ id: 'employee_pool', reason: SOURCE_REASONS.employee_pool });
  }
  if (includeSkills) {
    out.push({ id: 'skill_catalog', reason: SOURCE_REASONS.skill_catalog });
  }
  if (includeCalendar) {
    out.push({ id: 'org_calendar', reason: SOURCE_REASONS.org_calendar });
  }

  const allowed = new Set(SOURCE_IDS);
  return out.filter((s) => allowed.has(s.id));
}

module.exports = {
  resolveSources,
  SOURCE_REASONS,
};
