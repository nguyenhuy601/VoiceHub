/**
 * Merge AI staffing proposal skills with pack/registry metadata on approve.
 */

function normalizeSkillKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function skillNameFromRef(ref) {
  return String(ref?.skillNameSnapshot || ref?.name || ref?.rawInput || '').trim();
}

function buildRequirementSkillIndex(packRequirementSkills = []) {
  const byId = new Map();
  const byName = new Map();

  for (const ref of packRequirementSkills || []) {
    if (!ref || typeof ref !== 'object') continue;
    const name = skillNameFromRef(ref);
    const skillId = ref.skillId ? String(ref.skillId) : '';
    const requiredLevel =
      ref.requiredLevel != null && Number.isFinite(Number(ref.requiredLevel))
        ? Number(ref.requiredLevel)
        : null;
    const entry = {
      skillId: skillId || null,
      name: name || '',
      requiredLevel,
      registryStatus: String(ref.registryStatus || '').trim(),
    };
    if (skillId) byId.set(skillId, entry);
    if (name) {
      const key = normalizeSkillKey(name);
      const prev = byName.get(key);
      if (!prev || (entry.requiredLevel || 0) > (prev.requiredLevel || 0)) {
        byName.set(key, entry);
      }
    }
  }

  return { byId, byName };
}

function buildRollupSkillIndex(baselineRollupSkills = []) {
  const byName = new Map();
  for (const skill of baselineRollupSkills || []) {
    const name = String(skill?.name || '').trim();
    if (!name) continue;
    byName.set(normalizeSkillKey(name), {
      skillId: skill.skillId ? String(skill.skillId) : null,
      name,
      requiredLevel: null,
      registryStatus: String(skill.registryStatus || '').trim(),
    });
  }
  return byName;
}

function buildRegistrySkillIndex(registrySkills = []) {
  const byName = new Map();
  for (const skill of registrySkills || []) {
    const name = String(skill?.normalizedName || skill?.name || '').trim();
    if (!name) continue;
    byName.set(normalizeSkillKey(name), {
      skillId: skill.skillId ? String(skill.skillId) : skill._id ? String(skill._id) : null,
      name,
      requiredLevel: null,
      registryStatus: String(skill.status || skill.registryStatus || 'ACTIVE').trim(),
    });
  }
  return byName;
}

function resolveProposalSkillMeta(nameRaw, indexes) {
  const name = String(nameRaw || '').trim();
  const key = normalizeSkillKey(name);
  if (!name) return null;

  const fromReq = indexes.requirement.byName.get(key);
  if (fromReq?.skillId || fromReq?.requiredLevel != null) {
    return {
      name: fromReq.name || name,
      skillId: fromReq.skillId || null,
      requiredLevel: fromReq.requiredLevel ?? null,
      registryStatus: fromReq.registryStatus || '',
      source: 'ai',
    };
  }

  const fromRollup = indexes.rollup.get(key);
  if (fromRollup?.skillId) {
    return {
      name: fromRollup.name || name,
      skillId: fromRollup.skillId,
      requiredLevel: fromRollup.requiredLevel ?? null,
      registryStatus: fromRollup.registryStatus || '',
      source: 'ai',
    };
  }

  const fromRegistry = indexes.registry.get(key);
  if (fromRegistry?.skillId) {
    return {
      name: fromRegistry.name || name,
      skillId: fromRegistry.skillId,
      requiredLevel: null,
      registryStatus: fromRegistry.registryStatus || '',
      source: 'ai',
    };
  }

  if (fromReq) {
    return {
      name: fromReq.name || name,
      skillId: null,
      requiredLevel: fromReq.requiredLevel ?? null,
      registryStatus: fromReq.registryStatus || '',
      source: 'ai',
    };
  }

  return { name, skillId: null, requiredLevel: null, registryStatus: '', source: 'ai' };
}

/**
 * @param {{
 *   proposalSkills: object[]|string[],
 *   packRequirementSkills?: object[],
 *   baselineRollupSkills?: object[],
 *   registrySkills?: object[],
 * }} input
 */
function mergeProposalSkillsForStaffingPlan({
  proposalSkills = [],
  packRequirementSkills = [],
  baselineRollupSkills = [],
  registrySkills = [],
} = {}) {
  const indexes = {
    requirement: buildRequirementSkillIndex(packRequirementSkills),
    rollup: buildRollupSkillIndex(baselineRollupSkills),
    registry: buildRegistrySkillIndex(registrySkills),
  };

  const seen = new Set();
  const result = [];

  for (const item of proposalSkills || []) {
    const nameRaw = typeof item === 'string' ? item : item?.name;
    const meta = resolveProposalSkillMeta(nameRaw, indexes);
    if (!meta?.name) continue;
    const dedupeKey = meta.skillId || normalizeSkillKey(meta.name);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    result.push(meta);
  }

  return result;
}

module.exports = {
  mergeProposalSkillsForStaffingPlan,
  normalizeSkillKey,
  buildRequirementSkillIndex,
};
