const { createEvidence } = require('../evidence/evidence');
const { computeCoverage, buildGaps } = require('../engines/requirementGaps');

function listFrs(snapshot = {}) {
  if (Array.isArray(snapshot.functionalRequirements)) return snapshot.functionalRequirements;
  if (Array.isArray(snapshot.frList)) return snapshot.frList;
  if (Array.isArray(snapshot.requirements)) return snapshot.requirements;
  return [];
}

function frId(fr, index) {
  return String(fr?.id || fr?._id || fr?.externalId || `FR-${index + 1}`).trim();
}

function nonEmpty(v) {
  return String(v || '').trim().length > 0;
}

const CHECKLIST = Object.freeze([
  { key: 'description', label: 'Description' },
  { key: 'ac', label: 'Acceptance criteria', alt: ['acceptanceCriteria'] },
  { key: 'priority', label: 'Priority' },
]);

function fieldPresent(fr, item) {
  if (nonEmpty(fr[item.key])) return true;
  if (Array.isArray(item.alt)) {
    return item.alt.some((k) => nonEmpty(fr[k]));
  }
  return false;
}

/**
 * Heuristic parent/module edges from FR list (deterministic).
 */
function buildHierarchyRelationships(frs, snapshotId) {
  const relationships = [];
  const evidence = [];
  for (let i = 0; i < frs.length; i += 1) {
    const fr = frs[i];
    const id = frId(fr, i);
    const parent = String(fr.parentId || fr.parentExternalId || fr.moduleId || '').trim();
    if (!parent || parent === id) continue;
    const ev = createEvidence({
      sourceType: 'srs_pack',
      sourceId: id,
      snapshotId,
      metric: 'hierarchy_parent',
      value: parent,
      unit: null,
      calculatedBy: 'RequirementAnalysisTool',
      ruleId: 'REQ-HIER-001',
    });
    evidence.push(ev);
    relationships.push({
      from: id,
      to: parent,
      type: 'child_of',
      evidence: [ev],
      confidence: 1,
      note: 'derived_from_parentId',
    });
  }
  return { relationships, evidence };
}

/**
 * Dependency edges from FR.dependency / dependsOn fields.
 */
