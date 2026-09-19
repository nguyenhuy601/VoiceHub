/**
 * Dataset version pins for Analysis Snapshot (reproducibility / audit).
 */

const crypto = require('crypto');
const { PIPELINE_VERSION, SKILL_CATALOG_VERSION } = require('./pipelineConstants');

function stableHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

/**
 * @param {{ packVersionNumber?: number, packContentHash?: string }} opts
 */
function buildSrsVersionPin({ packVersionNumber, packContentHash } = {}) {
  const v = Number(packVersionNumber) || 1;
  const hash = String(packContentHash || '').slice(0, 12) || 'unknown';
  return `SRS-v${v}-${hash}`;
}

/**
 * @param {object[]} projectedEmployees
 */
function buildEmployeeVersionPin(projectedEmployees = []) {
  const digest = stableHash(
    (projectedEmployees || []).map((e) => ({
      id: e.employeeId || e.userId,
      role: e.jobTitle || e.role || '',
      skills: e.skills || [],
      avail: e.availability,
      alloc: e.allocatedPct,
      availPct: e.availablePct,
    }))
  );
  return `Employee-v${projectedEmployees.length}-${digest}`;
}

function buildSkillVersionPin(catalogVersion = SKILL_CATALOG_VERSION) {
  return `Skill-${String(catalogVersion || SKILL_CATALOG_VERSION)}`;
}

/**
 * @param {{ workingCalendar?: object, holidays?: object[] }} calendar
 */
function buildCalendarVersionPin(calendar = {}) {
  const digest = stableHash({
    cal: calendar.workingCalendar || {},
    hol: calendar.holidays || [],
  });
  return `Calendar-${digest}`;
}

/**
 * @returns {{ srs: string, employee: string, skill: string, calendar: string, pipeline: number }}
 */
function buildDatasetVersions({
  packVersionNumber,
  packContentHash,
  projectedEmployees,
  skillCatalogVersion,
  calendar,
} = {}) {
  return {
    srs: buildSrsVersionPin({ packVersionNumber, packContentHash }),
    employee: buildEmployeeVersionPin(projectedEmployees),
    skill: buildSkillVersionPin(skillCatalogVersion),
    calendar: buildCalendarVersionPin(calendar),
    pipeline: PIPELINE_VERSION,
  };
}

module.exports = {
  stableHash,
  buildSrsVersionPin,
  buildEmployeeVersionPin,
  buildSkillVersionPin,
  buildCalendarVersionPin,
  buildDatasetVersions,
};
