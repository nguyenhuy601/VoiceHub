/**
 * Gate1 UI — Requirement Integrity Gate onto sections + rows (RULE-RIG).
 * Mirrors project-service assertGate1ConflictAmbiguityOrOverride hard-blocking.
 */

import { normalizeIntegrityBlockKind } from './integrityGateLabels.js';

const MAX_BLOCKING_UI = 40;
const HARD_REL_CODES = new Set([
  'REL_CIRCULAR',
  'REL_TARGET_MISSING',
  'REL_MISSING_ENDPOINT',
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isHardBlockingItem(item) {
  if (!item || typeof item !== 'object') return false;
  const blockKind = normalizeIntegrityBlockKind(item);
  if (blockKind === 'data_integrity') {
    const kind = String(item.kind || 'incomplete_fields');
    return kind === 'incomplete_fields' || kind === 'ambiguity' || !item.kind;
  }
  if (blockKind === 'relationship_integrity') {
    const code = String(item.code || '');
    if (code === 'REL_EVIDENCE_REQUIRED') return false;
    return true;
  }
  return false;
}

/**
 * @param {object|null|undefined} pack
 * @param {object|null|undefined} g4
 */
export function resolveConflictAmbiguityFromPack(pack, g4 = null) {
  const analyses = pack?.aiAnalysis?.analyses || pack?.analyses || {};
  const g4Understanding = g4 || analyses.g4Understanding || null;

  const fromG4 =
    g4Understanding?.requirementIntegrityGate ||
    g4Understanding?.conflictAmbiguityGate ||
    g4Understanding?.meta?.requirementIntegrityGate ||
    g4Understanding?.meta?.conflictAmbiguityGate;
  if (fromG4 && typeof fromG4 === 'object' && typeof fromG4.passed === 'boolean') {
    return normalizeGate(
      fromG4,
      g4Understanding?.requirementIntegrityGate
        ? 'analyses.g4Understanding.requirementIntegrityGate'
        : 'analyses.g4Understanding.conflictAmbiguityGate'
    );
  }

  const phaseWhat =
    pack?.aiAnalysis?.phaseRuns?.phase_what || pack?.phaseRuns?.phase_what || {};
  const fromPhase =
    phaseWhat.requirementIntegrityGate || phaseWhat.conflictAmbiguityGate;
  if (fromPhase && typeof fromPhase === 'object' && typeof fromPhase.passed === 'boolean') {
    return normalizeGate(
      fromPhase,
      phaseWhat.requirementIntegrityGate
        ? 'phaseRuns.phase_what.requirementIntegrityGate'
        : 'phaseRuns.phase_what.conflictAmbiguityGate'
    );
  }

  if (g4Understanding && typeof g4Understanding === 'object') {
    const ambiguities = asArray(g4Understanding.ambiguities).filter(
      (a) => String(a?.kind || '') === 'incomplete_fields' || !a?.kind
    );
    const rejected = asArray(g4Understanding.rejectedRelationships);
    const conflicts = rejected.filter((r) =>
      HARD_REL_CODES.has(String(r?.validationError || r?.code || ''))
    );
    if (ambiguities.length || conflicts.length) {
      const blocking = [
        ...ambiguities.map((a) => ({
          ...a,
          blockKind: 'data_integrity',
          kind: a.kind || 'incomplete_fields',
        })),
        ...conflicts.map((c) => ({
          ...c,
          blockKind: 'relationship_integrity',
          code: c.validationError || c.code,
        })),
      ];
      return normalizeGate(
        { passed: false, blocking, ambiguities, conflicts, warnings: [] },
        'derived_g4_arrays'
      );
    }
    if (asArray(g4Understanding.requirements).length || g4Understanding.meta) {
      return normalizeGate(
        { passed: true, blocking: [], ambiguities: [], conflicts: [], warnings: [] },
        'derived_g4_clean'
      );
    }
  }

  return null;
}

function normalizeGate(raw, source) {
  const warnings = asArray(raw.warnings || raw.findings);
  const blocking = asArray(raw.blocking)
    .filter(isHardBlockingItem)
    .slice(0, MAX_BLOCKING_UI)
    .map((b, i) => normalizeBlockingItem(b, i));

  const ambiguities = asArray(raw.ambiguities).map((a, i) =>
    normalizeBlockingItem(
      { ...a, blockKind: a.blockKind || 'data_integrity' },
      i
    )
  );
  const conflicts = asArray(raw.conflicts).map((c, i) =>
    normalizeBlockingItem(
      { ...c, blockKind: c.blockKind || 'relationship_integrity' },
      i
    )
  );

  const list = blocking.length
    ? blocking
    : [...ambiguities, ...conflicts]
        .filter(isHardBlockingItem)
        .slice(0, MAX_BLOCKING_UI);

  return {
    passed: list.length === 0,
    blocking: list,
    warnings,
    ambiguities,
    conflicts,
    source,
    gateKind: raw.gateKind || 'requirement_integrity',
  };
}

function normalizeBlockingItem(raw, index) {
  const item = raw && typeof raw === 'object' ? raw : {};
  const requirementId = item.requirementId
    ? String(item.requirementId)
    : item.frId
      ? String(item.frId)
      : null;
  const from = item.from != null ? String(item.from) : null;
  const to = item.to != null ? String(item.to) : null;
  const blockKind = normalizeIntegrityBlockKind(item);
  const missing = Array.isArray(item.missing) ? item.missing.map(String) : [];
  const defaultMsg =
    blockKind === 'data_integrity'
      ? missing.length
        ? `Missing required fields: ${missing.join(', ')}`
        : 'Missing required fields'
      : item.message || item.code || 'Relationship integrity issue';

  return {
    id: String(item.id || requirementId || from || `block-${index + 1}`),
    blockKind,
    kind: String(
      item.kind ||
        (blockKind === 'data_integrity' ? 'incomplete_fields' : 'invalid_relationship')
    ),
    message: String(item.message || item.reason || defaultMsg),
    requirementId,
    from,
    to,
    code: item.code || null,
    cycle: item.cycle || null,
    missing,
    section: guessSectionForBlocking(item, requirementId, from, to),
  };
}

function guessSectionForBlocking(item, requirementId, from, to) {
  if (item.section) return String(item.section);
  if (requirementId || from || to) return 'functionalRequirements';
  return 'functionalRequirements';
}

function rowIdSet(row) {
  return new Set(
    [row?.logicalId, row?.id, row?.frId, row?.externalId, row?.upstreamId]
      .filter(Boolean)
      .map((v) => String(v))
  );
}

function blockingMatchesRow(block, row) {
  const ids = rowIdSet(row);
  if (!ids.size) return false;
  if (block.requirementId && ids.has(String(block.requirementId))) return true;
  if (block.from && ids.has(String(block.from))) return true;
  if (block.to && ids.has(String(block.to))) return true;
  if (block.id && ids.has(String(block.id))) return true;
  return false;
}

/**
 * Annotate Gate1 bundle rows/sections with integrity UI metadata.
 */
export function attachConflictAmbiguityToGate1Bundle(bundle, pack, g4 = null) {
  const base = bundle && typeof bundle === 'object' ? bundle : {};
  const gate = resolveConflictAmbiguityFromPack(pack, g4);
  if (!gate || gate.passed || !gate.blocking.length) {
    return {
      ...base,
      conflictAmbiguity: gate,
      requirementIntegrity: gate,
    };
  }

  const bySection = { ...(base.bySection || {}) };
  const conflictCountBySection = {};

  for (const key of Object.keys(bySection)) {
    const rows = asArray(bySection[key]).map((row) => {
      const issues = gate.blocking.filter((b) => blockingMatchesRow(b, row));
      if (!issues.length) return row;
      conflictCountBySection[key] = (conflictCountBySection[key] || 0) + 1;
      const primaryKind = normalizeIntegrityBlockKind(issues[0]);
      return {
        ...row,
        hasConflict: true,
        blockingIssues: issues,
        conflictKind: primaryKind,
        integrityKind: primaryKind,
      };
    });
    rows.sort((a, b) => Number(Boolean(b.hasConflict)) - Number(Boolean(a.hasConflict)));
    bySection[key] = rows;
  }

  for (const block of gate.blocking) {
    const section = block.section || 'functionalRequirements';
    const matchedSomewhere = Object.values(bySection).some((rows) =>
      asArray(rows).some((row) => blockingMatchesRow(block, row))
    );
    if (!matchedSomewhere) {
      conflictCountBySection[section] = (conflictCountBySection[section] || 0) + 1;
    }
  }

  const sections = asArray(base.sections).map((tab) => {
    const count = conflictCountBySection[tab.key] || 0;
    return count
      ? { ...tab, conflictCount: count, hasConflict: true }
      : { ...tab, conflictCount: 0, hasConflict: false };
  });

  const items = [];
  for (const key of Object.keys(bySection)) {
    items.push(...bySection[key]);
  }
  const orderedItems = asArray(base.items).length
    ? asArray(base.items).map((row) => {
        const sectionRows = bySection[row.section] || [];
        const hit = sectionRows.find(
          (r) => String(r.logicalId || r.id) === String(row.logicalId || row.id)
        );
        return hit || row;
      })
    : items;

  const annotatedGate = {
    ...gate,
    conflictRowCount: Object.values(conflictCountBySection).reduce((a, b) => a + b, 0),
    conflictCountBySection,
  };

  return {
    ...base,
    bySection,
    sections,
    items: orderedItems,
    conflictAmbiguity: annotatedGate,
    requirementIntegrity: annotatedGate,
  };
}

export default attachConflictAmbiguityToGate1Bundle;
