/**
 * On-demand A6 — ambiguity_detection (rule / lexicon)
 */

const { makeFact, makeToolResult, hashInput, nonEmptyString } = require('../toolContract');
const { listFrLeaves } = require('../projectCanonicalBundle');

const TOOL_NAME = 'ambiguity_detection';
const TOOL_VERSION = 1;

const VAGUE = Object.freeze([
  'quickly',
  'fast',
  'easily',
  'manage',
  'handle',
  'appropriate',
  'etc',
  'as needed',
  'flexible',
  'user-friendly',
  'nhanh',
  'dễ dàng',
  'phù hợp',
  'có thể',
  'nếu cần',
  'tùy chọn',
]);

function runAmbiguityDetection(input = {}, ctx = {}) {
  const fr = Array.isArray(input.fr) ? input.fr : [];
  const leaves = input.frId
    ? listFrLeaves(fr).filter((x) => x.id === input.frId)
    : listFrLeaves(fr);

  const items = [];
  for (const leaf of leaves) {
    const text = `${leaf.name} ${leaf.description} ${leaf.ac}`.toLowerCase();
    const signals = [];
    for (const word of VAGUE) {
      if (text.includes(word)) signals.push(word);
    }
    if (!nonEmptyString(leaf.actor)) signals.push('undefined actor');
    if (!nonEmptyString(leaf.ac)) signals.push('missing quantitative/AC target');
    if (!nonEmptyString(leaf.description) && !nonEmptyString(leaf.mainFlow)) {
      signals.push('undefined scope');
    }
    const ambiguity = Math.min(1, signals.length / 5);
    items.push({
      frId: leaf.id,
      ambiguity: Math.round(ambiguity * 100) / 100,
      signals: [...new Set(signals)],
    });
  }

  const data = { items };
  const tool = ctx.tool || TOOL_NAME;
  const version = ctx.version || TOOL_VERSION;
  const inputHash = ctx.inputHash || hashInput(input);

  const facts = [
    makeFact({
      key: 'ambiguity.items',
      value: items,
      tool,
      version,
    }),
    makeFact({
      key: 'ambiguity.highCount',
      value: items.filter((i) => i.ambiguity >= 0.6).length,
      unit: 'count',
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
  purpose: "Detect vague language and undefined actor/scope/AC signals",
  algorithm: ["lexicon_scan","missing_fields","score"],
  outputKeys: ["items"],
  contextImpact: {},
  deterministic: true,
  llmCalls: 0,
  invocationMode: 'on_demand',
  dependsOn: [],
  requiredContext: [],
  requiredData: ['fr'],
  aliases: ['A6'],
  run: runAmbiguityDetection,
};

module.exports = { runAmbiguityDetection, descriptor, TOOL_NAME, VAGUE };
