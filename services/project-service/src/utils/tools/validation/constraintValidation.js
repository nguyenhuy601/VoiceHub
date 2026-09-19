/**
 * B3 / T14 — constraint_validation (hard checks PASS/FAIL/SKIP)
 */

const {
  makeFact,
  makeWarning,
  makeToolResult,
  hashInput,
} = require('../toolContract');
const { getData, getContext, getPolicy } = require('../normalizeToolInput');

const TOOL_NAME = 'constraint_validation';
const TOOL_VERSION = 1;

function checkResult(id, status, detail = '') {
  return { id, status, detail: String(detail || '') };
}

function runConstraintValidation(input = {}, ctx = {}) {
  const deadline = getData(input, 'deadline') ?? getData(input, 'deadlineAt');
  const planEnd = getData(input, 'planEnd') ?? getData(input, 'plannedEnd');
  const budget = getData(input, 'budget');
  const estimateCost = getData(input, 'estimateCost') ?? getData(input, 'estimatedCost');
  const technology = Array.isArray(getData(input, 'technology'))
    ? getData(input, 'technology')
    : [];
  const approvedTechnology = Array.isArray(getData(input, 'approvedTechnology'))
    ? getData(input, 'approvedTechnology')
    : Array.isArray(getContext(input, 'approvedTechnology'))
      ? getContext(input, 'approvedTechnology')
      : [];
  const platform = Array.isArray(getData(input, 'platform')) ? getData(input, 'platform') : [];
  const approvedPlatform = Array.isArray(getData(input, 'approvedPlatform'))
    ? getData(input, 'approvedPlatform')
    : [];
  const securityFlags = getData(input, 'securityFlags') || {};
  const complianceRequired = Array.isArray(getData(input, 'complianceRequired'))
    ? getData(input, 'complianceRequired')
    : [];
  const compliancePresent = Array.isArray(getData(input, 'compliancePresent'))
    ? getData(input, 'compliancePresent')
    : [];
  const capacitySummary = getData(input, 'capacitySummary') || null;
  const skillsRequired = Array.isArray(getData(input, 'skillsRequired'))
    ? getData(input, 'skillsRequired')
    : [];
  const skillsAvailable = Array.isArray(getData(input, 'skillsAvailable'))
    ? getData(input, 'skillsAvailable')
    : [];

  const policy = input.policy || {};
  const warnings = [];
  const results = [];

  // Deadline
  if (deadline == null || planEnd == null) {
    results.push(checkResult('deadline', 'SKIP', 'deadline or planEnd missing'));
  } else {
    const d = new Date(deadline).getTime();
    const p = new Date(planEnd).getTime();
    if (!Number.isFinite(d) || !Number.isFinite(p)) {
      results.push(checkResult('deadline', 'SKIP', 'unparseable dates'));
    } else {
      results.push(
        checkResult('deadline', p <= d ? 'PASS' : 'FAIL', p <= d ? 'on time' : 'plan exceeds deadline')
      );
    }
  }

  // Budget
  if (budget == null || estimateCost == null) {
    results.push(checkResult('budget', 'SKIP', 'budget or estimate missing'));
  } else {
    const b = Number(budget);
    const e = Number(estimateCost);
    results.push(
      checkResult('budget', e <= b ? 'PASS' : 'FAIL', `estimate ${e} vs budget ${b}`)
    );
  }

  // Technology
  if (!technology.length && !approvedTechnology.length) {
    results.push(checkResult('technology', 'SKIP', 'no technology lists'));
  } else if (!approvedTechnology.length) {
    results.push(checkResult('technology', 'SKIP', 'no approvedTechnology'));
  } else {
    const approved = new Set(approvedTechnology.map((t) => String(t).toLowerCase()));
    const missing = technology.filter((t) => !approved.has(String(t).toLowerCase()));
    results.push(
      checkResult(
        'technology',
        missing.length ? 'FAIL' : 'PASS',
        missing.length ? `not approved: ${missing.join(',')}` : 'all approved'
      )
    );
  }

  // Platform
  if (!platform.length && !approvedPlatform.length) {
    results.push(checkResult('platform', 'SKIP', 'no platform lists'));
  } else if (!approvedPlatform.length) {
    results.push(checkResult('platform', 'SKIP', 'no approvedPlatform'));
  } else {
    const approved = new Set(approvedPlatform.map((t) => String(t).toLowerCase()));
    const missing = platform.filter((t) => !approved.has(String(t).toLowerCase()));
    results.push(
      checkResult('platform', missing.length ? 'FAIL' : 'PASS', missing.join(',') || 'ok')
    );
  }

  // Security
  if (!securityFlags || typeof securityFlags !== 'object' || !Object.keys(securityFlags).length) {
    results.push(checkResult('security', 'SKIP', 'no securityFlags'));
  } else {
    const failed = Object.entries(securityFlags)
      .filter(([, v]) => v === false || v === 'FAIL')
      .map(([k]) => k);
    results.push(
      checkResult('security', failed.length ? 'FAIL' : 'PASS', failed.join(',') || 'ok')
    );
  }

  // Compliance
  if (!complianceRequired.length) {
    results.push(checkResult('compliance', 'SKIP', 'no complianceRequired'));
  } else {
    const present = new Set(compliancePresent.map(String));
    const missing = complianceRequired.filter((c) => !present.has(String(c)));
    results.push(
      checkResult('compliance', missing.length ? 'FAIL' : 'PASS', missing.join(',') || 'ok')
    );
  }

  // Resource cap / capacity
  if (!capacitySummary || typeof capacitySummary !== 'object') {
    results.push(checkResult('resource_cap', 'SKIP', 'no capacitySummary'));
  } else {
    const available = Number(capacitySummary.availableHours);
    const required = Number(capacitySummary.requiredHours);
    if (!Number.isFinite(available) || !Number.isFinite(required)) {
      results.push(checkResult('resource_cap', 'SKIP', 'invalid capacity numbers'));
    } else {
      results.push(
        checkResult(
          'resource_cap',
          required <= available ? 'PASS' : 'FAIL',
          `required ${required} vs available ${available}`
        )
      );
      // alias Capacity label for user-facing
      results.push(
        checkResult(
          'capacity',
          required <= available ? 'PASS' : 'FAIL',
          `required ${required} vs available ${available}`
        )
      );
    }
  }

  // Mandatory skills
  if (!skillsRequired.length) {
    results.push(checkResult('mandatory_skill', 'SKIP', 'no skillsRequired'));
  } else {
    const avail = new Set(
      skillsAvailable.map((s) => String(s.name || s.skill || s).toLowerCase())
    );
    const missing = skillsRequired.filter((s) => {
      const name = String(s.name || s.skill || s).toLowerCase();
      return !avail.has(name);
    });
    results.push(
      checkResult(
        'mandatory_skill',
        missing.length ? 'FAIL' : 'PASS',
        missing.map((s) => s.name || s).join(',') || 'ok'
      )
    );
    results.push(
      checkResult(
        'skill',
        missing.length ? 'FAIL' : 'PASS',
        missing.map((s) => s.name || s).join(',') || 'ok'
      )
    );
  }

  const hardFails = results.filter((r) => r.status === 'FAIL');
  const canPublish = hardFails.length === 0;

  if (!canPublish) {
    warnings.push(
      makeWarning({
        code: 'CONSTRAINT_HARD_FAIL',
        severity: 'error',
        message: `Hard constraint failures: ${hardFails.map((r) => r.id).join(',')}`,
        refs: hardFails.map((r) => r.id),
      })
    );
  }

  const data = {
    results,
    canPublish,
    hardFailCount: hardFails.length,
    policyVersion: policy.policyVersion || policy.version || 'constraints-v1',
  };

  const tool = ctx.tool || TOOL_NAME;
  const version = ctx.version || TOOL_VERSION;
  const inputHash = ctx.inputHash || hashInput(input);

  const facts = [
    makeFact({
      key: 'constraints.canPublish',
      value: canPublish,
      tool,
      version,
    }),
    makeFact({
      key: 'constraints.results',
      value: results,
      tool,
      version,
    }),
    makeFact({
      key: 'constraints.hardFailCount',
      value: hardFails.length,
      unit: 'count',
      tool,
      version,
    }),
  ];

  return makeToolResult({
    data,
    facts,
    warnings,
    tool,
    version,
    inputHash,
    evidence: {
      sourceIds: hardFails.map((r) => r.id),
      formula: 'canPublish = zero FAIL among evaluated hard checks',
      policyVersion: data.policyVersion,
    },
  });
}

const descriptor = {
  name: TOOL_NAME,
  version: TOOL_VERSION,
  algorithmVersion: 1,
  purpose:
    'Validate hard project constraints (deadline, budget, tech, platform, security, compliance, capacity, skills)',
  algorithm: [
    'check_deadline',
    'check_budget',
    'check_technology',
    'check_platform',
    'check_security',
    'check_compliance',
    'check_capacity',
    'check_skills',
    'aggregate_can_publish',
  ],
  outputKeys: ['results', 'canPublish', 'hardFailCount'],
  contextImpact: {
    deadline: { affects: 'deadline_check', type: 'constraint' },
  },
  deterministic: true,
  llmCalls: 0,
  invocationMode: 'validation',
  dependsOn: [],
  requiredContext: [],
  requiredData: [],
  input: { data: [], context: [], policy: [] },
  aliases: ['B3', 'T14'],
  run: runConstraintValidation,
};

module.exports = { runConstraintValidation, descriptor, TOOL_NAME };
