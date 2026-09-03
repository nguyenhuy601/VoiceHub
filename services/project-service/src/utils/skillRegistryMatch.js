/**
 * Registry-mediated skill matching — exact, related (parent/relatedSkillIds), level adequacy.
 */

function normalizeKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function buildRegistryIndex(registrySkills = []) {
  const byId = new Map();
  const byNorm = new Map();
  for (const skill of registrySkills || []) {
    const id = String(skill.skillId || skill._id || '').trim();
    if (!id) continue;
    byId.set(id, skill);
    byNorm.set(normalizeKey(skill.normalizedName || skill.name), skill);
    for (const alias of skill.aliases || []) {
      byNorm.set(normalizeKey(alias), skill);
    }
  }
  return { byId, byNorm };
}

function employeeSkillKeys(verifiedCapability, registryIndex) {
  const keys = new Set();
  const idSet = new Set();
  for (const row of verifiedCapability?.skills || []) {
    if (row.skillId) {
      idSet.add(String(row.skillId));
      const reg = registryIndex.byId.get(String(row.skillId));
      if (reg) keys.add(normalizeKey(reg.normalizedName || reg.name));
    }
    const nameKey = normalizeKey(row.name);
    if (nameKey) keys.add(nameKey);
  }
  return { keys, idSet };
}

/**
 * @param {object[]} requiredSkills — { skillId?, name, requiredLevel? }
 * @param {object} verifiedCapability
 * @param {object[]} registrySkills
 */
function scoreRegistrySkillMatch(requiredSkills = [], verifiedCapability = {}, registrySkills = []) {
  const required = (requiredSkills || []).filter((s) => s && (s.skillId || s.name));
  if (!required.length) {
    return { score: 0, boost: 0, matched: [], relatedMatched: [], levelGaps: [], reasons: [] };
  }

  const registryIndex = buildRegistryIndex(registrySkills);
  const employee = employeeSkillKeys(verifiedCapability, registryIndex);
  const skillLevelMap = new Map();
  for (const row of verifiedCapability?.skills || []) {
    const level = Number(row.level) || 3;
    if (row.skillId) skillLevelMap.set(String(row.skillId), level);
    const nk = normalizeKey(row.name);
    if (nk) skillLevelMap.set(nk, level);
  }

  const matched = [];
  const relatedMatched = [];
  const levelGaps = [];
  let exactPoints = 0;
  let relatedPoints = 0;

  for (const req of required) {
    const reqId = req.skillId ? String(req.skillId) : '';
    const reqNameKey = normalizeKey(req.name);
    const reg = reqId
      ? registryIndex.byId.get(reqId)
      : registryIndex.byNorm.get(reqNameKey);
    const requiredLevel = Number(req.requiredLevel) || null;

    let employeeLevel = null;
    let hitExact = false;

    if (reqId && employee.idSet.has(reqId)) {
      hitExact = true;
      employeeLevel = skillLevelMap.get(reqId) ?? null;
    } else if (reg) {
      const regKey = normalizeKey(reg.normalizedName || reg.name);
      if (employee.keys.has(regKey)) {
        hitExact = true;
        employeeLevel = skillLevelMap.get(regKey) ?? employeeLevel;
      }
    } else if (reqNameKey && employee.keys.has(reqNameKey)) {
      hitExact = true;
      employeeLevel = skillLevelMap.get(reqNameKey) ?? null;
    }

    if (hitExact) {
      matched.push(reg?.name || req.name);
      exactPoints += 12;
      if (requiredLevel != null && employeeLevel != null && employeeLevel < requiredLevel) {
        levelGaps.push({ skill: reg?.name || req.name, requiredLevel, employeeLevel });
        exactPoints -= 3;
      } else if (requiredLevel != null && employeeLevel != null && employeeLevel >= requiredLevel) {
        exactPoints += 2;
      }
      continue;
    }

    if (reg) {
      const parentId = reg.parentSkillId ? String(reg.parentSkillId) : '';
      const relatedIds = (reg.relatedSkillIds || []).map(String);
      const relatedHit =
        (parentId && employee.idSet.has(parentId)) ||
        relatedIds.some((rid) => employee.idSet.has(rid)) ||
        relatedIds.some((rid) => {
          const rel = registryIndex.byId.get(rid);
          if (!rel) return false;
          return employee.keys.has(normalizeKey(rel.normalizedName || rel.name));
        });
      if (relatedHit) {
        relatedMatched.push(reg.name);
        relatedPoints += 7;
      }
    }
  }

  const boost = exactPoints + relatedPoints;
  const coverage = required.length
    ? (matched.length + relatedMatched.length * 0.6) / required.length
    : 0;
  const score = Math.round(Math.min(100, Math.max(0, coverage * 70 + boost)));

  const reasons = [];
  if (matched.length) reasons.push(`exact:${matched.length}`);
  if (relatedMatched.length) reasons.push(`related:${relatedMatched.length}`);
  if (levelGaps.length) reasons.push(`level_gap:${levelGaps.length}`);

  return {
    score,
    boost,
    matched,
    relatedMatched,
    levelGaps,
    coverage,
    reasons,
  };
}

module.exports = {
  scoreRegistrySkillMatch,
  buildRegistryIndex,
  normalizeKey,
};
