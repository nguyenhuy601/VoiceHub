/**
 * Enterprise Step 2 — Ingestion & Data Quality helpers (deterministic, no LLM).
 * Parse/Normalize, Map/Transform hooks, Resolve Duplicates, Validate, Versioning pins.
 */

function normalizeText(raw, { max = 2000 } = {}) {
  const s = String(raw ?? '')
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length <= max) return s;
  return s.slice(0, max);
}

function normalizeExternalId(raw) {
  return normalizeText(raw, { max: 64 }).toUpperCase();
}

/**
 * Dedupe FR / requirement skill rows by externalId (keep first).
 */
function dedupeByExternalId(rows = []) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    if (!row || typeof row !== 'object') continue;
    const id = normalizeExternalId(row.externalId);
    if (!id) {
      out.push(row);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...row, externalId: id || row.externalId });
  }
  return out;
}

/**
 * Dedupe skill name list (case-insensitive).
 */
function dedupeSkillNames(names = []) {
  const seen = new Set();
  const out = [];
  for (const n of names || []) {
    const raw = normalizeText(n, { max: 128 });
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}

/**
 * Validate cleaned projected blob — returns { ok, issues[] }.
 */
function validateProjected(projected = {}) {
  const issues = [];
  const srs = projected.srs || {};
  if (!srs.overview || (!srs.overview.name && !srs.overview.objective)) {
    issues.push({ code: 'SRS_OVERVIEW_WEAK', severity: 'warn' });
  }
  const fr = srs.functionalRequirements || [];
  if (!fr.length) {
    issues.push({ code: 'SRS_FR_EMPTY', severity: 'error' });
  }
  for (const row of fr) {
    if (!String(row.externalId || '').trim()) {
      issues.push({ code: 'FR_MISSING_ID', severity: 'error' });
      break;
    }
  }
  const employees = projected.employees || [];
  for (const emp of employees) {
    if (emp.email != null || emp.avatar != null || emp.displayName != null) {
      issues.push({ code: 'EMPLOYEE_PII_LEAK', severity: 'error' });
      break;
    }
  }
  return {
    ok: !issues.some((i) => i.severity === 'error'),
    issues,
  };
}

/**
 * Apply normalize + dedupe on projected sources (mutates copy).
 */
function applyIngestionQuality(projected = {}) {
  const srsIn = projected.srs || {};
  const fr = dedupeByExternalId(
    (srsIn.functionalRequirements || []).map((row) => ({
      ...row,
      externalId: normalizeExternalId(row.externalId) || row.externalId,
      name: normalizeText(row.name, { max: 500 }),
      description: normalizeText(row.description, { max: 4000 }),
      acceptanceCriteria: row.acceptanceCriteria
        ? normalizeText(row.acceptanceCriteria, { max: 4000 })
        : undefined,
    }))
  );
  const requirementSkills = dedupeByExternalId(
    (srsIn.requirementSkills || []).map((r) => ({
      ...r,
      externalId: normalizeExternalId(r.externalId) || r.externalId,
      skillNameSnapshot: normalizeText(r.skillNameSnapshot || r.rawInput, { max: 128 }),
    }))
  );

  const next = {
    ...projected,
    srs: {
      ...srsIn,
      overview: {
        ...(srsIn.overview || {}),
        name: normalizeText(srsIn.overview?.name, { max: 240 }),
        objective: normalizeText(srsIn.overview?.objective, { max: 500 }),
        businessScope: srsIn.overview?.businessScope
          ? normalizeText(srsIn.overview.businessScope, { max: 500 })
          : undefined,
      },
      functionalRequirements: fr,
      requirementSkills,
      nonFunctionalRequirements: dedupeByExternalId(srsIn.nonFunctionalRequirements || []),
      technology: (srsIn.technology || []).map((t) => ({
        ...t,
        name: normalizeText(t.name, { max: 128 }),
        category: normalizeText(t.category, { max: 128 }),
      })),
    },
    skillCatalog: {
      ...(projected.skillCatalog || {}),
      skills: dedupeSkillNames(projected.skillCatalog?.skills || []),
    },
    employees: (projected.employees || []).map((emp) => {
      const { email, avatar, displayName, ...rest } = emp || {};
      return rest;
    }),
  };

  const validation = validateProjected(next);
  return { projected: next, validation };
}

module.exports = {
  normalizeText,
  normalizeExternalId,
  dedupeByExternalId,
  dedupeSkillNames,
  validateProjected,
  applyIngestionQuality,
};
