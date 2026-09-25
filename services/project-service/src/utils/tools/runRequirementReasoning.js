/**
 * Phase 1 stage 7 — AI Requirement Reasoning → requirementInsights.v1
 * LLM narrative only; metrics from Facts. Heuristic fallback when LLM off/fail.
 */

const {
  isAiPlanningLlmEnabled,
  generateJson,
  ollamaModel,
} = require('../aiAnalysis/ollamaClient');
const {
  buildRequirementAiContext,
  formatVerifiedFactsBlock,
} = require('./buildRequirementAiContext');
const {
  isRequirementInsightsEnabled,
  buildHeuristicRequirementInsights,
  normalizeRequirementInsights,
} = require('./requirementInsightsSchema');

function mergeQualityFromFacts(insights, requirementTools) {
  const facts = requirementTools?.facts || {};
  const gateA = requirementTools?.gateA || null;
  const next = { ...insights, quality: { ...insights.quality } };
  if (facts['coverage.weighted'] != null) {
    next.quality.coverageWeighted = Number(facts['coverage.weighted']);
  }
  if (facts['completeness.score'] != null) {
    next.quality.completenessScore = Number(facts['completeness.score']);
  }
  if (gateA?.passed != null) {
    next.quality.gateAPassed = Boolean(gateA.passed);
  } else if (facts['gateA.passed'] != null) {
    next.quality.gateAPassed = Boolean(facts['gateA.passed']);
  }
  if (facts['consistency.conflictCount'] != null) {
    next.conflicts = {
      ...next.conflicts,
      conflictCount: Number(facts['consistency.conflictCount']),
    };
  }
  if (facts['scope.ambiguousCount'] != null) {
    next.ambiguityGaps = {
      ...next.ambiguityGaps,
      ambiguousCount: Number(facts['scope.ambiguousCount']),
      expansionCount: Number(facts['scope.expansionCount']) || 0,
      uncoveredCount:
        facts['coverage.uncoveredCount'] != null
          ? Number(facts['coverage.uncoveredCount'])
          : next.ambiguityGaps?.uncoveredCount ?? null,
      missingTotal:
        facts['completeness.missingTotal'] != null
          ? Number(facts['completeness.missingTotal'])
          : next.ambiguityGaps?.missingTotal ?? null,
    };
  }
  return next;
}

