/**
 * Requirement gaps — incomplete FR fields + missing dependency targets.
 */

function normProse(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugPart(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function listFrRows(packOrSnapshot = {}) {
  if (Array.isArray(packOrSnapshot.functionalRequirements)) {
    return packOrSnapshot.functionalRequirements;
  }
  if (Array.isArray(packOrSnapshot.frList)) return packOrSnapshot.frList;
  if (Array.isArray(packOrSnapshot.requirements)) return packOrSnapshot.requirements;
  return [];
}

function frId(row, index) {
  return String(row?.externalId || row?.id || row?._id || `FR-${index + 1}`).trim();
}

function nonEmpty(v) {
  return String(v || '').trim().length > 0;
}

function fieldPresent(fr, key, alt = []) {
  if (nonEmpty(fr[key])) return true;
  return alt.some((k) => nonEmpty(fr[k]));
}

function parseDependsTargets(fr) {
  const raw = fr.dependsOn || fr.dependency || fr.dependencies;
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t?.id || t || '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/** Weighted fraction of FRs that have description + ac + priority. */
function computeCoverage(frs = []) {
  if (!frs.length) {
    return { score: null, completeCount: 0, total: 0, items: [] };
  }
  let completeCount = 0;
  const items = [];
  for (let i = 0; i < frs.length; i += 1) {
    const fr = frs[i];
    const id = frId(fr, i);
    const hasDesc = fieldPresent(fr, 'description', ['desc']);
    const hasAc = fieldPresent(fr, 'ac', ['acceptanceCriteria']);
    const hasPriority = fieldPresent(fr, 'priority', []);
    const present = [hasDesc, hasAc, hasPriority].filter(Boolean).length;
    const score = present / 3;
    if (present === 3) completeCount += 1;
    items.push({
      frId: id,
      coverage: Math.round(score * 1000) / 1000,
      hasDescription: hasDesc,
      hasAc,
      hasPriority,
    });
  }
  const score = items.reduce((s, it) => s + it.coverage, 0) / items.length;
  return {
    score: Math.round(score * 1000) / 1000,
    completeCount,
    total: frs.length,
    items,
  };
}

function buildGaps(frs = []) {
  const gaps = [];
  const idSet = new Set(frs.map((fr, i) => frId(fr, i)));
  let idx = 0;
  const push = (partial) => {
    idx += 1;
    gaps.push({
      gapId: `GAP-${String(idx).padStart(3, '0')}-${slugPart(partial.type)}`,
      relatedCapabilityIds: [],
      ...partial,
    });
  };

  for (let i = 0; i < frs.length; i += 1) {
    const fr = frs[i];
    const id = frId(fr, i);
    const title = normProse(fr.name || fr.title || id);
    const missing = [];
    if (!fieldPresent(fr, 'description', ['desc'])) missing.push('Description');
    if (!fieldPresent(fr, 'ac', ['acceptanceCriteria'])) missing.push('Acceptance criteria');
    if (!fieldPresent(fr, 'priority', [])) missing.push('Priority');
    if (missing.length) {
      push({
        type: 'incomplete',
        relatedFrIds: [id],
        issue: `Requirement ${id} (${title}) missing: ${missing.join(', ')}`,
        severity: missing.length >= 2 ? 'high' : 'medium',
        recommendation: 'Complete Description, Acceptance Criteria, and Priority',
      });
    }
    for (const target of parseDependsTargets(fr)) {
      if (!idSet.has(target)) {
        push({
          type: 'missing_dependency_target',
          relatedFrIds: [id],
          issue: `Requirement ${id} depends on unknown target "${target}"`,
          severity: 'high',
          recommendation: 'Add the missing FR or fix the dependency reference',
          missingTarget: target,
        });
      }
    }
  }

  if (!frs.length) {
    push({
      type: 'missing_requirement',
      relatedFrIds: [],
      issue: 'No functional requirements found in pack/snapshot',
      severity: 'critical',
      recommendation: 'Add Requirement-level FR rows before continuing',
    });
  }

  return gaps;
}

function runRequirementGapsEngine(packOrSnapshot = {}) {
  const frs = listFrRows(packOrSnapshot);
  const coverage = computeCoverage(frs);
  const gaps = buildGaps(frs);
  return {
    status: 'ready',
    model: null,
    generatedAt: new Date().toISOString(),
    items: gaps,
    coverage,
    meta: {
      source: 'heuristic',
      llmCalls: 0,
      gapCount: gaps.length,
      coverageScore: coverage.score,
    },
  };
}

function applyGapToContainer(container, gapResult) {
  const next = {
    ...container,
    analyses: { ...(container?.analyses || {}) },
  };
  next.analyses.gap = {
    status: gapResult.status || 'ready',
    model: gapResult.model || null,
    generatedAt: gapResult.generatedAt || new Date().toISOString(),
    items: gapResult.items || [],
    entities: [],
    edges: [],
    dataFlows: [],
    orderHint: [],
    meta: {
      ...(gapResult.meta || {}),
      coverage: gapResult.coverage || null,
    },
  };
  return next;
}

function applyDataSectionToContainer(
  container,
  { requirements = [], relationships = [], coverage = null } = {}
) {
  const next = {
    ...container,
    analyses: { ...(container?.analyses || {}) },
  };
  next.analyses.data = {
    status: 'ready',
    model: null,
    generatedAt: new Date().toISOString(),
    items: requirements,
    entities: requirements.map((r) => ({
      id: r.id,
      name: r.title || r.id,
      module: r.module || null,
    })),
    edges: (relationships || []).map((rel) => ({
      from: rel.from,
      to: rel.to,
      type: rel.type,
    })),
    dataFlows: [],
    orderHint: [],
    meta: {
      source: 'requirementAnalysis',
      coverage,
      relationshipCount: (relationships || []).length,
    },
  };
  return next;
}

module.exports = {
  computeCoverage,
  buildGaps,
  runRequirementGapsEngine,
  applyGapToContainer,
  applyDataSectionToContainer,
  listFrRows,
};
