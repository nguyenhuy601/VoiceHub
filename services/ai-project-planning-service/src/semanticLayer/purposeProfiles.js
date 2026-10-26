/**
 * Per-purpose context contracts. Callers may add required sections, not remove them.
 * retrievalMode "none" means the package is the tool result already computed.
 */

const PURPOSE_PROFILES = Object.freeze({
  WBS_GENERATION: {
    retrievalMode: 'graph',
    defaultTokenBudget: 6000,
    maxTokenBudget: 6000,
    defaultHistoricalPolicy: 'SAME_ORGANIZATION',
    forbidSimilarityFill: true,
    required: {
      relations: ['story_to_fr', 'fr_to_acceptance_criteria'],
      sections: ['story', 'functionalRequirements', 'acceptanceCriteria'],
    },
    optional: {
      sections: ['businessDefinitions', 'architectureConstraints', 'historicalExamples'],
    },
  },
  CPM: {
    retrievalMode: 'graph',
    defaultTokenBudget: 8000,
    maxTokenBudget: 8000,
    defaultHistoricalPolicy: 'NONE',
    forbidSimilarityFill: true,
    required: {
      relations: ['task_to_dependency'],
      sections: ['tasks', 'durations', 'dependencies'],
    },
    optional: { sections: [] },
  },
  EFFORT: {
    retrievalMode: 'graph',
    defaultTokenBudget: 4000,
    maxTokenBudget: 4000,
    defaultHistoricalPolicy: 'NONE',
    forbidSimilarityFill: true,
    required: {
      relations: [],
      sections: ['tasks', 'roles', 'coefficients'],
    },
    optional: { sections: ['historicalExamples'] },
  },
  BACKLOG: {
    retrievalMode: 'graph',
    defaultTokenBudget: 6000,
    maxTokenBudget: 6000,
    defaultHistoricalPolicy: 'NONE',
    forbidSimilarityFill: true,
    requireAny: ['story', 'functionalRequirements'],
    required: {
      relations: ['story_to_fr'],
      sections: ['story', 'functionalRequirements'],
    },
    optional: { sections: [] },
  },
  DEPENDENCY: {
    retrievalMode: 'graph',
    defaultTokenBudget: 6000,
    maxTokenBudget: 6000,
    defaultHistoricalPolicy: 'NONE',
    forbidSimilarityFill: true,
    requireAny: ['tasks'],
    required: {
      relations: ['task_to_dependency', 'task_to_fr'],
      sections: ['tasks', 'functionalRequirements'],
    },
    optional: { sections: [] },
  },
  RISK: {
    retrievalMode: 'graph',
    defaultTokenBudget: 6000,
    maxTokenBudget: 6000,
    defaultHistoricalPolicy: 'NONE',
    forbidSimilarityFill: true,
    requireAny: ['functionalRequirements', 'triggers'],
    required: {
      relations: ['trigger_to_fr'],
      sections: ['functionalRequirements', 'triggers'],
    },
    optional: { sections: [] },
  },
  QUALITY: {
    retrievalMode: 'graph',
    defaultTokenBudget: 6000,
    maxTokenBudget: 6000,
    defaultHistoricalPolicy: 'NONE',
    forbidSimilarityFill: true,
    requireAny: ['functionalRequirements', 'useCases', 'nfrs'],
    required: {
      relations: ['story_to_fr', 'fr_to_acceptance_criteria', 'uc_to_fr'],
      sections: ['functionalRequirements', 'useCases', 'nfrs', 'businessRules', 'interfaces'],
    },
    optional: { sections: ['businessDefinitions'] },
  },
  MATCHING: {
    retrievalMode: 'graph',
    defaultTokenBudget: 4000,
    maxTokenBudget: 4000,
    defaultHistoricalPolicy: 'NONE',
    forbidSimilarityFill: true,
    required: {
      relations: ['task_to_role'],
      sections: ['tasks', 'roles'],
    },
    optional: { sections: ['historicalExamples'] },
  },
  SCHEDULE: {
    retrievalMode: 'graph',
    defaultTokenBudget: 4000,
    maxTokenBudget: 4000,
    defaultHistoricalPolicy: 'NONE',
    forbidSimilarityFill: true,
    // Dependencies optional: empty DAG still schedules; DependencyTool may yield no edges.
    required: {
      relations: [],
      sections: ['tasks', 'durations'],
    },
    optional: { sections: ['dependencies'] },
  },
  SCHEDULE_TEXT: {
    retrievalMode: 'none',
    defaultTokenBudget: 4000,
    maxTokenBudget: 4000,
    defaultHistoricalPolicy: 'NONE',
    forbidSimilarityFill: true,
    requireAny: ['tasks'],
    required: {
      relations: [],
      sections: ['tasks'],
    },
    optional: { sections: [] },
  },
  SPRINT: {
    retrievalMode: 'none',
    defaultTokenBudget: 4000,
    maxTokenBudget: 4000,
    defaultHistoricalPolicy: 'NONE',
    forbidSimilarityFill: true,
    requireAny: ['sprints'],
    required: {
      relations: [],
      sections: ['sprints'],
    },
    optional: { sections: [] },
  },
  RELEASES: {
    retrievalMode: 'none',
    defaultTokenBudget: 4000,
    maxTokenBudget: 4000,
    defaultHistoricalPolicy: 'NONE',
    forbidSimilarityFill: true,
    requireAny: ['sprints', 'releases'],
    required: {
      relations: [],
      sections: ['sprints', 'releases'],
    },
    optional: { sections: [] },
  },
  PROJECT_PLAN: {
    retrievalMode: 'graph',
    defaultTokenBudget: 4000,
    maxTokenBudget: 4000,
    defaultHistoricalPolicy: 'NONE',
    forbidSimilarityFill: true,
    required: {
      relations: [],
      sections: ['tasks'],
    },
    optional: { sections: [] },
  },
  EXPLAIN_EFFORT: {
    retrievalMode: 'none',
    defaultTokenBudget: 2000,
    maxTokenBudget: 2000,
    defaultHistoricalPolicy: 'NONE',
    forbidSimilarityFill: true,
    required: {
      relations: [],
      sections: ['toolResult'],
    },
    optional: { sections: [] },
  },
});

function unique(values) {
  const out = [];
  for (const value of values) {
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

function resolvePurposeProfile(purpose, requestRequired = {}, requestOptional = {}) {
  const profile = PURPOSE_PROFILES[purpose];
  if (!profile) return null;
  return {
    ...profile,
    required: {
      relations: unique([
        ...profile.required.relations,
        ...(requestRequired.relations || []),
      ]),
      sections: unique([
        ...profile.required.sections,
        ...(requestRequired.sections || []),
      ]),
    },
    optional: {
      sections: unique([
        ...profile.optional.sections,
        ...(requestOptional.sections || []),
      ]),
    },
  };
}

module.exports = {
  PURPOSE_PROFILES,
  resolvePurposeProfile,
};
