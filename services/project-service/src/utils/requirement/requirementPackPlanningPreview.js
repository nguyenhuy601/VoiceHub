/**
 * Post-import pack preview for drawer "Xem" — rollup hours (skills are string-only).
 * Does not reuse raw importIssues (row numbers may differ from synthetic matrix).
 */

const { SHEETS } = require('../../constants/requirementTemplate.constants');
const { rollupFrEstimateHours } = require('./requirementStaffingRollup');
const { isFrExecutionLeaf } = require('./requirementFrLevel');

const HANDLED_IMPORT_WARNING_CODES = Object.freeze([
  'REQ_FR_EFFORT_NON_LEAF',
  'REQ_FR_NEW_SKILL',
]);

function issue({ code, sheet, row, column, message, severity = 'info' }) {
  return { code, sheet, row, column, message, severity };
}

function sortedFunctionalRequirements(frList = []) {
  return [...frList].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function buildFrRowNumberByExternalId(frList = []) {
  const sorted = sortedFunctionalRequirements(frList);
  const map = new Map();
  sorted.forEach((fr, idx) => {
    const id = String(fr.externalId || '').trim();
    if (id) map.set(id, idx + 2);
  });
  return map;
}

function buildEffortPlanningIssues(frList, rowByExternalId) {
  const issues = [];
  const hoursById = rollupFrEstimateHours(frList);

  for (const fr of frList) {
    if (isFrExecutionLeaf(fr, frList)) continue;
    const externalId = String(fr.externalId || '').trim();
    if (!externalId) continue;

    const rollup = hoursById.get(externalId);
    const stored = fr.estimateHours;
    const storedNum = stored != null && Number(stored) > 0 ? Number(stored) : null;
    const rollupNum = rollup != null && rollup > 0 ? Number(rollup) : null;

    if (storedNum != null && rollupNum != null && storedNum !== rollupNum) {
      const row = rowByExternalId.get(externalId);
      if (!row) continue;
      issues.push(
        issue({
          code: 'REQ_PLANNING_EFFORT_CORRECTED',
          sheet: SHEETS.FUNCTIONAL,
          row,
          column: 'Effort Hours',
          severity: 'info',
          message: `Effort Hours adjusted from ${storedNum}h to rolled-up ${rollupNum}h on parent row`,
        })
      );
    }
  }

  return issues;
}

function countBySeverity(issues) {
  let warningCount = 0;
  let infoCount = 0;
  let errorCount = 0;
  for (const row of issues) {
    const sev = row.severity === 'warning' ? 'warning' : row.severity === 'error' ? 'error' : 'info';
    if (sev === 'warning') warningCount += 1;
    else if (sev === 'error') errorCount += 1;
    else infoCount += 1;
  }
  return { errorCount, warningCount, infoCount };
}

/**
 * @param {object} pack — RequirementPack lean object
 * @returns {object} planningPreview
 */
function buildPackPlanningPreview(pack = {}) {
  const { buildSyntheticExcelPreviewFromPack } = require('./requirementPackPreviewFallback');
  const frList = Array.isArray(pack.functionalRequirements) ? pack.functionalRequirements : [];
  const excelPreview = buildSyntheticExcelPreviewFromPack(pack);
  const rowByExternalId = buildFrRowNumberByExternalId(frList);

  const issues = [...buildEffortPlanningIssues(frList, rowByExternalId)];

  const { errorCount, warningCount, infoCount } = countBySeverity(issues);

  return {
    excelPreview,
    issues,
    errorCount,
    warningCount,
    infoCount,
    handledImportWarnings: [...HANDLED_IMPORT_WARNING_CODES],
  };
}

module.exports = {
  HANDLED_IMPORT_WARNING_CODES,
  buildPackPlanningPreview,
  buildFrRowNumberByExternalId,
  buildSkillPlanningIssues: () => [],
  buildEffortPlanningIssues,
};
