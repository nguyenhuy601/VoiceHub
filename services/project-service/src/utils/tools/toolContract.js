/**
 * Tool contract helpers — Fact / Warning / ToolResult / Evidence / stable inputHash.
 * Tools are deterministic: no LLM, no Date.now(), no Mongo/HTTP.
 */

const crypto = require('crypto');

function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function hashInput(input) {
  return crypto.createHash('sha256').update(stableStringify(input)).digest('hex').slice(0, 32);
}

function makeFact({ key, value, unit = null, tool, version, evidence = [] }) {
  return {
    key: String(key),
    value,
    unit: unit || undefined,
    source: { tool: String(tool), version: Number(version) || 1 },
    evidence: Array.isArray(evidence) ? evidence : [],
  };
}

function makeWarning({ code, severity = 'warn', message, refs = [] }) {
  return {
    code: String(code),
    severity: severity === 'error' || severity === 'info' ? severity : 'warn',
    message: String(message || code),
    refs: Array.isArray(refs) ? refs.map(String) : [],
  };
}

function makeEvidence({
  sourceIds = [],
  formula = null,
  policyVersion = null,
  dataSnapshot = null,
  toolVersion = 'v1',
  inputHash = '',
} = {}) {
  return {
    sourceIds: Array.isArray(sourceIds) ? sourceIds.map(String) : [],
    formula: formula || undefined,
    policyVersion: policyVersion != null ? String(policyVersion) : undefined,
    dataSnapshot: dataSnapshot ?? undefined,
    toolVersion: String(toolVersion || 'v1'),
    inputHash: String(inputHash || ''),
  };
}

function makeToolResult({
  data,
  facts = [],
  warnings = [],
  tool,
  version,
  inputHash,
  durationMs = 0,
  evidence = null,
}) {
  return {
    data: data ?? null,
    facts: Array.isArray(facts) ? facts : [],
    warnings: Array.isArray(warnings) ? warnings : [],
    evidence: evidence || undefined,
    meta: {
      tool: String(tool),
      version: Number(version) || 1,
      inputHash: String(inputHash || ''),
      durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0,
      factCount: Array.isArray(facts) ? facts.length : 0,
      warningCount: Array.isArray(warnings) ? warnings.length : 0,
    },
  };
}

function nonEmptyString(v) {
  return String(v ?? '').trim().length > 0;
}

function asIdList(raw) {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((x) => String(x || '').trim()).filter(Boolean))];
  }
  if (typeof raw === 'string') {
    return [
      ...new Set(
        raw
          .split(/[,;|]/)
          .map((x) => x.trim())
          .filter(Boolean)
      ),
    ];
  }
  return [];
}

function normalizePriorityWeight(priority) {
  const p = String(priority || '').trim().toLowerCase();
  if (p === 'critical') return 3;
  if (p === 'high') return 2;
  if (p === 'normal' || p === 'medium' || p === 'low' || !p) return 1;
  return 1;
}

module.exports = {
  stableStringify,
  hashInput,
  makeFact,
  makeWarning,
  makeEvidence,
  makeToolResult,
  nonEmptyString,
  asIdList,
  normalizePriorityWeight,
};
