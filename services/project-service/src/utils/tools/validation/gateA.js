/**
 * Gate A — advisory quality checks (duplicates + missing sections + consistency).
 * Coverage FR trace is informational only (skipped) — does not fail the gate.
 */

const { makeFact, makeWarning, makeToolResult, hashInput } = require('../toolContract');

const TOOL_NAME = 'gate_a_requirement_quality';
const TOOL_VERSION = 2;

const DEFAULT_THRESHOLDS = Object.freeze({
  minWeightedCoverage: 0.8,
  maxConflictCount: 0,
  minCompleteness: 0.5,
  maxAmbiguousCount: null,
  maxDuplicateCount: 0,
  maxMissingSections: 0,
});

function runGateA(input = {}, ctx = {}) {
  const factStore = ctx.factStore;
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(input.thresholds || {}) };

  const warnings = [];
  const coverage = factStore?.get('coverage.weighted')?.value;
  const conflictCount = factStore?.get('consistency.conflictCount')?.value;
  const completeness = factStore?.get('completeness.score')?.value;
  const ambiguousCount = factStore?.get('scope.ambiguousCount')?.value;

  const duplicateCount =
    input.duplicateCount != null
      ? Number(input.duplicateCount)
      : Number(factStore?.get('advisory.duplicateCount')?.value ?? 0);
  const missingSections = Array.isArray(input.missingSections)
    ? input.missingSections
    : Array.isArray(factStore?.get('advisory.missingSections')?.value)
      ? factStore.get('advisory.missingSections').value
      : [];

  const checks = [];

  checks.push({
    id: 'duplicates',
    passed: Number(duplicateCount) <= Number(thresholds.maxDuplicateCount ?? 0),
    value: Number.isFinite(duplicateCount) ? duplicateCount : 0,
    threshold: thresholds.maxDuplicateCount ?? 0,
    detail: input.duplicateDetail || null,
  });

  checks.push({
    id: 'missing_sections',
    passed: missingSections.length <= Number(thresholds.maxMissingSections ?? 0),
    value: missingSections.length,
    threshold: thresholds.maxMissingSections ?? 0,
    detail: missingSections,
  });

  const conflictOk =
    conflictCount == null || Number(conflictCount) <= Number(thresholds.maxConflictCount);
  checks.push({
    id: 'consistency',
    passed: conflictOk,
    value: conflictCount,
    threshold: thresholds.maxConflictCount,
  });

  // Completeness remains advisory signal (does not map to Coverage).
  if (completeness != null) {
    const compOk = Number(completeness) >= Number(thresholds.minCompleteness);
    checks.push({
      id: 'completeness',
      passed: compOk,
      value: completeness,
      threshold: thresholds.minCompleteness,
    });
  }

  if (thresholds.maxAmbiguousCount != null && ambiguousCount != null) {
    const ambOk = Number(ambiguousCount) <= Number(thresholds.maxAmbiguousCount);
    checks.push({
      id: 'ambiguity',
      passed: ambOk,
      value: ambiguousCount,
      threshold: thresholds.maxAmbiguousCount,
    });
  }

  // Coverage: show if known, never fails advisory Gate A.
  if (coverage != null) {
    checks.push({
      id: 'coverage',
      passed: true,
      skipped: true,
      advisory: true,
      value: coverage,
      threshold: thresholds.minWeightedCoverage,
    });
  } else {
    warnings.push(
      makeWarning({
        code: 'COVERAGE_FACT_OPTIONAL',
        severity: 'info',
        message: 'coverage.weighted omitted — advisory Gate A does not require FR trace coverage',
      })
    );
  }

  const warningChecks = checks.filter((c) => c && !c.skipped && c.passed === false);
  const hasWarnings = warningChecks.length > 0;
  // passed=false means "has warnings" for UI; assert Gate1 does not enforce (unless GATE_A_ENFORCE).
  const passed = !hasWarnings;
  const data = {
    passed,
    hasWarnings,
    mode: 'advisory',
    checks,
    thresholds: { ...thresholds, advisory: true },
  };

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
    makeFact({
      key: 'gateA.mode',
      value: 'advisory',
      tool,
      version,
    }),
    makeFact({
      key: 'gateA.hasWarnings',
      value: hasWarnings,
      tool,
      version,
    }),
  ];

  return makeToolResult({ data, facts, warnings, tool, version, inputHash });
}

const descriptor = {
  name: TOOL_NAME,
  version: TOOL_VERSION,
  algorithmVersion: 2,
  purpose:
    'Gate A advisory: duplicates + missing sections (+ consistency); coverage informational only',
  algorithm: ['read_facts', 'advisory_checks', 'aggregate_warnings'],
  outputKeys: ['passed', 'hasWarnings', 'mode', 'checks', 'thresholds'],
  contextImpact: {},
  deterministic: true,
  llmCalls: 0,
  invocationMode: 'validation',
  dependsOn: [],
  requiredContext: [],
  requiredData: [],
  aliases: ['GateA'],
  run: runGateA,
};

module.exports = { runGateA, descriptor, TOOL_NAME, DEFAULT_THRESHOLDS };
