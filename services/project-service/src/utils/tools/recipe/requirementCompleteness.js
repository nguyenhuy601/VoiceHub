/**
 * A3 — requirement_completeness (field checklist on FR leaves)
 */

const {
  makeFact,
  makeWarning,
  makeToolResult,
  hashInput,
  nonEmptyString,
} = require('../toolContract');
const { listFrLeaves } = require('../projectCanonicalBundle');

const TOOL_NAME = 'requirement_completeness';
const TOOL_VERSION = 1;

const CHECKLIST = Object.freeze([
  { key: 'actor', label: 'Actor' },
  { key: 'action', label: 'Action', derive: (fr) => nonEmptyString(fr.mainFlow) || nonEmptyString(fr.name) },
  { key: 'object', label: 'Object', derive: (fr) => nonEmptyString(fr.name) || nonEmptyString(fr.description) },
  { key: 'input', label: 'Input' },
  { key: 'output', label: 'Output' },
  { key: 'businessRules', label: 'Business rule' },
  { key: 'exceptionFlow', label: 'Error handling' },
  { key: 'priority', label: 'Priority', derive: (fr) => nonEmptyString(fr.priority) },
  { key: 'ac', label: 'Acceptance criteria' },
  { key: 'dependency', label: 'Dependency', derive: (fr) => nonEmptyString(fr.dependency) || (fr.brIds || []).length > 0 },
  { key: 'constraint', label: 'Constraint' },
]);

function fieldPresent(fr, item) {
  if (typeof item.derive === 'function') return Boolean(item.derive(fr));
  return nonEmptyString(fr[item.key]);
}

function runRequirementCompleteness(input = {}, ctx = {}) {
  const fr = Array.isArray(input.fr)
    ? input.fr
    : Array.isArray(input.requirements)
      ? input.requirements
      : [];
  const leaves = listFrLeaves(fr);
  const warnings = [];

  if (leaves.length === 0) {
    warnings.push(
      makeWarning({
        code: 'EMPTY_REQUIREMENTS',
        severity: 'warn',
        message: 'No FR leaves for completeness',
      })
    );
  }

  const items = [];
  let sumScore = 0;

  for (const leaf of leaves) {
    const missing = [];
    let present = 0;
    for (const check of CHECKLIST) {
      if (fieldPresent(leaf, check)) present += 1;
      else missing.push(check.label);
    }
    const score = CHECKLIST.length === 0 ? 0 : present / CHECKLIST.length;
    sumScore += score;
    items.push({
      frId: leaf.id,
      completeness: Math.round(score * 1000) / 1000,
      completenessPct: Math.round(score * 100),
      missing,
    });
  }

  const overall = leaves.length === 0 ? null : sumScore / leaves.length;

  const data = {
    overall,
    overallPct: overall == null ? null : Math.round(overall * 100),
    items,
    checklistSize: CHECKLIST.length,
  };

  const tool = ctx.tool || TOOL_NAME;
  const version = ctx.version || TOOL_VERSION;
  const inputHash = ctx.inputHash || hashInput(input);

  const facts = [
    makeFact({
      key: 'completeness.score',
      value: overall,
      unit: 'ratio',
      tool,
      version,
    }),
    makeFact({
      key: 'completeness.items',
      value: items,
      tool,
      version,
      evidence: items.slice(0, 20).map((i) => ({ type: 'fr', ref: i.frId })),
    }),
    makeFact({
      key: 'completeness.missingTotal',
      value: items.reduce((acc, i) => acc + i.missing.length, 0),
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
  purpose: "Score FR leaf field completeness checklist",
  algorithm: ["list_leaves","field_checklist","aggregate_score"],
  outputKeys: ["overall","items","checklistSize"],
  contextImpact: {},
  deterministic: true,
  llmCalls: 0,
  invocationMode: 'recipe',
  dependsOn: [],
  requiredContext: [],
  requiredData: ['fr'],
  aliases: ['A3'],
  run: runRequirementCompleteness,
};

module.exports = { runRequirementCompleteness, descriptor, TOOL_NAME, CHECKLIST };
