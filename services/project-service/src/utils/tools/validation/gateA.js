/**
 * Gate A — coverage + completeness + consistency (+ optional ambiguity)
 */

const { makeFact, makeWarning, makeToolResult, hashInput } = require('../toolContract');

const TOOL_NAME = 'gate_a_requirement_quality';
const TOOL_VERSION = 1;

const DEFAULT_THRESHOLDS = Object.freeze({
  minWeightedCoverage: 0.8,
  maxConflictCount: 0,
  minCompleteness: 0.5,
  maxAmbiguousCount: null, // optional
});

function runGateA(input = {}, ctx = {}) {
  const factStore = ctx.factStore;
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(input.thresholds || {}) };

  const warnings = [];
  const coverage = factStore?.get('coverage.weighted')?.value;
  const conflictCount = factStore?.get('consistency.conflictCount')?.value;
  const completeness = factStore?.get('completeness.score')?.value;
  const ambiguousCount = factStore?.get('scope.ambiguousCount')?.value;

  const checks = [];

  checks.push({
    id: 'coverage',
    passed: coverage != null && Number(coverage) >= Number(thresholds.minWeightedCoverage),
    value: coverage,
    threshold: thresholds.minWeightedCoverage,
  });

  const conflictOk =
    conflictCount == null || Number(conflictCount) <= Number(thresholds.maxConflictCount);
  checks.push({
    id: 'consistency',
    passed: conflictOk,
    value: conflictCount,
    threshold: thresholds.maxConflictCount,
  });

  const compOk =
    completeness == null || Number(completeness) >= Number(thresholds.minCompleteness);
  checks.push({
    id: 'completeness',
    passed: compOk,
    value: completeness,
    threshold: thresholds.minCompleteness,
  });

  if (thresholds.maxAmbiguousCount != null && ambiguousCount != null) {
    const ambOk = Number(ambiguousCount) <= Number(thresholds.maxAmbiguousCount);
    checks.push({
      id: 'ambiguity',
      passed: ambOk,
      value: ambiguousCount,
      threshold: thresholds.maxAmbiguousCount,
    });
  }

  if (coverage == null) {
    warnings.push(
      makeWarning({
        code: 'MISSING_COVERAGE_FACT',
        severity: 'error',
        message: 'coverage.weighted fact missing',
      })
    );
    checks[0].passed = false;
  }

  const passed = checks.every((c) => c.passed);
  const data = { passed, checks, thresholds };

  const tool = ctx.tool || TOOL_NAME;
  const version = ctx.version || TOOL_VERSION;
  const inputHash = ctx.inputHash || hashInput(input);

  const facts = [
    makeFact({
      key: 'gateA.passed',
      value: passed,
      tool,
      version,
    }),
    makeFact({
      key: 'gateA.checks',
      value: checks,
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
  purpose: "Gate A: pass/fail on coverage, completeness, consistency thresholds",
  algorithm: ["read_facts","apply_thresholds","aggregate_pass"],
  outputKeys: ["passed","checks","thresholds"],
  contextImpact: {},
  deterministic: true,
  llmCalls: 0,
  invocationMode: 'validation',
  dependsOn: ['coverage.weighted'],
  requiredContext: [],
  requiredData: [],
  aliases: ['GateA'],
  run: runGateA,
};

module.exports = { runGateA, descriptor, TOOL_NAME, DEFAULT_THRESHOLDS };
