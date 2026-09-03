const { isFrExecutionLeaf } = require('./requirementFrLevel');
const { resolveSkillsBatch, isRegistryEnabled } = require('../clients/skillRegistry.client');
const { resolveWhitelistSkill } = require('./requirementStaffingParse');

function collectUniqueSkillsFromParsed(parsed) {
  const set = new Set();
  for (const row of parsed?.functionalRequirements || []) {
    for (const skill of row.suggestedSkills || []) {
      const s = String(skill || '').trim();
      if (s) set.add(s);
    }
  }
  return [...set];
}

function buildResolveMap(results = []) {
  const map = new Map();
  for (const row of results) {
    const key = String(row.input || '').trim().toLowerCase();
    if (!key) continue;
    map.set(key, row);
  }
  return map;
}

function resolveSkillForInput(raw, resolveMap) {
  const key = String(raw || '').trim().toLowerCase();
  if (resolveMap.has(key)) return resolveMap.get(key);
  const fallbackName = resolveWhitelistSkill(raw) || String(raw || '').trim();
  return {
    input: raw,
    skillId: '',
    name: fallbackName,
    status: isRegistryEnabled() ? 'LEGACY' : 'ACTIVE',
    isNew: false,
    suggestedCanonical: fallbackName,
  };
}

function applySkillRefsToFunctionalRow(row, resolveMap) {
  const suggestedSkills = (row.suggestedSkills || [])
    .map((raw) => {
      const resolved = resolveSkillForInput(raw, resolveMap);
      return resolved.name || resolveWhitelistSkill(raw) || String(raw || '').trim();
    })
    .filter(Boolean);

  return {
    ...row,
    suggestedSkills,
  };
}

function buildRequirementSkillRefs(parsed, resolveMap) {
  const frList = parsed?.functionalRequirements || [];
  const refs = [];
  for (const row of frList) {
    if (!isFrExecutionLeaf(row, frList)) continue;
    for (const raw of row.suggestedSkills || []) {
      const resolved = resolveSkillForInput(raw, resolveMap);
      const name = resolved.name || String(raw || '').trim();
      if (!name) continue;
      refs.push({
        externalId: row.externalId,
        skillId: resolved.skillId || null,
        skillNameSnapshot: name,
        rawInput: String(raw || '').trim(),
        requiredLevel: row.requiredSkillLevel ?? null,
        importance: 'required',
        registryStatus: resolved.status || '',
      });
    }
  }
  return refs;
}

function buildStaffingSkillsFromResolveMap(results = []) {
  const map = new Map();
  for (const row of results) {
    const name = row.name || row.suggestedCanonical;
    if (!name || row.status === 'REJECTED') continue;
    const key = String(name).toLowerCase();
    if (map.has(key)) continue;
    map.set(key, {
      skillId: row.skillId || null,
      name,
      registryStatus: row.status || '',
      source: 'rollup',
    });
  }
  return [...map.values()];
}

async function enrichParsedWithSkillRegistry(organizationId, parsed) {
  if (!parsed) return { parsed, newSkills: [], resolveEnabled: false, results: [] };
  const uniqueSkills = collectUniqueSkillsFromParsed(parsed);
  if (!uniqueSkills.length) {
    return { parsed, newSkills: [], resolveEnabled: isRegistryEnabled(), results: [] };
  }

  const batch = await resolveSkillsBatch(organizationId, uniqueSkills, { source: 'Import' });
  const resolveMap = buildResolveMap(batch.results);

  const functionalRequirements = (parsed.functionalRequirements || []).map((row) =>
    applySkillRefsToFunctionalRow(row, resolveMap)
  );

  const enriched = {
    ...parsed,
    functionalRequirements,
    _skillResolveResults: batch.results,
    _requirementSkillRefs: buildRequirementSkillRefs(
      { functionalRequirements },
      resolveMap
    ),
    _staffingSkillsResolved: buildStaffingSkillsFromResolveMap(batch.results),
  };

  return {
    parsed: enriched,
    newSkills: batch.newSkills || [],
    resolveEnabled: batch.enabled,
    results: batch.results || [],
    error: batch.error || null,
  };
}

module.exports = {
  collectUniqueSkillsFromParsed,
  enrichParsedWithSkillRegistry,
  buildRequirementSkillRefs,
  buildStaffingSkillsFromResolveMap,
  resolveSkillForInput,
};
