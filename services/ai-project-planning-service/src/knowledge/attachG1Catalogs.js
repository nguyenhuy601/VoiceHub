/**
 * Attach G1 catalogs onto a run-scoped snapshot payload (RULE-11).
 * - Skill catalog: run-scoped from this payload only (no cross-project merge)
 * - Metric / dimension: platform seed pin only
 * Idempotent when g1Catalogs.contractVersion already matches.
 */

const {
  G1_CONTRACT_VERSION,
  METRIC_CATALOG_SEED,
  DIMENSION_CATALOG_SEED,
  validateSkillCatalog,
  buildSkillCatalogFromNames,
  catalogMiss,
} = require('./g1CatalogSchemas');

function skillNameOf(entry) {
  if (typeof entry === 'string') return entry.trim();
  if (entry && typeof entry === 'object') {
    return String(entry.name || entry.skillName || '').trim();
  }
  return '';
}

/**
 * Collect skill names from this snapshot/pack only (RULE: no other runs).
 * Sources for the run skill catalog: skillCatalog + staffing + requirementSkills.
 * Employee skills are NOT merged into the catalog (used only for miss warnings).
 * @param {object} snapshot
 * @returns {string[]}
 */
function collectRunScopedSkillNames(snapshot = {}) {
  const names = [];
  const push = (n) => {
    const s = skillNameOf(n);
    if (s) names.push(s);
  };

  const projected = snapshot.projected || {};
  const skillCat = projected.skillCatalog || snapshot.skillCatalog || {};
  for (const s of skillCat.skills || []) push(s);

  const pack = snapshot.pack || snapshot;
  const staffing = pack.staffingPlan || projected.srs?.staffingPlan || {};
  for (const s of staffing.requiredSkills || []) push(s?.name || s);
  for (const s of pack.requirementSkills || projected.srs?.requirementSkills || []) {
    push(s?.skillNameSnapshot || s?.rawInput || s);
  }

  return names;
}

/**
 * Employee skill names not present in catalog → warn (do not fail run).
 * @param {object} snapshot
 * @param {{ skills?: object[] }} skillCatalog
 */
function collectSkillMissWarnings(snapshot, skillCatalog) {
  const warnings = [];
  const catalogNames = new Set(
    (skillCatalog?.skills || []).map((s) => skillNameOf(s).toLowerCase()).filter(Boolean)
  );
  if (!catalogNames.size) return warnings;

  const employees =
    snapshot.projected?.employees || snapshot.employees || [];
  const seen = new Set();
  for (const emp of employees) {
    const list = [
      ...(emp.skills || []),
      ...(emp.capability?.skills || []),
    ];
    for (const s of list) {
      const name = skillNameOf(s);
      if (!name) continue;
      const key = name.toLowerCase();
      if (catalogNames.has(key) || seen.has(key)) continue;
      seen.add(key);
      warnings.push(catalogMiss('skill', name, 'warn'));
    }
  }
  return warnings;
}

/**
 * @param {object|null} snapshotPayload — domain snapshot from project (may be null)
 * @returns {{
 *   snapshot: object,
 *   g1Catalogs: object,
 *   g1Warnings: object[],
 *   attached: boolean,
 *   skipped: boolean
 * }}
 */
function attachG1Catalogs(snapshotPayload = null) {
  const base =
    snapshotPayload && typeof snapshotPayload === 'object' && !Array.isArray(snapshotPayload)
      ? { ...snapshotPayload }
      : {};

  // Idempotent: already pinned with current contract — re-validate only, keep pin
  if (
    base.g1Catalogs &&
    String(base.g1Catalogs.contractVersion || '') === G1_CONTRACT_VERSION
  ) {
    const existingSkills =
      base.projected?.skillCatalog || base.skillCatalog || { version: 'cap-whitelist-v2', skills: [] };
    const validated = validateSkillCatalog(existingSkills);
    const skillCatalog = validated.ok
      ? validated.catalog
      : buildSkillCatalogFromNames(collectRunScopedSkillNames(base), existingSkills.version);
    const projected = {
      ...(base.projected || {}),
      skillCatalog,
    };
    const warnings = [
      ...(Array.isArray(base.g1Warnings) ? base.g1Warnings : []),
      ...collectSkillMissWarnings({ ...base, projected }, skillCatalog),
    ];
    // Dedupe warnings by kind+id
    const seenW = new Set();
    const g1Warnings = [];
    for (const w of warnings) {
      const k = `${w.kind}:${w.id}`;
      if (seenW.has(k)) continue;
      seenW.add(k);
      g1Warnings.push(w);
    }
    return {
      snapshot: {
        ...base,
        projected,
        skillCatalog,
        g1Catalogs: base.g1Catalogs,
        g1Warnings,
      },
      g1Catalogs: base.g1Catalogs,
      g1Warnings,
      attached: true,
      skipped: true,
    };
  }

  const priorCat = base.projected?.skillCatalog || base.skillCatalog || {};
  const names = collectRunScopedSkillNames(base);
  // Prefer validating existing envelope; else build from collected names
  let skillCatalog;
  const validated = validateSkillCatalog({
    version: priorCat.version || 'cap-whitelist-v2',
    skills: Array.isArray(priorCat.skills) && priorCat.skills.length
      ? priorCat.skills
      : names,
  });
  if (validated.ok) {
    skillCatalog = validated.catalog;
  } else {
    skillCatalog = buildSkillCatalogFromNames(names, priorCat.version || 'cap-whitelist-v2');
  }

  const g1Catalogs = {
    contractVersion: G1_CONTRACT_VERSION,
    metricCatalog: METRIC_CATALOG_SEED.map((m) => ({ ...m, owners: [...m.owners] })),
    dimensionCatalog: DIMENSION_CATALOG_SEED.map((d) => ({
      dimensionId: d.dimensionId,
      values: [...d.values],
      aliases: d.aliases ? { ...d.aliases } : undefined,
    })),
  };

  const projected = {
    ...(base.projected || {}),
    skillCatalog,
  };

  const g1Warnings = collectSkillMissWarnings({ ...base, projected }, skillCatalog);

  const snapshot = {
    ...base,
    projected,
    skillCatalog,
    g1Catalogs,
    g1Warnings,
  };

  return {
    snapshot,
    g1Catalogs,
    g1Warnings,
    attached: true,
    skipped: false,
  };
}

module.exports = {
  attachG1Catalogs,
  collectRunScopedSkillNames,
  skillNameOf,
};
