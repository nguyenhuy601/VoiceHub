/**
 * T3 — requirement_complexity (rubric; not length-only heuristic)
 */

const { makeFact, makeWarning, makeToolResult, hashInput } = require('../toolContract');
const { listFrLeaves } = require('../projectCanonicalBundle');

const TOOL_NAME = 'requirement_complexity';
const TOOL_VERSION = 1;

function lerpNorm(value, p0, p50, p100) {
  const v = Number(value) || 0;
  if (v <= p0) return 0;
  if (v >= p100) return 1;
  if (v <= p50) return 0.5 * ((v - p0) / Math.max(1e-9, p50 - p0));
  return 0.5 + 0.5 * ((v - p50) / Math.max(1e-9, p100 - p50));
}

function countAcBullets(ac) {
  const text = String(ac || '').trim();
  if (!text) return 0;
  const given = (text.match(/\bgiven\b/gi) || []).length;
  const bullets = text.split(/\n|;|\u2022|\*/).map((s) => s.trim()).filter(Boolean);
  return Math.max(given, bullets.length > 1 ? bullets.length : text.length > 40 ? 1 : 0);
}

function runRequirementComplexity(input = {}, ctx = {}) {
  const fr = Array.isArray(input.fr)
    ? input.fr
    : Array.isArray(input.requirements)
      ? input.requirements
      : [];
  const dependencyDegree =
    input.dependencyDegree && typeof input.dependencyDegree === 'object'
      ? input.dependencyDegree
      : {};
  const leaves = listFrLeaves(fr);
  const warnings = [];

  if (leaves.length === 0) {
    warnings.push(
      makeWarning({
        code: 'EMPTY_REQUIREMENTS',
        severity: 'warn',
        message: 'No FR leaves for complexity',
      })
    );
  }

  const items = [];
  const distribution = { low: 0, medium: 0, high: 0 };

  const weights = {
    textSize: 0.15,
    acCount: 0.2,
    integrationCount: 0.2,
    dataEntityCount: 0.15,
    nfrCount: 0.15,
    dependencyDegree: 0.15,
  };

  for (const leaf of leaves) {
    const textSize = String(leaf.description || '').length + String(leaf.ac || '').length;
    const acCount = countAcBullets(leaf.ac);
    const integrationCount = (leaf.integrationRefs || []).length;
    const dataEntityCount = (leaf.dataEntityIds || []).length;
    const nfrCount = (leaf.nfrRefs || []).length;
    const depDeg = Number(dependencyDegree[leaf.id]) || 0;

    const factors = {
      textSize: lerpNorm(textSize, 0, 200, 400),
      acCount: lerpNorm(acCount, 0, 2, 5),
      integrationCount: lerpNorm(integrationCount, 0, 1, 3),
      dataEntityCount: lerpNorm(dataEntityCount, 0, 2, 5),
      nfrCount: lerpNorm(nfrCount, 0, 1, 3),
      dependencyDegree: lerpNorm(depDeg, 0, 2, 5),
    };

    // confidence: present keys (arrays always present on projection)
    let present = 0;
    const factorKeys = Object.keys(factors);
    for (const k of factorKeys) present += 1;
    const confidence = present / 6;

    let score = 0;
    for (const k of factorKeys) {
      score += weights[k] * factors[k];
    }
    score = Math.round(100 * score);

    let band = 'high';
    if (score <= 33) band = 'low';
    else if (score <= 66) band = 'medium';

    distribution[band] += 1;
    items.push({
      frId: leaf.id,
      score,
      band,
      factors,
      confidence,
    });
  }

  const data = { items, distribution };
  const tool = ctx.tool || TOOL_NAME;
  const version = ctx.version || TOOL_VERSION;
  const inputHash = ctx.inputHash || hashInput(input);

  const facts = [
    makeFact({
      key: 'complexity.distribution',
      value: distribution,
      tool,
      version,
    }),
    makeFact({
      key: 'complexity.items',
      value: items,
      tool,
      version,
      evidence: items.slice(0, 20).map((i) => ({ type: 'fr', ref: i.frId })),
    }),
    makeFact({
      key: 'complexity.itemCount',
      value: items.length,
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
  purpose: "Score FR complexity band from fixed rubric factors (not length-only)",
  algorithm: ["factor_norms","weighted_score","band_map"],
  outputKeys: ["items","distribution"],
  contextImpact: {"deadline":{"affects":"none","type":"constraint"}},
  deterministic: true,
  llmCalls: 0,
  invocationMode: 'recipe',
  dependsOn: [],
  requiredContext: [],
  requiredData: ['fr'],
  aliases: ['T3'],
  run: runRequirementComplexity,
};

module.exports = { runRequirementComplexity, descriptor, TOOL_NAME, countAcBullets, lerpNorm };
