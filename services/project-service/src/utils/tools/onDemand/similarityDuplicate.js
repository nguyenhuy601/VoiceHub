/**
 * On-demand A5 — similarity / possible duplicate (no auto-merge)
 */

const { makeFact, makeWarning, makeToolResult, hashInput } = require('../toolContract');
const { listFrLeaves } = require('../projectCanonicalBundle');

const TOOL_NAME = 'requirement_similarity_duplicate';
const TOOL_VERSION = 1;

function tokenize(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9à-ỹ_+-]+/i)
      .map((t) => t.trim())
      .filter((t) => t.length > 1)
  );
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function structuredOverlap(a, b) {
  let score = 0;
  let parts = 0;
  const pairs = [
    [a.actor, b.actor],
    [a.input, b.input],
    [a.output, b.output],
  ];
  for (const [x, y] of pairs) {
    parts += 1;
    if (x && y && String(x).trim().toLowerCase() === String(y).trim().toLowerCase()) score += 1;
  }
  return parts ? score / parts : 0;
}

function runSimilarityDuplicate(input = {}, ctx = {}) {
  const fr = Array.isArray(input.fr) ? input.fr : [];
  const leaves = listFrLeaves(fr);
  const threshold = Number(input.threshold) >= 0 ? Number(input.threshold) : 0.85;
  const pairs = [];
  const warnings = [];

  for (let i = 0; i < leaves.length; i += 1) {
    for (let j = i + 1; j < leaves.length; j += 1) {
      const a = leaves[i];
      const b = leaves[j];
      const tokA = tokenize(`${a.name} ${a.description} ${a.ac}`);
      const tokB = tokenize(`${b.name} ${b.description} ${b.ac}`);
      const kw = jaccard(tokA, tokB);
      const st = structuredOverlap(a, b);
      const similarity = Math.round((0.75 * kw + 0.25 * st) * 1000) / 1000;
      if (similarity >= threshold) {
        pairs.push({
          left: a.id,
          right: b.id,
          similarity,
          possibleDuplicate: true,
          merge: false,
        });
      }
    }
  }

  warnings.push(
    makeWarning({
      code: 'NO_AUTO_MERGE',
      severity: 'info',
      message: 'Similarity tool never auto-merges duplicates',
    })
  );

  const data = { pairs, threshold, mergePerformed: false };
  const tool = ctx.tool || TOOL_NAME;
  const version = ctx.version || TOOL_VERSION;
  const inputHash = ctx.inputHash || hashInput(input);

  const facts = [
    makeFact({
      key: 'similarity.pairCount',
      value: pairs.length,
      unit: 'count',
      tool,
      version,
    }),
    makeFact({
      key: 'similarity.pairs',
      value: pairs,
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
  purpose: "Find possible duplicate FRs via token/structured similarity (no merge)",
  algorithm: ["tokenize","jaccard","structured_overlap","threshold"],
  outputKeys: ["pairs","threshold","mergePerformed"],
  contextImpact: {},
  deterministic: true,
  llmCalls: 0,
  invocationMode: 'on_demand',
  dependsOn: [],
  requiredContext: [],
  requiredData: ['fr'],
  aliases: ['A5'],
  run: runSimilarityDuplicate,
};

module.exports = { runSimilarityDuplicate, descriptor, TOOL_NAME, jaccard, tokenize };
