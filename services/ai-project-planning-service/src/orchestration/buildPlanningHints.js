/**
 * Semantic planning hints from pack FR/UC/AC/skills — real fields only (HARD-03).
 * Never invent FRs; empty arrays when missing.
 */

function listFrRows(pack = {}) {
  if (Array.isArray(pack.functionalRequirements)) return pack.functionalRequirements;
  if (Array.isArray(pack.frList)) return pack.frList;
  if (Array.isArray(pack.requirements)) return pack.requirements;
  return [];
}

function listUseCases(pack = {}) {
  if (Array.isArray(pack.useCases)) return pack.useCases;
  if (Array.isArray(pack.ucList)) return pack.ucList;
  return [];
}

function frId(row, index = 0) {
  return String(row?.externalId || row?.id || row?._id || '').trim() || `FR-${index + 1}`;
}

function ucId(row, index = 0) {
  return String(row?.externalId || row?.id || row?._id || row?.ucKey || '').trim() || `UC-${index + 1}`;
}

function splitAcceptanceCriteria(row) {
  if (Array.isArray(row?.acceptanceCriteriaList)) {
    return row.acceptanceCriteriaList.map((x) => String(x || '').trim()).filter(Boolean);
  }
  if (Array.isArray(row?.acceptanceCriteria) && row.acceptanceCriteria.every((x) => typeof x === 'string' || typeof x === 'object')) {
    return row.acceptanceCriteria
      .map((x) => String(typeof x === 'string' ? x : x?.text || x?.ac || '').trim())
      .filter(Boolean);
  }
  const raw = row?.ac || row?.acceptanceCriteria || '';
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw
    .split(/\n|;|\|(?=\s)|(?<=\.)\s+(?=[A-Z0-9])/)
    .map((s) => s.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((s) => s.length >= 3);
}

function collectCriticalSkillIds(pack = {}, contextPackage = null) {
  const ids = new Set();
  const push = (raw) => {
    const id = String(raw || '')
      .trim()
      .toUpperCase();
    if (id && id !== 'SK-UNMAPPED') ids.add(id);
  };

  for (const skill of pack.skills || pack.criticalSkills || []) {
    if (typeof skill === 'string') push(skill);
    else {
      push(skill?.canonicalId || skill?.skillId || skill?.id);
      if (skill?.critical || skill?.isCritical) push(skill?.canonicalId || skill?.name);
    }
  }

  const ctxSkills =
    contextPackage?.criticalSkillIds ||
    contextPackage?.merged?.requiredSkillIds ||
    contextPackage?.filterMeta?.requiredSkillIds ||
    [];
  for (const id of ctxSkills) push(id);

  for (const fr of listFrRows(pack)) {
    for (const skill of fr.criticalSkills || fr.requiredSkills || []) {
      if (typeof skill === 'string' && /^SK-/i.test(skill)) push(skill);
      else push(skill?.canonicalId || skill?.skillId);
    }
  }

  return [...ids];
}

function collectDomainTokens(pack = {}, contextPackage = null) {
  const tokens = new Set();
  const add = (raw) => {
    const t = String(raw || '')
      .trim()
      .toLowerCase();
    if (t.length >= 2) tokens.add(t.slice(0, 48));
  };

  add(pack.overview?.domain);
  add(pack.overview?.businessDomain);
  add(pack.domain);
  for (const d of pack.businessDomains || []) add(d);
  for (const d of contextPackage?.domainTokens || []) add(d);

  for (const fr of listFrRows(pack)) {
    add(fr.module || fr.moduleLabel);
    add(fr.feature || fr.featureLabel);
    add(fr.domain);
  }
  for (const uc of listUseCases(pack)) {
    add(uc.domain);
    add(uc.module);
  }

  return [...tokens].slice(0, 40);
}

/**
 * @param {object} pack
 * @param {object} [contextPackage]
 */
function buildPlanningHints(pack = {}, contextPackage = null) {
  const frRows = listFrRows(pack);
  const ucRows = listUseCases(pack);

  const frIds = frRows.map((row, i) => frId(row, i)).filter(Boolean);
  const ucIds = ucRows.map((row, i) => ucId(row, i)).filter(Boolean);

  const acSummaries = [];
  for (let i = 0; i < frRows.length; i += 1) {
    const row = frRows[i];
    const id = frId(row, i);
    const parts = splitAcceptanceCriteria(row);
    for (let index = 0; index < parts.length; index += 1) {
      acSummaries.push({
        frId: id,
        index,
        text: parts[index].slice(0, 240),
      });
    }
  }

  return {
    frIds,
    ucIds,
    acSummaries,
    criticalSkillIds: collectCriticalSkillIds(pack, contextPackage),
    domainTokens: collectDomainTokens(pack, contextPackage),
  };
}

module.exports = {
  buildPlanningHints,
  listFrRows,
  listUseCases,
  splitAcceptanceCriteria,
};
