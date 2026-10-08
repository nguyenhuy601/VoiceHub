/**
 * On-demand A7 — gap_detection (compose coverage uncovered + completeness missing)
 */

const { makeFact, makeToolResult, hashInput } = require('../toolContract');

const TOOL_NAME = 'gap_detection';
const TOOL_VERSION = 1;

function severityForMissing(missing) {
  const criticalKeys = ['Acceptance criteria', 'Actor', 'Error handling'];
  if (missing.some((m) => criticalKeys.includes(m))) return 'Critical';
  if (missing.length >= 3) return 'Planning-impacting';
  return 'Optional';
}

function runGapDetection(input = {}, ctx = {}) {
  const factStore = ctx.factStore;
  const uncovered = factStore?.get('coverage.uncoveredCount')
    ? // prefer full lists from recipe data if passed
      input.uncovered || []
    : input.uncovered || [];
  const completenessItems = input.completenessItems || factStore?.get('completeness.items')?.value || [];

  const gaps = [];

  for (const u of uncovered) {
    gaps.push({
      frId: u.frId,
      missing: u.missingDimension || [],
      severity: 'Planning-impacting',
      source: 'coverage',
    });
  }

  for (const item of completenessItems) {
    if (!item.missing || item.missing.length === 0) continue;
    gaps.push({
      frId: item.frId,
      missing: item.missing,
      severity: severityForMissing(item.missing),
      source: 'completeness',
    });
  }

  // merge by frId
  const byFr = new Map();
  for (const g of gaps) {
    if (!byFr.has(g.frId)) {
      byFr.set(g.frId, {
        frId: g.frId,
        missing: [...g.missing],
        severity: g.severity,
        sources: [g.source],
      });
    } else {
      const cur = byFr.get(g.frId);
      cur.missing = [...new Set([...cur.missing, ...g.missing])];
      cur.sources = [...new Set([...cur.sources, g.source])];
      if (g.severity === 'Critical' || cur.severity === 'Critical') cur.severity = 'Critical';
      else if (g.severity === 'Planning-impacting') cur.severity = 'Planning-impacting';
    }
  }

  const items = [...byFr.values()];
  const data = { items };

  const tool = ctx.tool || TOOL_NAME;
  const version = ctx.version || TOOL_VERSION;
  const inputHash = ctx.inputHash || hashInput(input);

  const facts = [
    makeFact({
      key: 'gap.itemCount',
      value: items.length,
      unit: 'count',
      tool,
      version,
    }),
    makeFact({
      key: 'gap.items',
      value: items,
      tool,
      version,
    }),
  ];

  return makeToolResult({ data, facts, warnings: [], tool, version, inputHash });
}

const descriptor = {
  name: TOOL_NAME,
  version: TOOL_VERSION,
  algorithmVersion: 1,
  purpose: "Compose planning gaps from coverage uncovered and completeness missing",
  algorithm: ["compose_uncovered","compose_completeness","severity"],
  outputKeys: ["items"],
  contextImpact: {},
  deterministic: true,
  llmCalls: 0,
  invocationMode: 'on_demand',
  dependsOn: ['completeness.score'],
  requiredContext: [],
  requiredData: [],
  aliases: ['A7'],
  run: runGapDetection,
};

module.exports = { runGapDetection, descriptor, TOOL_NAME };