function buildDependencyRelationships(frs, snapshotId) {
  const relationships = [];
  const evidence = [];
  const idSet = new Set(frs.map((fr, i) => frId(fr, i)));

  for (let i = 0; i < frs.length; i += 1) {
    const fr = frs[i];
    const id = frId(fr, i);
    const raw =
      fr.dependsOn ||
      fr.dependency ||
      fr.dependencies ||
      (Array.isArray(fr.brIds) ? null : null);
    let targets = [];
    if (Array.isArray(raw)) {
      targets = raw.map((t) => String(t?.id || t || '').trim()).filter(Boolean);
    } else if (typeof raw === 'string' && raw.trim()) {
      targets = raw
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    for (const to of targets) {
      if (!idSet.has(to) || to === id) continue;
      const ev = createEvidence({
        sourceType: 'srs_pack',
        sourceId: id,
        snapshotId,
        metric: 'dependency',
        value: to,
        calculatedBy: 'RequirementAnalysisTool',
        ruleId: 'REQ-DEP-001',
      });
      evidence.push(ev);
      relationships.push({
        from: id,
        to,
        type: 'depends_on',
        evidence: [ev],
        confidence: 0.9,
        note: 'derived_from_dependency_field',
      });
    }
  }
  return { relationships, evidence };
}

function scoreCompleteness(frs) {
  const items = [];
  let sum = 0;
  for (let i = 0; i < frs.length; i += 1) {
    const fr = frs[i];
    const missing = [];
    let present = 0;
    for (const check of CHECKLIST) {
      if (fieldPresent(fr, check)) present += 1;
      else missing.push(check.label);
    }
    const score = present / CHECKLIST.length;
    sum += score;
    items.push({
      frId: frId(fr, i),
      completeness: Math.round(score * 1000) / 1000,
      missing,
    });
  }
  const overall = frs.length ? sum / frs.length : null;
  return { overall, items };
}

/**
 * Requirement analysis — deterministic extract + hierarchy/dependency candidates.
 * @param {object} snapshot
 * @param {object} [context]
 */
async function requirementAnalysis(snapshot = {}, context = {}) {
  const pack = context.pack || snapshot.pack || snapshot;
  const container = context.container || snapshot.container || {};
  const snapshotId = snapshot.snapshotId || pack.snapshotId || snapshot.id || null;
  const frSource =
    Array.isArray(pack.functionalRequirements) || Array.isArray(pack.frList)
      ? pack
      : snapshot;
  const frs = listFrs(frSource);

  const requirements = frs.map((fr, i) => ({
    id: frId(fr, i),
    title: fr.title || fr.name || null,
    description: fr.description || fr.desc || null,
    ac: fr.ac || fr.acceptanceCriteria || null,
    priority: fr.priority || null,
    module: fr.module || fr.moduleName || null,
    feature: fr.feature || fr.featureName || null,
    level: fr.level || 'Requirement',
    parentId: fr.parentId || fr.parentExternalId || null,
  }));

  const completeness = scoreCompleteness(frs);
  const coverage = computeCoverage(frs);
  const gaps = buildGaps(frs);
  const hier = buildHierarchyRelationships(frs, snapshotId);
  const deps = buildDependencyRelationships(frs, snapshotId);

  const ambiguities = [];
  for (const item of completeness.items) {
    if (item.missing.length) {
      ambiguities.push({
        requirementId: item.frId,
        kind: 'incomplete_fields',
        missing: item.missing,
      });
    }
  }

  const assumptions = [];
  if (!frs.length) {
    assumptions.push({
      kind: 'empty_pack',
      message: 'No functional requirements in snapshot',
    });
  }

  const frCountEv = createEvidence({
    sourceType: 'srs_pack',
    sourceId: snapshot.packId || 'pack',
    snapshotId,
    metric: 'fr_count',
    value: frs.length,
    unit: 'count',
    calculatedBy: 'RequirementAnalysisTool',
    ruleId: 'REQ-COUNT-001',
  });
  const completenessEv = createEvidence({
    sourceType: 'tool',
    sourceId: 'RequirementAnalysisTool',
    snapshotId,
    metric: 'completeness.score',
    value: completeness.overall,
    unit: 'ratio',
    calculatedBy: 'RequirementAnalysisTool',
    ruleId: 'REQ-COMP-001',
  });
  const coverageEv = createEvidence({
    sourceType: 'tool',
    sourceId: 'RequirementAnalysisTool',
    snapshotId,
    metric: 'coverage.score',
    value: coverage.score,
    unit: 'ratio',
    calculatedBy: 'RequirementAnalysisTool',
    ruleId: 'REQ-COV-001',
  });

  const evidence = [
    frCountEv,
    completenessEv,
    coverageEv,
    ...hier.evidence,
    ...deps.evidence,
  ];
  const relationships = [...hier.relationships, ...deps.relationships];

  let updated = container;
  try {
    const {
      runRequirementGapsEngine,
      applyGapToContainer,
      applyDataSectionToContainer,
    } = require('../engines/requirementGaps');
    const gapEngine = runRequirementGapsEngine(pack);
    updated = applyDataSectionToContainer(container, {
      requirements,
      relationships,
      coverage: coverage || gapEngine.coverage,
    });
    updated = applyGapToContainer(updated, gapEngine);
  } catch {
    updated = {
      ...container,
      analyses: {
        ...(container.analyses || {}),
        requirementAnalysis: { requirements, relationships, coverage, gaps },
      },
    };
  }

  return {
    result: {
      requirements,
      relationships,
      ambiguities,
      assumptions,
      gaps,
      coverage,
      facts: {
        'completeness.score': completeness.overall,
        'completeness.items': completeness.items,
        coverage,
        'coverage.score': coverage.score,
        fr_count: frs.length,
        gap_count: gaps.length,
      },
      stub: false,
      container: updated,
    },
    evidence,
  };
}

module.exports = {
  requirementAnalysis,
  listFrs,
  buildHierarchyRelationships,
  buildDependencyRelationships,
  scoreCompleteness,
};
