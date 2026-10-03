/**
 * A4 — requirement_consistency (cross-artifact conflict rules)
 */

const { makeFact, makeWarning, makeToolResult, hashInput } = require('../toolContract');

const TOOL_NAME = 'requirement_consistency';
const TOOL_VERSION = 1;

function parseLatencySeconds(text) {
  const s = String(text || '');
  const m = s.match(/(?:response|latency|thời gian phản hồi)?[^\d]{0,20}(?:<|>|<=|>=|under|dưới|less than)?\s*(\d+(?:\.\d+)?)\s*(ms|s|sec|seconds|giây)?/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = String(m[2] || 's').toLowerCase();
  if (unit === 'ms') return n / 1000;
  return n;
}

function runRequirementConsistency(input = {}, ctx = {}) {
  const fr = Array.isArray(input.fr) ? input.fr : [];
  const nfr = Array.isArray(input.nfr) ? input.nfr : [];
  const uc = Array.isArray(input.uc) ? input.uc : [];
  const br = Array.isArray(input.br) ? input.br : [];
  const warnings = [];
  const conflicts = [];

  // Rule 1: FR latency text vs NFR target
  for (const f of fr) {
    const frText = `${f.description || ''} ${f.ac || ''} ${f.name || ''}`;
    const frLat = parseLatencySeconds(frText);
    if (frLat == null) continue;
    for (const n of nfr) {
      const nText = `${n.requirement || ''} ${n.target || ''} ${n.measurement || ''}`;
      const nLat = parseLatencySeconds(nText);
      if (nLat == null) {
        if (/\b(response|latency|phản hồi)\b/i.test(nText)) {
          warnings.push(
            makeWarning({
              code: 'UNPARSED_TARGET',
              severity: 'info',
              message: `Could not parse latency target for ${n.id}`,
              refs: [n.id],
            })
          );
        }
        continue;
      }
      // conflict if both assert upper bounds and they differ by > 20%
      const lo = Math.min(frLat, nLat);
      const hi = Math.max(frLat, nLat);
      if (hi > 0 && (hi - lo) / hi > 0.2) {
        conflicts.push({
          type: 'LATENCY_MISMATCH',
          left: f.id,
          right: n.id,
          leftValue: frLat,
          rightValue: nLat,
          message: `Response bound mismatch ${frLat}s vs ${nLat}s`,
        });
      }
    }
  }

  // Rule 2: UC location freedom vs BR office-only
  const officeRe = /\b(office|văn phòng|on[- ]?premise|inside office|tại văn phòng)\b/i;
  const anywhereRe = /\b(anywhere|mọi nơi|remote|any location|bất kỳ đâu)\b/i;
  for (const u of uc) {
    const uText = `${u.title || ''} ${u.description || ''} ${u.mainFlow || ''}`;
    if (!anywhereRe.test(uText)) continue;
    for (const b of br) {
      const bText = `${b.title || ''} ${b.description || ''} ${b.businessRule || ''}`;
      if (officeRe.test(bText)) {
        conflicts.push({
          type: 'LOCATION_POLICY',
          left: u.id,
          right: b.id,
          message: 'UC allows anywhere but BR restricts to office',
        });
      }
    }
  }

  // Rule 3: duplicate priority contradiction FR Critical vs same CR mapped NFR Low — soft skip

  const data = {
    conflicts,
    conflictCount: conflicts.length,
  };

  const tool = ctx.tool || TOOL_NAME;
  const version = ctx.version || TOOL_VERSION;
  const inputHash = ctx.inputHash || hashInput(input);

  const facts = [
    makeFact({
      key: 'consistency.conflictCount',
      value: conflicts.length,
      unit: 'count',
      tool,
      version,
      evidence: conflicts.slice(0, 20).map((c) => ({ type: 'edge', ref: `${c.left}<->${c.right}` })),
    }),
    makeFact({
      key: 'consistency.conflicts',
      value: conflicts,
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
  purpose: "Detect cross-artifact requirement conflicts",
  algorithm: ["parse_targets","latency_rules","location_rules","emit_conflicts"],
  outputKeys: ["conflicts","conflictCount"],
  contextImpact: {},
  deterministic: true,
  llmCalls: 0,
  invocationMode: 'recipe',
  dependsOn: [],
  requiredContext: [],
  requiredData: ['fr', 'nfr'],
  aliases: ['A4'],
  run: runRequirementConsistency,
};

module.exports = { runRequirementConsistency, descriptor, TOOL_NAME, parseLatencySeconds };
