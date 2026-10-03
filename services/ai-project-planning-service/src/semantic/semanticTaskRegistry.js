/**
 * SemanticTask registry — contracts per Analysis section.
 * SemanticTask ≠ LLM Task: run | skip | deterministic-only.
 */

const TASK_POLICIES = Object.freeze({
  RUN: 'run',
  SKIP: 'skip',
  DETERMINISTIC_ONLY: 'deterministic-only',
});

/**
 * @typedef {{
 *   id: string,
 *   section: string,
 *   engineId: string,
 *   defaultPolicy: string,
 *   allowsRuntime: boolean,
 *   inputContract: string,
 *   contextRequirements: string[],
 *   semanticSchema: object,
 *   evidenceRequirements: string,
 *   promptPolicy: string,
 *   validationRules: string[],
 *   confidencePolicy: string,
 *   outputContract: string,
 * }} SemanticTaskDef
 */

/** @type {SemanticTaskDef[]} */
const SEMANTIC_TASKS = Object.freeze([
  {
    id: 'bg',
    section: 'businessGoals',
    engineId: 'bg',
    defaultPolicy: TASK_POLICIES.RUN,
    allowsRuntime: true,
    inputContract:
      'goals sheet rows + overview; Customer Raw: BRQ.Business Goal + Context objective (raw_derive)',
    contextRequirements: ['packId', 'snapshotId'],
    semanticSchema: {
      goals: [
        {
          goalId: 'string',
          statement: 'string',
          successMetric: 'string?',
          priority: 'string?',
          stakeholders: 'string[]',
          ambiguity: 'object[]',
          evidence: 'object[]',
        },
      ],
    },
    evidenceRequirements: 'sourceRefs when sheet present',
    promptPolicy: 'Normalize business goals; do not invent FR/UC; no fill from empty sheet',
    validationRules: ['statement_non_empty', 'no_invent_on_empty'],
    confidencePolicy: 'soft',
    outputContract: 'goals[] meaning/structure/evidence — not SRS',
  },
  {
    id: 'br',
    section: 'businessRules',
    engineId: 'br',
    defaultPolicy: TASK_POLICIES.RUN,
    allowsRuntime: true,
    inputContract:
      'businessRules sheet rows; Customer Raw: FR constraints + Context Constraint (raw_derive)',
    contextRequirements: ['packId', 'optionalBgIds'],
    semanticSchema: {
      rules: [
        {
          ruleId: 'string',
          ruleCondition: 'string',
          ruleAction: 'string',
          constraint: 'string?',
          actors: 'string[]',
          scope: 'string?',
          ambiguity: 'object[]',
          evidence: 'object[]',
        },
      ],
    },
    evidenceRequirements: 'sourceRefs; forbid cross-fill from FR',
    promptPolicy: 'Condition-action-constraint; never invent from FR when BR empty',
    validationRules: ['condition_and_action', 'no_cross_fill'],
    confidencePolicy: 'soft',
    outputContract: 'rules[] — not SRS',
  },
  {
    id: 'nfr',
    section: 'nonFunctionalRequirements',
    engineId: 'nfr',
    defaultPolicy: TASK_POLICIES.RUN,
    allowsRuntime: true,
    inputContract: 'NFR sheet rows',
    contextRequirements: ['packId'],
    semanticSchema: {
      nfrs: [
        {
          nfrId: 'string',
          category: 'string',
          statement: 'string',
          metric: 'string?',
          threshold: 'string?',
          measurementMethod: 'string?',
          ambiguity: 'object[]',
          evidence: 'object[]',
        },
      ],
    },
    evidenceRequirements: 'sourceRefs',
    promptPolicy: 'Categorize NFR; do not invent when empty',
    validationRules: ['statement_non_empty'],
    confidencePolicy: 'soft',
    outputContract: 'nfrs[] — not SRS',
  },
  {
    id: 'scope',
    section: 'scope',
    engineId: 'scope',
    defaultPolicy: TASK_POLICIES.RUN,
    allowsRuntime: true,
    inputContract: 'scope in/out rows',
    contextRequirements: ['packId'],
    semanticSchema: {
      scopeItems: [
        {
          scopeId: 'string',
          inOut: 'in|out',
          statement: 'string',
          rationale: 'string?',
          ambiguity: 'object[]',
          evidence: 'object[]',
        },
      ],
    },
    evidenceRequirements: 'sourceRefs',
    promptPolicy: 'In vs out; no expand scope on empty',
    validationRules: ['in_out_required'],
    confidencePolicy: 'soft',
    outputContract: 'scopeItems[] — not SRS',
  },
  {
    id: 'bpm',
    section: 'processes',
    engineId: 'bpm',
    defaultPolicy: TASK_POLICIES.RUN,
    allowsRuntime: true,
    inputContract:
      'process sheet rows; Customer Raw: FR by module/actor + BRQ (raw_derive)',
    contextRequirements: ['packId'],
    semanticSchema: {
      processes: [
        {
          processId: 'string',
          name: 'string',
          actors: 'string[]',
          states: 'object[]',
          transitions: 'object[]',
          trigger: 'string?',
          businessSteps: 'object[]',
          ambiguity: 'object[]',
          evidence: 'object[]',
        },
      ],
    },
    evidenceRequirements: 'sourceRefs; no invent from FR when empty',
    promptPolicy: 'Business process flow; never synthesize from FR list when BPM empty',
    validationRules: ['name_required', 'no_cross_fill'],
    confidencePolicy: 'soft',
    outputContract: 'processes[] — not SRS',
  },
  {
    id: 'interface',
    section: 'interfaces',
    engineId: 'interface',
    defaultPolicy: TASK_POLICIES.RUN,
    allowsRuntime: true,
    inputContract:
      'interfaces sheet; Customer Raw: Context Integration/Platform + FR (raw_derive)',
    contextRequirements: ['packId'],
    semanticSchema: {
      interfaces: [
        {
          ifId: 'string',
          name: 'string',
          direction: 'string?',
          protocol: 'string?',
          partner: 'string?',
          dataExchanged: 'object[]',
          ambiguity: 'object[]',
          evidence: 'object[]',
        },
      ],
    },
    evidenceRequirements: 'sourceRefs',
    promptPolicy: 'External/system interfaces; no invent on empty',
    validationRules: ['name_required'],
    confidencePolicy: 'soft',
    outputContract: 'interfaces[] — not SRS',
  },
  {
    id: 'fr',
    section: 'functionalRequirements',
    engineId: 'fr',
    defaultPolicy: TASK_POLICIES.RUN,
    allowsRuntime: true,
    inputContract: 'FR projection / candidates',
    contextRequirements: ['packId', 'snapshotId', 'corpus'],
    semanticSchema: {
      items: [
        {
          frId: 'string',
          semanticInterpretation: 'object',
          ambiguities: 'object[]',
          relationships: 'object[]',
          evidence: 'object[]',
        },
      ],
    },
    evidenceRequirements: 'evidence spans preferred',
    promptPolicy: 'G4 semantic pipeline reference',
    validationRules: ['g4_pipeline'],
    confidencePolicy: 'partial_ok',
    outputContract: 'FR semantic enrich — not SRS draft',
  },
  {
    id: 'uc',
    section: 'useCases',
    engineId: 'uc',
    defaultPolicy: TASK_POLICIES.RUN,
    allowsRuntime: true,
    inputContract:
      'UC sheet (prefer); Customer Raw: FR Actor/Requirement/AC + BRQ + Target Users (raw_derive); no heuristic UC_FROM_FR',
    contextRequirements: ['packId', 'optionalFrIds'],
    semanticSchema: {
      useCases: [
        {
          ucId: 'string',
          actor: 'string',
          goal: 'string',
          trigger: 'string?',
          mainFlow: 'object[]',
          alternativeFlow: 'object[]',
          exceptionFlow: 'object[]',
          precondition: 'object[]',
          postcondition: 'object[]',
          relatedFrIds: 'string[]',
          ambiguity: 'object[]',
          evidence: 'object[]',
        },
      ],
    },
    evidenceRequirements: 'sourceRefs; heuristic from FR only if PHASE1_UC_HEURISTIC_FROM_FR=1',
    promptPolicy: 'UC flow semantics; schema distinct from Data',
    validationRules: ['actor_goal', 'no_default_cross_fill'],
    confidencePolicy: 'soft',
    outputContract: 'useCases[] — not SRS',
  },
  {
    id: 'data',
    section: 'entities',
    engineId: 'data',
    defaultPolicy: TASK_POLICIES.RUN,
    allowsRuntime: true,
    inputContract:
      'entity sheet; Customer Raw: nouns/modules in FR + domain context (raw_derive)',
    contextRequirements: ['packId'],
    semanticSchema: {
      entities: [
        {
          entityId: 'string',
          name: 'string',
          attributes: 'object[]',
          relationships: 'object[]',
          lifecycle: 'string?',
          ownership: 'string?',
          constraints: 'object[]',
          ambiguity: 'object[]',
          evidence: 'object[]',
        },
      ],
    },
    evidenceRequirements: 'sourceRefs; noun-from-FR only if PHASE1_DATA_HEURISTIC_FROM_FR=1',
    promptPolicy: 'Entity/attribute/relationship; schema distinct from UC',
    validationRules: ['name_required', 'no_default_cross_fill'],
    confidencePolicy: 'soft',
    outputContract: 'entities[] — not SRS',
  },
  {
    id: 'glossary',
    section: 'glossary',
    engineId: 'glossary',
    defaultPolicy: TASK_POLICIES.DETERMINISTIC_ONLY,
    allowsRuntime: false,
    inputContract: 'glossary sheet + upstream titles',
    contextRequirements: ['upstreamFragments'],
    semanticSchema: { terms: [{ term: 'string', definition: 'string?' }] },
    evidenceRequirements: 'optional',
    promptPolicy: 'deterministic collect only',
    validationRules: ['collect_only'],
    confidencePolicy: 'n/a',
    outputContract: 'glossary terms',
  },
  {
    id: 'assumption',
    section: 'assumptions',
    engineId: 'assumption',
    defaultPolicy: TASK_POLICIES.DETERMINISTIC_ONLY,
    allowsRuntime: false,
    inputContract: 'assumptions sheet + CQ lift',
    contextRequirements: ['dependencyResults'],
    semanticSchema: {
      items: [{ classification: 'ASSUMPTION|OPEN_QUESTION|BLOCKING_GAP' }],
    },
    evidenceRequirements: 'optional',
    promptPolicy: 'deterministic lift only',
    validationRules: ['classify'],
    confidencePolicy: 'n/a',
    outputContract: 'assumptions/CQ',
  },
  {
    id: 'traceability',
    section: 'traceability',
    engineId: 'traceability',
    defaultPolicy: TASK_POLICIES.DETERMINISTIC_ONLY,
    allowsRuntime: false,
    inputContract: 'upstream items + raw rows',
    contextRequirements: ['dependencyResults'],
    semanticSchema: { links: [{ analysisId: 'string', sourceRefs: 'object[]' }] },
    evidenceRequirements: 'link evidence',
    promptPolicy: 'deterministic map only',
    validationRules: ['map_only'],
    confidencePolicy: 'n/a',
    outputContract: 'trace links',
  },
]);

