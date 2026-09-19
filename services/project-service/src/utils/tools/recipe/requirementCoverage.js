/**
 * A2 / T2 — requirement_coverage
 */

const {
  makeFact,
  makeWarning,
  makeToolResult,
  hashInput,
  nonEmptyString,
  normalizePriorityWeight,
} = require('../toolContract');
const { listFrLeaves } = require('../projectCanonicalBundle');

const TOOL_NAME = 'requirement_coverage';
const TOOL_VERSION = 1;

/** T2 contract weights (docs/ai-planning/01). Normal → medium. */
const DEFAULT_WEIGHTS = {
  byCriticality: { low: 1, medium: 2, normal: 2, high: 3, critical: 5 },
};

function runRequirementCoverage(input = {}, ctx = {}) {
  const fr = Array.isArray(input.fr)
    ? input.fr
    : Array.isArray(input.requirements)
      ? input.requirements
      : [];
  const graph = input.graph || null;
  const nfr = Array.isArray(input.nfr) ? input.nfr : [];
  const weights = {
    ...DEFAULT_WEIGHTS,
    ...(input.weights || {}),
    byCriticality: {
      ...DEFAULT_WEIGHTS.byCriticality,
      ...(input.weights?.byCriticality || {}),
    },
  };
  const thresholds = {
    minWeightedCoverage: 0.8,
    ...(input.thresholds || {}),
  };

  const warnings = [];
  if (!graph || !Array.isArray(graph.edges)) {
    warnings.push(
      makeWarning({
        code: 'MISSING_GRAPH',
        severity: 'error',
        message: 'coverage requires T1 graph with edges',
      })
    );
  }

  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const leaves = listFrLeaves(fr);

  const coveredByUc = new Set();
  const coveredByCap = new Set();
  const coveredByTask = new Set();
  const coveredByNfr = new Set();

  for (const e of edges) {
    const type = String(e.type || '');
    if (type === 'covers') {
      // UC/CAP → FR
      coveredByUc.add(e.to);
      coveredByCap.add(e.to);
    }
    if (type === 'implements') {
      coveredByTask.add(e.to);
    }
    if (type === 'constrains') {
      coveredByNfr.add(e.to);
    }
  }

  // Also UC nodes type covers already; distinguish CAP vs UC via node types if present
  const nodeType = new Map((graph?.nodes || []).map((n) => [n.id, n.type]));
  coveredByUc.clear();
  coveredByCap.clear();
  for (const e of edges) {
    if (e.type !== 'covers') continue;
    const fromType = nodeType.get(e.from);
    if (fromType === 'UC') coveredByUc.add(e.to);
    else if (fromType === 'CAP') coveredByCap.add(e.to);
    else {
      coveredByUc.add(e.to);
      coveredByCap.add(e.to);
    }
  }

  const uncovered = [];
  let sumAll = 0;
  let sumCovered = 0;
  let rawCovered = 0;

  let frToUcNum = 0;
  let frToCapNum = 0;
  let frToTaskNum = 0;
  let frToAcNum = 0;
  let frToNfrNum = 0;

  for (const leaf of leaves) {
    const w = normalizePriorityWeight(leaf.priority);
    // map medium→1 already in normalize; apply criticality table if present
    const critKey = String(leaf.priority || 'medium').toLowerCase();
    const wCrit = weights.byCriticality[critKey] ?? w;
    sumAll += wCrit;

    const hasAc = nonEmptyString(leaf.ac);
    const hasUc = coveredByUc.has(leaf.id);
    const hasCap = coveredByCap.has(leaf.id);
    const hasTask = coveredByTask.has(leaf.id);
    const hasNfr = coveredByNfr.has(leaf.id);

    if (hasUc) frToUcNum += 1;
    if (hasCap) frToCapNum += 1;
    if (hasTask) frToTaskNum += 1;
    if (hasAc) frToAcNum += 1;
    if (hasNfr) frToNfrNum += 1;

    // Covered ⇔ ≥1 covers/implements AND non-empty AC (per T2 spec)
    const hasRel = hasUc || hasCap || hasTask;
    const covered = hasRel && hasAc;
    if (covered) {
      sumCovered += wCrit;
      rawCovered += 1;
    } else {
      const missingDimension = [];
      if (!hasAc) missingDimension.push('ac');
      if (!hasRel) missingDimension.push('covers_or_implements');
      uncovered.push({ frId: leaf.id, weight: wCrit, missingDimension });
    }
  }

  uncovered.sort((a, b) => b.weight - a.weight || String(a.frId).localeCompare(String(b.frId)));

  const leafCount = leaves.length;
  let weightedCoverage = null;
  if (sumAll === 0) {
    warnings.push(
      makeWarning({
        code: 'EMPTY_DENOMINATOR',
        severity: 'error',
        message: 'No FR leaves to score coverage',
      })
    );
  } else {
    weightedCoverage = sumCovered / sumAll;
  }

  const rawCoverage = leafCount === 0 ? null : rawCovered / leafCount;
  const byDimension = {
    frToUc: leafCount === 0 ? null : frToUcNum / leafCount,
    frToAc: leafCount === 0 ? null : frToAcNum / leafCount,
    frToNfr: leafCount === 0 ? null : frToNfrNum / leafCount,
    frToCap: leafCount === 0 ? null : frToCapNum / leafCount,
    frToTask: leafCount === 0 ? null : frToTaskNum / leafCount,
    nfrToCap: null,
  };

  // NFR→CAP rough: nfr with any constrains edge
  if (nfr.length > 0) {
    const nfrWithEdge = new Set(edges.filter((e) => e.type === 'constrains').map((e) => e.from));
    byDimension.nfrToCap = nfrWithEdge.size / nfr.length;
  }

  const passed =
    weightedCoverage != null && weightedCoverage >= Number(thresholds.minWeightedCoverage);

  const data = {
    weightedCoverage,
    rawCoverage,
    byDimension,
    uncovered,
    passed,
    leafCount,
    weights: weights.byCriticality,
    thresholds,
  };

  const tool = ctx.tool || TOOL_NAME;
  const version = ctx.version || TOOL_VERSION;
  const inputHash = ctx.inputHash || hashInput(input);

  const facts = [
    makeFact({
      key: 'coverage.weighted',
      value: weightedCoverage,
      unit: 'ratio',
      tool,
      version,
    }),
    makeFact({
      key: 'coverage.raw',
      value: rawCoverage,
      unit: 'ratio',
      tool,
      version,
    }),
    makeFact({
      key: 'coverage.passed',
      value: passed,
      tool,
      version,
    }),
    makeFact({
      key: 'coverage.uncoveredCount',
      value: uncovered.length,
      unit: 'count',
      tool,
      version,
      evidence: uncovered.slice(0, 20).map((u) => ({ type: 'fr', ref: u.frId })),
    }),
    makeFact({
      key: 'coverage.byDimension',
      value: byDimension,
      tool,
      version,
    }),
  ];

  return makeToolResult({ data, facts, warnings, tool, version, inputHash });
}

const descriptor = {
  name: TOOL_NAME,
  version: TOOL_VERSION,
  algorithmVersion: 1,
  purpose: "Compute weighted FR leaf coverage across UC/AC/NFR/CAP/TASK dimensions",
  algorithm: ["identify_leaves","apply_weights","dimension_ratios","uncovered_list"],
  outputKeys: ["weightedCoverage","rawCoverage","byDimension","uncovered","passed"],
  contextImpact: {"objective":{"affects":"thresholds","type":"policy"}},
  deterministic: true,
  llmCalls: 0,
  invocationMode: 'recipe',
  dependsOn: ['trace.edgeCount'],
  requiredContext: [],
  requiredData: ['fr', 'graph'],
  aliases: ['requirement_coverage', 'A2'],
  run: runRequirementCoverage,
};

module.exports = { runRequirementCoverage, descriptor, TOOL_NAME };
