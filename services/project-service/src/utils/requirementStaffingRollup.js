const { FR_LEAF_LEVEL } = require('../constants/requirementStaffing.constants');
const { parseDateValue } = require('./requirementDateUtils');
const { resolveWhitelistSkill, normalizeRoleKey } = require('./requirementStaffingParse');

function buildStaffingPlanFromParsed(parsed) {
  const overview = parsed?.overview || {};
  const frList = parsed?.functionalRequirements || [];
  const skillsMap = new Map();
  const rolesMap = new Map();
  let totalHours = 0;
  let hasAnyHours = false;

  for (const row of frList) {
    for (const skill of row.suggestedSkills || []) {
      const name = resolveWhitelistSkill(skill);
      if (!name) continue;
      if (!skillsMap.has(name.toLowerCase())) {
        skillsMap.set(name.toLowerCase(), { name, source: 'rollup' });
      }
    }
    if (row.level === FR_LEAF_LEVEL) {
      const hours = row.estimateHours;
      if (hours != null && hours > 0) {
        totalHours += hours;
        hasAnyHours = true;
      }
    }
    const roleKey = normalizeRoleKey(row.suggestedRoleKey);
    if (roleKey) {
      rolesMap.set(roleKey, (rolesMap.get(roleKey) || 0) + 1);
    }
  }

  const overviewStart = parseDateValue(overview.startDate);
  const overviewCurrency = String(overview.budgetCurrency || '').trim().toUpperCase();

  return {
    requiredSkills: [...skillsMap.values()],
    requiredRoles: [...rolesMap.entries()].map(([roleKey, requiredCount]) => ({
      roleKey,
      requiredCount,
      source: 'rollup',
    })),
    estimatedHoursTotal: hasAnyHours ? totalHours : null,
    startDate: overviewStart,
    budgetCurrency: overviewCurrency,
  };
}

module.exports = {
  buildStaffingPlanFromParsed,
};
