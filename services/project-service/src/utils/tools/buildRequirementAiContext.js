/**
 * Phase 1 — build AI Context projection from pack + requirementTools Facts.
 * Deterministic; no Mongo/HTTP/Date.now().
 */

const FACT_SUMMARY_KEYS = Object.freeze([
  'coverage.weighted',
  'coverage.raw',
  'coverage.passed',
  'coverage.uncoveredCount',
  'completeness.score',
  'completeness.missingTotal',
  'consistency.conflictCount',
  'trace.orphanCount',
  'trace.danglingCount',
  'trace.nodeCount',
  'scope.ambiguousCount',
  'scope.expansionCount',
  'scope.outOfScopeCount',
  'complexity.itemCount',
  'gateA.passed',
]);

function isRequirementAiContextEnabled() {
  const raw = String(process.env.REQUIREMENT_AI_CONTEXT || '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

function pickFactsSummary(facts = {}) {
  const out = {};
  for (const key of FACT_SUMMARY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(facts, key) && facts[key] !== undefined) {
      out[key] = facts[key];
    }
  }
  return out;
}

function priorityDistribution(frList = []) {
  const dist = { Critical: 0, High: 0, Medium: 0, Low: 0, Other: 0 };
  for (const row of frList) {
    const level = String(row.level || '').toLowerCase();
    if (level && level !== 'requirement') continue;
    const p = String(row.priority || 'Medium').trim();
    const key =
      p === 'Critical' || p === 'High' || p === 'Medium' || p === 'Low' ? p : 'Other';
    dist[key] += 1;
  }
  return dist;
}

function constraintList(pack) {
  const fromPack = (pack?.constraints || [])
    .map((c) => (typeof c === 'string' ? c : c?.description || c?.name || ''))
    .map((s) => String(s).trim())
    .filter(Boolean);
  const fromOverview = [];
  if (pack?.overview?.businessScope) {
    fromOverview.push(String(pack.overview.businessScope).trim().slice(0, 500));
  }
  return [...fromPack, ...fromOverview].slice(0, 40);
}

/**
 * @param {{ pack?: object, requirementTools?: object, extras?: object }} args
 */
function buildRequirementAiContext({ pack = {}, requirementTools = null, extras = {} } = {}) {
  const tools =
    requirementTools ||
    pack?.aiAnalysis?.analyses?.requirementTools ||
    null;
  const facts = (tools?.facts && typeof tools.facts === 'object' ? tools.facts : {}) || {};
  const recipe = tools?.recipe && typeof tools.recipe === 'object' ? tools.recipe : {};
  const gateA = tools?.gateA && typeof tools.gateA === 'object' ? tools.gateA : null;
  const overview = pack?.overview || {};

  const conflictCount = Number(facts['consistency.conflictCount']);
  const ambiguousCount = Number(facts['scope.ambiguousCount']);
  const coverageWeighted = facts['coverage.weighted'];
  const completenessScore = facts['completeness.score'];

  const consistency = {
    conflictCount: Number.isFinite(conflictCount) ? conflictCount : null,
    conflictsSample: Array.isArray(recipe.consistency?.conflicts)
      ? recipe.consistency.conflicts.slice(0, 10)
      : [],
  };

  const ambiguity = {
    ambiguousCount: Number.isFinite(ambiguousCount) ? ambiguousCount : null,
    expansionCount: Number(facts['scope.expansionCount']) || 0,
    signalsSample: Array.isArray(recipe.scope?.signals?.ambiguity)
      ? recipe.scope.signals.ambiguity.slice(0, 10)
      : [],
  };

  const feasibilitySummary =
    extras.feasibilitySummary && typeof extras.feasibilitySummary === 'object'
      ? extras.feasibilitySummary
      : { status: 'unknown', reason: 'nfr_feasibility_not_run' };

  return {
    problem: {
      name: String(overview.requirementName || '').trim(),
      objective: String(overview.projectObjective || '').trim(),
      businessScope: String(overview.businessScope || '').trim(),
      deadline: overview.deadline || null,
      startDate: overview.startDate || null,
      priority: String(overview.priority || '').trim() || null,
    },
    consistency,
    constraints: constraintList(pack),
    ambiguity,
    priorities: priorityDistribution(pack?.functionalRequirements || []),
    feasibilitySummary,
    factsSummary: pickFactsSummary({
      ...facts,
      'gateA.passed': gateA?.passed ?? facts['gateA.passed'],
    }),
    gateA: gateA
      ? {
          passed: Boolean(gateA.passed),
          checks: Array.isArray(gateA.checks) ? gateA.checks : [],
        }
      : null,
    coverageHint: {
      weighted: coverageWeighted ?? null,
      completeness: completenessScore ?? null,
    },
    policyVersion: 'requirement-ai-context-v1',
  };
}

/**
 * Compact block for LLM prompts (token-safe).
 */
function formatVerifiedFactsBlock(requirementAiContext) {
  if (!requirementAiContext || typeof requirementAiContext !== 'object') {
    return 'VERIFIED_FACTS: none';
  }
  const slim = {
    factsSummary: requirementAiContext.factsSummary || {},
    gateA: requirementAiContext.gateA || null,
    consistency: {
      conflictCount: requirementAiContext.consistency?.conflictCount ?? null,
    },
    ambiguity: {
      ambiguousCount: requirementAiContext.ambiguity?.ambiguousCount ?? null,
    },
    priorities: requirementAiContext.priorities || {},
    feasibilitySummary: requirementAiContext.feasibilitySummary || { status: 'unknown' },
  };
  return [
    'VERIFIED_FACTS (deterministic tools — do NOT invent numbers; cite only these keys):',
    JSON.stringify(slim),
  ].join('\n');
}

/**
 * Merge requirement AI context into project context slice for WHAT LLM jobs.
 */
function enrichProjectContextWithRequirementAi(baseContext, pack) {
  if (!isRequirementAiContextEnabled()) {
    return baseContext || {};
  }
  const requirementAiContext = buildRequirementAiContext({ pack });
  return {
    ...(baseContext || {}),
    requirementAiContext,
    verifiedFacts: requirementAiContext.factsSummary,
    gateA: requirementAiContext.gateA,
  };
}

module.exports = {
  FACT_SUMMARY_KEYS,
  isRequirementAiContextEnabled,
  buildRequirementAiContext,
  formatVerifiedFactsBlock,
  enrichProjectContextWithRequirementAi,
  pickFactsSummary,
  priorityDistribution,
};