function buildReasoningPrompt({ context, verifiedFactsBlock, whatSummary, intakeBlock = '' }) {
  return [
    'You are a senior BA. Produce Requirement Insights JSON only.',
    'Do NOT invent coverage/completeness/conflict/ambiguity numbers — copy only from VERIFIED_FACTS.',
    'Narrative and clarifications may reason about missing details; each clarification should cite frId when known.',
    'When INTAKE_CORPUS is present, use it as customer source context; prefer FR ids from input.',
    verifiedFactsBlock || 'VERIFIED_FACTS: none',
    intakeBlock || '',
    'Return ONLY valid JSON:',
    JSON.stringify({
      understanding: { name: '', objective: '', narrative: '' },
      businessImpact: { summary: '', priority: null },
      technicalImpact: { summary: '', platform: [] },
      planningRelevance: { level: 'MEDIUM', summary: '' },
      clarifications: [{ id: '', frId: '', field: '', text: '', priority: 'Medium' }],
      evidence: [{ claim: '', source: { tool: '', frId: '', packField: '' } }],
    }),
    `AI_CONTEXT: ${JSON.stringify({
      problem: context?.problem || null,
      priorities: context?.priorities || null,
      constraints: (context?.constraints || []).slice(0, 15),
    })}`,
    whatSummary ? `WHAT_SUMMARY: ${JSON.stringify(whatSummary)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function summarizeWhatAnalyses(whatAnalyses) {
  if (!whatAnalyses || typeof whatAnalyses !== 'object') return null;
  return {
    gapCount: Array.isArray(whatAnalyses.gap?.items) ? whatAnalyses.gap.items.length : 0,
    capabilityCount: Array.isArray(whatAnalyses.capability?.items)
      ? whatAnalyses.capability.items.length
      : 0,
    hierarchyFeatures: Array.isArray(whatAnalyses.hierarchy?.proposedFeatures)
      ? whatAnalyses.hierarchy.proposedFeatures.length
      : 0,
  };
}

/**
 * @returns {{ insights: object, model: string|null, meta: object }}
 */
async function runRequirementReasoning({
  pack = {},
  requirementTools = null,
  whatAnalyses = null,
  generateJsonFn = null,
  forceHeuristic = false,
} = {}) {
  const started = Date.now();
  const tools =
    requirementTools || pack?.aiAnalysis?.analyses?.requirementTools || null;

  if (!isRequirementInsightsEnabled()) {
    const insights = buildHeuristicRequirementInsights({
      pack,
      requirementTools: tools,
      whatAnalyses,
    });
    insights.meta = { ...insights.meta, skipped: true, reason: 'REQUIREMENT_INSIGHTS_off' };
    return {
      insights,
      model: null,
      meta: { llmCalls: 0, mode: 'skipped', durationMs: Date.now() - started },
    };
  }

  const heuristic = buildHeuristicRequirementInsights({
    pack,
    requirementTools: tools,
    whatAnalyses,
  });

  const llmOn =
    !forceHeuristic && isAiPlanningLlmEnabled() && typeof (generateJsonFn || generateJson) === 'function';

  if (!llmOn) {
    return {
      insights: { ...heuristic, meta: { ...heuristic.meta, mode: 'heuristic' } },
      model: null,
      meta: { llmCalls: 0, mode: 'heuristic', durationMs: Date.now() - started },
    };
  }

  const context = buildRequirementAiContext({ pack, requirementTools: tools });
  const verifiedFactsBlock = formatVerifiedFactsBlock(context);
  let intakeBlock = '';
  try {
    const { buildWhatIntakePromptBlock } = require('../aiAnalysis/buildIntakeCorpus');
    intakeBlock = buildWhatIntakePromptBlock(pack);
  } catch {
    intakeBlock = '';
  }
  const prompt = buildReasoningPrompt({
    context,
    verifiedFactsBlock,
    whatSummary: summarizeWhatAnalyses(whatAnalyses),
    intakeBlock,
  });

  const generate = generateJsonFn || generateJson;
  try {
    const result = await generate({
      prompt,
      temperature: 0.1,
      numPredict: 768,
      timeoutMs: 120_000,
    });
    if (!result?.ok || result.data == null) {
      return {
        insights: {
          ...heuristic,
          meta: {
            ...heuristic.meta,
            mode: 'heuristic_fallback',
            llmError: result?.error || 'llm_failed',
          },
        },
        model: ollamaModel(),
        meta: {
          llmCalls: 1,
          mode: 'heuristic_fallback',
          durationMs: Date.now() - started,
        },
      };
    }

    let insights = normalizeRequirementInsights({
      ...heuristic,
      ...result.data,
      understanding: {
        ...heuristic.understanding,
        ...(result.data.understanding || {}),
      },
      clarifications:
        Array.isArray(result.data.clarifications) && result.data.clarifications.length
          ? result.data.clarifications
          : heuristic.clarifications,
      evidence: [
        ...(heuristic.evidence || []),
        ...(Array.isArray(result.data.evidence) ? result.data.evidence : []),
      ],
      meta: { mode: 'llm', schema: heuristic.schemaVersion },
    });
    insights = mergeQualityFromFacts(insights, tools);

    return {
      insights,
      model: ollamaModel(),
      meta: { llmCalls: 1, mode: 'llm', durationMs: Date.now() - started },
    };
  } catch (err) {
    return {
      insights: {
        ...heuristic,
        meta: {
          ...heuristic.meta,
          mode: 'heuristic_fallback',
          llmError: err.message || 'llm_exception',
        },
      },
      model: ollamaModel(),
      meta: {
        llmCalls: 1,
        mode: 'heuristic_fallback',
        durationMs: Date.now() - started,
      },
    };
  }
}

module.exports = {
  runRequirementReasoning,
  mergeQualityFromFacts,
  buildReasoningPrompt,
};
