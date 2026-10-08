/**
 * On-demand A10 — planning_relevance
 */

const { makeFact, makeWarning, makeToolResult, hashInput } = require('../toolContract');
const { listFrLeaves } = require('../projectCanonicalBundle');

const TOOL_NAME = 'planning_relevance';
const TOOL_VERSION = 1;

function bandFromScore(score) {
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

function runPlanningRelevance(input = {}, ctx = {}) {
  const fr = Array.isArray(input.fr) ? input.fr : [];
  const leaves = listFrLeaves(fr);
  const complexityItems = ctx.factStore?.get('complexity.items')?.value || input.complexityItems || [];
  const complexityById = new Map(complexityItems.map((i) => [i.frId, i]));
  const dependencyDegree = input.dependencyDegree || {};
  const warnings = [];

  warnings.push(
    makeWarning({
      code: 'MISSING_HISTORICAL_EFFORT',
      severity: 'info',
      message: 'Historical effort not available — factor omitted',
    })
  );

  const items = [];
  for (const leaf of leaves) {
    const cx = complexityById.get(leaf.id);
    const bandScore = cx?.band === 'high' ? 40 : cx?.band === 'medium' ? 25 : cx?.band === 'low' ? 10 : 15;
    const integrations = (leaf.integrationRefs || []).length;
    const nfrCount = (leaf.nfrRefs || []).length;
    const deps = Number(dependencyDegree[leaf.id]) || (leaf.brIds || []).length + (leaf.bpmIds || []).length;
    const score = Math.min(
      100,
      bandScore + integrations * 10 + nfrCount * 8 + Math.min(deps, 5) * 6
    );
    const relevance = bandFromScore(score);
    const reasons = [];
    if (integrations) reasons.push(`${integrations} integrations`);
    if (nfrCount) reasons.push(`${nfrCount} NFR`);
    if (deps) reasons.push(`${deps} downstream dependencies`);
    if (cx?.band) reasons.push(`complexity ${cx.band}`);
    items.push({
      frId: leaf.id,
      planningRelevance: relevance,
      score,
      reasons,
    });
  }

  const data = { items };
  const tool = ctx.tool || TOOL_NAME;
  const version = ctx.version || TOOL_VERSION;
  const inputHash = ctx.inputHash || hashInput(input);

  const facts = [
    makeFact({
      key: 'planningRelevance.items',
      value: items,
      tool,
      version,
    }),
    makeFact({
      key: 'planningRelevance.highCount',
      value: items.filter((i) => i.planningRelevance === 'HIGH').length,
      unit: 'count',
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
  purpose: "Score FR planning relevance from complexity, integrations, deps",
  algorithm: ["complexity_band","integration_nfr_dep","band"],
  outputKeys: ["items"],
  contextImpact: {},
  deterministic: true,
  llmCalls: 0,
  invocationMode: 'on_demand',
  dependsOn: ['complexity.itemCount'],
  requiredContext: [],
  requiredData: ['fr'],
  aliases: ['A10'],
  run: runPlanningRelevance,
};

module.exports = { runPlanningRelevance, descriptor, TOOL_NAME, bandFromScore };
