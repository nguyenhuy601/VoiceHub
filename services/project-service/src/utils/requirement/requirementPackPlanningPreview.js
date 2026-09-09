/**
 * Post-import pack preview for drawer "Xem" — rollup hours + skill registry status.
 * Does not reuse raw importIssues (row numbers may differ from synthetic matrix).
 */

const { SHEETS } = require('../constants/requirementTemplate.constants');
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

function normalizeSkillKey(name) {
  return String(name || '').trim().toLowerCase();
}

function buildSkillStatusByLeafKey(requirementSkills = []) {
  const map = new Map();
  for (const ref of requirementSkills) {
    const externalId = String(ref.externalId || '').trim();
    const name = ref.skillNameSnapshot || ref.rawInput || '';
    const key = normalizeSkillKey(name);
    if (!externalId || !key) continue;
    map.set(`${externalId}:${key}`, {
      name: String(name).trim(),
      status: String(ref.registryStatus || '').trim().toUpperCase(),
      skillId: ref.skillId ? String(ref.skillId) : '',
    });
  }
  return map;
}

function buildFallbackPendingSkills(importSkillMeta = {}) {
  const set = new Set();
  for (const raw of importSkillMeta.newSkillsDetected || []) {
    const name = String(raw?.name || raw?.input || raw || '').trim();
    if (name) set.add(normalizeSkillKey(name));
  }
  return set;
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

function skillStatusMessage(name, status) {
  const label = String(name || '').trim() || 'Skill';
  const st = String(status || '').trim().toUpperCase();
  if (st === 'PENDING') {
    return `Skill ${label}: registered, awaiting review (PENDING)`;
  }
  if (st === 'ACTIVE') {
    return `Skill ${label}: active in registry (ACTIVE)`;
  }
  if (st === 'REJECTED') {
    return `Skill ${label}: rejected in registry — update Suggested Skills`;
  }
  if (st === 'LEGACY') {
    return `Skill ${label}: catalog skill (legacy whitelist)`;
  }
  return `Skill ${label}: ${st || 'registered'}`;
}

function skillIssueSeverity(status) {
  const st = String(status || '').trim().toUpperCase();
  if (st === 'REJECTED') return 'warning';
  if (st === 'PENDING') return 'info';
  return 'info';
}

function buildSkillPlanningIssues(frList, rowByExternalId, requirementSkills, importSkillMeta) {
  const issues = [];
  const statusByLeaf = buildSkillStatusByLeafKey(requirementSkills);
  const fallbackPending = buildFallbackPendingSkills(importSkillMeta);
  const seen = new Set();

  for (const fr of frList) {
    if (!isFrExecutionLeaf(fr, frList)) continue;
    const externalId = String(fr.externalId || '').trim();
    const row = rowByExternalId.get(externalId);
    if (!externalId || !row) continue;

    for (const rawSkill of fr.suggestedSkills || []) {
      const name = String(rawSkill || '').trim();
      const key = normalizeSkillKey(name);
      if (!key) continue;
      const dedupeKey = `${externalId}:${key}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      let statusRow = statusByLeaf.get(dedupeKey);
      if (!statusRow && fallbackPending.has(key)) {
        statusRow = { name, status: 'PENDING', skillId: '' };
      }
      if (!statusRow) continue;

      const status = statusRow.status;
      if (status === 'ACTIVE' || status === 'LEGACY') continue;

      issues.push(
        issue({
          code:
            status === 'REJECTED'
              ? 'REQ_PLANNING_SKILL_REJECTED'
              : status === 'PENDING'
                ? 'REQ_PLANNING_SKILL_PENDING'
                : 'REQ_PLANNING_SKILL_STATUS',
          sheet: SHEETS.FUNCTIONAL,
          row,
          column: 'Suggested Skills',
          severity: skillIssueSeverity(status),
          message: skillStatusMessage(statusRow.name || name, status),
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

  const issues = [
    ...buildEffortPlanningIssues(frList, rowByExternalId),
    ...buildSkillPlanningIssues(
      frList,
      rowByExternalId,
      pack.requirementSkills || [],
      pack.importSkillMeta || {}
    ),
  ];

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
  buildSkillPlanningIssues,
  buildEffortPlanningIssues,
};
