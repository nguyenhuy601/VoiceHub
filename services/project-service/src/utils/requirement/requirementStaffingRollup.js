const { parseDateValue } = require('./requirementDateUtils');

const { resolveWhitelistSkill, normalizeRoleKey } = require('./requirementStaffingParse');

const {

  isFrExecutionLeaf,

  isFrExecutionLeafLevel,

  isFrRoleRequiredLevel,

} = require('./requirementFrLevel');



/**

 * Roll up Effort Hours from execution leaves to parent FR nodes.

 * @returns {Map<string, number|null>} externalId → hours (null when subtree has no leaf hours)

 */

function rollupFrEstimateHours(frList = []) {

  const byId = new Map();

  const childrenByParent = new Map();



  for (const row of frList) {

    const externalId = String(row.externalId || '').trim();

    if (!externalId) continue;

    byId.set(externalId, row);

    const parentId = String(row.parentExternalId || '').trim();

    if (!parentId) continue;

    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);

    childrenByParent.get(parentId).push(externalId);

  }



  const cache = new Map();



  function computeHours(externalId) {

    if (cache.has(externalId)) return cache.get(externalId);

    const row = byId.get(externalId);

    if (!row) {

      cache.set(externalId, null);

      return null;

    }



    if (isFrExecutionLeaf(row, frList)) {

      const hours = row.estimateHours;

      const leafHours =

        hours != null && Number(hours) > 0 ? Number(hours) : null;

      cache.set(externalId, leafHours);

      return leafHours;

    }



    const childIds = childrenByParent.get(externalId) || [];

    let sum = 0;

    let hasAny = false;

    for (const childId of childIds) {

      const childHours = computeHours(childId);

      if (childHours != null && childHours > 0) {

        sum += childHours;

        hasAny = true;

      }

    }

    const rolled = hasAny ? sum : null;

    cache.set(externalId, rolled);

    return rolled;

  }



  const result = new Map();

  for (const externalId of byId.keys()) {

    result.set(externalId, computeHours(externalId));

  }

  return result;

}



function buildStaffingPlanFromParsed(parsed, options = {}) {

  const resolvedStaffingSkills = options.resolvedStaffingSkills;

  const overview = parsed?.overview || {};

  const frList = parsed?.functionalRequirements || [];

  const skillsMap = new Map();

  const rolesMap = new Map();

  let totalHours = 0;

  let hasAnyHours = false;



  if (Array.isArray(resolvedStaffingSkills) && resolvedStaffingSkills.length) {

    for (const skill of resolvedStaffingSkills) {

      const name = String(skill.name || '').trim();

      if (!name) continue;

      skillsMap.set(name.toLowerCase(), {

        skillId: skill.skillId || null,

        name,

        registryStatus: skill.registryStatus || '',

        source: skill.source || 'rollup',

      });

    }

  }



  for (const row of frList) {

    for (const skill of row.suggestedSkills || []) {

      const name = resolveWhitelistSkill(skill) || String(skill || '').trim();

      if (!name) continue;

      if (!skillsMap.has(name.toLowerCase())) {

        skillsMap.set(name.toLowerCase(), { name, source: 'rollup' });

      }

    }

    if (isFrExecutionLeaf(row, frList)) {

      const hours = row.estimateHours;

      if (hours != null && hours > 0) {

        totalHours += hours;

        hasAnyHours = true;

      }

      const roleKey = normalizeRoleKey(row.suggestedRoleKey);

      if (roleKey) {

        rolesMap.set(roleKey, (rolesMap.get(roleKey) || 0) + 1);

      }

    } else if (isFrRoleRequiredLevel(row.level) && !isFrExecutionLeaf(row, frList)) {

      const roleKey = normalizeRoleKey(row.suggestedRoleKey);

      if (roleKey) {

        rolesMap.set(roleKey, (rolesMap.get(roleKey) || 0) + 1);

      }

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

  rollupFrEstimateHours,

  isFrExecutionLeafLevel,

};