const BY_ID = Object.freeze(Object.fromEntries(SEMANTIC_TASKS.map((t) => [t.id, t])));

function listSemanticTasks() {
  return [...SEMANTIC_TASKS];
}

function getSemanticTask(id) {
  return BY_ID[String(id || '')] || null;
}

/**
 * Resolve effective policy for a task given input state + env.
 * @param {string} taskId
 * @param {{ sourceEmpty?: boolean, forcePolicy?: string, env?: NodeJS.ProcessEnv }} [ctx]
 */
function resolveTaskPolicy(taskId, ctx = {}) {
  const task = getSemanticTask(taskId);
  if (!task) return TASK_POLICIES.SKIP;

  if (ctx.sourceEmpty) return TASK_POLICIES.SKIP;
  if (ctx.forcePolicy && Object.values(TASK_POLICIES).includes(ctx.forcePolicy)) {
    return ctx.forcePolicy;
  }

  const env = ctx.env || process.env;
  const envKey = `SEMANTIC_TASK_${String(taskId).toUpperCase()}_POLICY`;
  const fromEnv = String(env[envKey] || '').trim().toLowerCase();
  if (fromEnv === 'run' || fromEnv === 'skip' || fromEnv === 'deterministic-only') {
    return fromEnv;
  }

  // Global enable for non-FR runtime when SEMANTIC_NONFR_RUNTIME=1
  if (
    task.allowsRuntime &&
    task.id !== 'fr' &&
    String(env.SEMANTIC_NONFR_RUNTIME || '').trim() === '1'
  ) {
    return TASK_POLICIES.RUN;
  }

  return task.defaultPolicy;
}

function requiredContractFields() {
  return [
    'id',
    'section',
    'engineId',
    'defaultPolicy',
    'allowsRuntime',
    'inputContract',
    'contextRequirements',
    'semanticSchema',
    'evidenceRequirements',
    'promptPolicy',
    'validationRules',
    'confidencePolicy',
    'outputContract',
  ];
}

module.exports = {
  TASK_POLICIES,
  SEMANTIC_TASKS,
  listSemanticTasks,
  getSemanticTask,
  resolveTaskPolicy,
  requiredContractFields,
};
