/**
 * On-demand A9 — nfr_feasibility (no historical P95 → unknown)
 */

const { makeFact, makeWarning, makeToolResult, hashInput } = require('../toolContract');
const { parseLatencySeconds } = require('../recipe/requirementConsistency');

const TOOL_NAME = 'nfr_feasibility';
const TOOL_VERSION = 1;

function runNfrFeasibility(input = {}, ctx = {}) {
  const nfr = Array.isArray(input.nfr) ? input.nfr : [];
  const technology = Array.isArray(input.technology)
    ? input.technology
    : Array.isArray(input.context?.technology)
      ? input.context.technology
      : [];
  const benchmarks = Array.isArray(input.perfBenchmarks) ? input.perfBenchmarks : [];
  const warnings = [];
  const items = [];

  if (benchmarks.length === 0) {
    warnings.push(
      makeWarning({
        code: 'MISSING_HISTORICAL_PERF',
        severity: 'warn',
        message: 'No perfBenchmarks — feasibility may be unknown',
      })
    );
  }

  for (const n of nfr) {
    const text = `${n.requirement} ${n.target} ${n.measurement}`;
    const targetSec = parseLatencySeconds(text);
    const evidence = [];
    let verdict = 'unknown';

    if (benchmarks.length > 0 && targetSec != null) {
      const similar = benchmarks.find((b) => String(b.category || '').toLowerCase() === String(n.category || '').toLowerCase())
        || benchmarks[0];
      const p95 = Number(similar?.p95Seconds);
      if (Number.isFinite(p95)) {
        evidence.push({ type: 'benchmark', ref: similar.id || 'bench-0', p95Seconds: p95 });
        verdict = p95 <= targetSec ? 'potentially_feasible' : 'unlikely';
      }
    } else if (technology.length > 0 && /cache|cdn|redis/i.test(technology.join(' '))) {
      verdict = 'potentially_feasible';
      evidence.push({ type: 'technology', ref: 'caching_stack' });
    } else if (targetSec == null && !/\d/.test(text)) {
      verdict = 'unknown';
      warnings.push(
        makeWarning({
          code: 'UNPARSED_TARGET',
          severity: 'info',
          message: `NFR ${n.id} has no numeric target`,
          refs: [n.id],
        })
      );
    }

    items.push({
      nfrId: n.id,
      verdict,
      evidence,
    });
  }

  const data = { items };
  const tool = ctx.tool || TOOL_NAME;
  const version = ctx.version || TOOL_VERSION;
  const inputHash = ctx.inputHash || hashInput(input);

  const facts = [
    makeFact({
      key: 'nfrFeasibility.items',
      value: items,
      tool,
      version,
    }),
    makeFact({
      key: 'nfrFeasibility.unknownCount',
      value: items.filter((i) => i.verdict === 'unknown').length,
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
  purpose: "Assess NFR feasibility vs technology/benchmarks (unknown without history)",
  algorithm: ["parse_target","benchmark_compare","tech_signals"],
  outputKeys: ["items"],
  contextImpact: {},
  deterministic: true,
  llmCalls: 0,
  invocationMode: 'on_demand',
  dependsOn: [],
  requiredContext: [],
  requiredData: ['nfr'],
  aliases: ['A9'],
  run: runNfrFeasibility,
};

module.exports = { runNfrFeasibility, descriptor, TOOL_NAME };
