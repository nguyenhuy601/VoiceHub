/**
 * LLM derive Analysis sections from Customer Raw pack slices (RULE-RAW-DERIVE-01…05).
 */

const { getSemanticTask, TASK_POLICIES } = require('./semanticTaskRegistry');
const { invokeSemanticRuntime } = require('./semanticRuntime');
const { stampProposalItem, PRODUCERS } = require('./stampProvenance');
const { buildRawDeriveInput, profileBgDeriveInput } = require('./buildRawDeriveInput');
const {
  shouldRawDeriveSection,
  isLlmDeriveSection,
  getActiveLlmDeriveSections,
  isCriticalRawDeriveSection,
} = require('./rawSectionDerivePolicy');
const { isLlmEnabled } = require('../runtime/ollamaGenerate');

/** BG V2: prefer planning timeout; default 240s (derive previously stuck at 180s). */
function resolveBgDeriveTimeoutMs(env = process.env) {
  const raw = env.OLLAMA_PLANNING_TIMEOUT_MS || env.OLLAMA_TIMEOUT_MS;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 5000) return Math.min(600000, n);
  return 240000;
}

/** BG V2: smaller num_predict — goals JSON, not full SRS. */
function resolveBgDeriveMaxTokens(env = process.env) {
  const n = Number(env.PHASE1_BG_DERIVE_MAX_TOKENS);
  if (Number.isFinite(n) && n >= 256) return Math.min(2048, Math.floor(n));
  return 768;
}

const SECTION_LABEL = Object.freeze({
  bg: 'BG',
  br: 'BR',
  bpm: 'BPM',
  uc: 'UC',
  data: 'Data',
  interface: 'Interface',
});

/**
 * Hard-fail phase_what when an active LLM derive section fails or returns empty.
 * @param {string} engineId
 * @param {object} result
 * @param {NodeJS.ProcessEnv} [env]
 */
function assertCriticalDeriveOk(engineId, result, env = process.env) {
  if (!isCriticalRawDeriveSection(engineId, env)) return;
  if (result?.reason === 'SHEET_PRESENT') return;
  if (result?.status === TASK_POLICIES.RUN && Array.isArray(result.items) && result.items.length) {
    return;
  }
  const label = SECTION_LABEL[engineId] || String(engineId).toUpperCase();
  const reason = result?.coverage?.reason || result?.reason || 'DERIVE_EMPTY';
  const err = new Error(
    `Không derive được section ${label} từ CR/NFR/context — cần BA bổ sung hoặc chạy lại AI`
  );
  err.code = 'RAW_DERIVE_FAILED';
  err.engineId = engineId;
  err.reason = reason;
  throw err;
}

const SECTION_BY_ENGINE = Object.freeze({
  bg: 'businessGoals',
  br: 'businessRules',
  bpm: 'processes',
  uc: 'useCases',
  data: 'entities',
  interface: 'interfaces',
});

const RESULT_KEY_BY_ENGINE = Object.freeze({
  bg: 'goals',
  br: 'rules',
  bpm: 'processes',
  uc: 'useCases',
  data: 'entities',
  interface: 'interfaces',
});

const PREFIX_BY_ENGINE = Object.freeze({
  bg: 'BG',
  br: 'BR',
  bpm: 'BPM',
  uc: 'UC',
  data: 'ENT',
  interface: 'IF',
});

function buildDerivePrompt(engineId, input, task) {
  const schemaHint = task?.semanticSchema ? JSON.stringify(task.semanticSchema) : '{}';
  const resultKey = RESULT_KEY_BY_ENGINE[engineId] || 'items';
  const isBgV2 = engineId === 'bg' && input?.mode === 'raw_derive_v2';
  if (isBgV2) {
    return [
      `SemanticTask=bg mode=raw_derive_v2 section=businessGoals`,
      'Derive business goal CANDIDATES only. Prefer businessRequests.businessGoal as primary signal.',
      'Use businessThemes + requirements (id/name/module/actor) to enrich, split, or normalize — not invent.',
      'Do not invent FR ids; relatedFrIds must reference requirements[].id or BRQ ids.',
      'Every goal MUST include relatedFrIds and sourceRefs (FR-/BRQ- ids).',
      `Put the array under key "${resultKey}".`,
      task?.promptPolicy || '',
      input?.deriveInstruction || '',
      `Schema hint: ${schemaHint}`,
      `Input: ${JSON.stringify(input)}`,
    ].join('\n');
  }
  return [
    `SemanticTask=${engineId} mode=raw_derive section=${SECTION_BY_ENGINE[engineId]}`,
    'Customer Raw has NO Analysis sheets. Derive this section as CANDIDATE proposals.',
    'Project ONLY from functionalRequirements + requirementUnderstanding + evidenceRefs + overview.',
    'Do not invent FR ids that are not in functionalRequirements / understanding.',
    'Every item MUST include relatedFrIds and/or sourceRefs pointing to CR-/BRQ- ids when possible.',
    `Put the array under key "${resultKey}".`,
    task?.promptPolicy || '',
    `Schema hint: ${schemaHint}`,
    `Input: ${JSON.stringify(input)}`,
  ].join('\n');
}

function extractArray(engineId, data) {
  if (!data || typeof data !== 'object') return [];
  const key = RESULT_KEY_BY_ENGINE[engineId];
  if (key && Array.isArray(data[key])) return data[key];
  if (Array.isArray(data.items)) return data.items;
  return [];
}

function mapRowToItem(engineId, row, index) {
  const prefix = PREFIX_BY_ENGINE[engineId] || 'ITEM';
  const section = SECTION_BY_ENGINE[engineId];
  const related = Array.isArray(row.relatedFrIds)
    ? row.relatedFrIds.map(String)
    : Array.isArray(row.derivedFrom)
      ? row.derivedFrom.map(String)
      : [];
  const sourceRefs = Array.isArray(row.sourceRefs)
    ? row.sourceRefs
    : related.map((id) => ({ externalId: id, sheet: '03_Requirement' }));

  const title =
    row.statement ||
    row.goal ||
    row.name ||
    row.title ||
    row.ruleCondition ||
    `Derived ${prefix}-${index + 1}`;

  const description =
    row.description ||
    row.ruleAction ||
    row.rationale ||
    row.mainFlow ||
    (Array.isArray(row.businessSteps) ? row.businessSteps.map((s) => s.name || s).join('; ') : '') ||
    '';

  return stampProposalItem(
    {
      logicalId: row.goalId || row.ruleId || row.processId || row.ucId || row.entityId || row.ifId || row.id || `${prefix}-${index + 1}`,
      title: String(title).slice(0, 240),
      description: typeof description === 'string' ? description.slice(0, 2000) : String(description || '').slice(0, 2000),
      actor: row.actor || undefined,
      relatedFrIds: related,
      sourceRefs,
      attributes: row.attributes,
      steps: row.mainFlow || row.businessSteps || row.steps,
      classification: row.category || row.direction || undefined,
      status: 'PROPOSED',
    },
    {
      engineId,
      section,
      originType: 'DERIVED',
      producer: PRODUCERS.SEMANTIC_RUNTIME,
      rule: 'RAW_SECTION_DERIVE',
      derivedFrom: related,
      index,
      defaultPrefix: prefix,
    }
  );
}

/**
 * Derive one LLM section from Raw pack.
 * @param {{
 *   engineId: string,
 *   pack: object,
 *   env?: NodeJS.ProcessEnv,
 *   invokeFn?: typeof invokeSemanticRuntime,
 * }} opts
 */
async function runRawSectionDerive(opts = {}) {
  const engineId = String(opts.engineId || '');
  const pack = opts.pack || {};
  const env = opts.env || process.env;
  const invokeFn = opts.invokeFn || invokeSemanticRuntime;
  const section = SECTION_BY_ENGINE[engineId];

  if (!isLlmDeriveSection(engineId) || !shouldRawDeriveSection(engineId, pack, env)) {
    return {
      status: TASK_POLICIES.SKIP,
      reason: 'RAW_DERIVE_NOT_APPLICABLE',
      items: [],
      llmCalls: 0,
      coverage: { status: 'NO_DATA', reason: 'RAW_DERIVE_NOT_APPLICABLE' },
      section,
    };
  }

  if (!isLlmEnabled(env)) {
    return {
      status: TASK_POLICIES.SKIP,
      reason: 'LLM_DISABLED',
      items: [],
      llmCalls: 0,
      coverage: { status: 'NO_DATA', reason: 'LLM_DISABLED' },
      section,
    };
  }

  const task = getSemanticTask(engineId);
  const input = buildRawDeriveInput(engineId, pack, {
    proposal: opts.proposal,
    g4Understanding: opts.g4Understanding,
    evidence: opts.evidence,
  });
  const prompt = buildDerivePrompt(engineId, input, task);

  const isBgV2 = engineId === 'bg' && input?.mode === 'raw_derive_v2';
  const maxTokens = isBgV2 ? resolveBgDeriveMaxTokens(env) : 4096;
  const timeoutMs = isBgV2 ? resolveBgDeriveTimeoutMs(env) : undefined;

  if (isBgV2) {
    const profile = profileBgDeriveInput(input, prompt);
    // eslint-disable-next-line no-console
    console.info('[bg_input_profile] %s', JSON.stringify(profile));
  }

  const startedAt = Date.now();
  const runtime = await invokeFn({ prompt, env, maxTokens, timeoutMs });
  const generationMs = Date.now() - startedAt;

  if (isBgV2) {
    // eslint-disable-next-line no-console
    console.info(
      '[bg_input_profile] generationMs=%d ok=%s reason=%s promptChars=%d maxTokens=%d timeoutMs=%d',
      generationMs,
      Boolean(runtime?.ok),
      runtime?.reason || null,
      prompt.length,
      maxTokens,
      timeoutMs
    );
  }

  if (!runtime?.ok || runtime.skipped) {
    const reason = runtime?.reason || 'DERIVE_EMPTY';
    // eslint-disable-next-line no-console
    console.warn(
      '[raw_derive] section=%s items=0 llmCalls=%d reason=%s error=%s',
      engineId,
      runtime?.skipped ? 0 : 1,
      reason,
      runtime?.error || null
    );
    return {
      status: TASK_POLICIES.SKIP,
      reason,
      items: [],
      llmCalls: runtime?.skipped ? 0 : 1,
      coverage: {
        status: 'NO_DATA',
        reason: reason === 'LLM_DISABLED' ? 'LLM_DISABLED' : 'DERIVE_EMPTY',
      },
      section,
    };
  }

  const rawItems = extractArray(engineId, runtime.data);
  const items = rawItems.map((row, i) => mapRowToItem(engineId, row, i));

  // eslint-disable-next-line no-console
  console.info(
    '[raw_derive] section=%s items=%d llmCalls=1 reason=%s',
    engineId,
    items.length,
    items.length ? 'ok' : 'DERIVE_EMPTY'
  );

  return {
    status: items.length ? TASK_POLICIES.RUN : TASK_POLICIES.SKIP,
    reason: items.length ? null : 'DERIVE_EMPTY',
    items,
    llmCalls: 1,
    coverage: {
      status: items.length ? 'AVAILABLE' : 'NO_DATA',
      reason: items.length ? null : 'DERIVE_EMPTY',
      sourceStats: {
        sourceRows:
          input.requirements?.length ||
          input.functionalRequirements?.length ||
          input.businessRequests?.length ||
          0,
        mappedRows: items.length,
        orphanRows: 0,
      },
    },
    section,
    semanticOutput: runtime.data,
  };
}

/**
 * Run active LLM derive sections in order (default UC → BG).
 * Critical sections (active set) throw RAW_DERIVE_FAILED on empty/fail → abort phase_what.
 */
async function runAllRawSectionDerives(opts = {}) {
  const pack = opts.pack || {};
  const env = opts.env || process.env;
  const order = opts.order || getActiveLlmDeriveSections(env);
  const byId = {};
  for (const engineId of order) {
    if (!shouldRawDeriveSection(engineId, pack, env)) continue;
    // Skip if sheet already has rows
    const existing =
      engineId === 'bg'
        ? pack.businessGoals || pack.goals
        : engineId === 'br'
          ? pack.businessRules
          : engineId === 'bpm'
            ? pack.businessProcesses || pack.processes
            : engineId === 'uc'
              ? pack.useCases
              : engineId === 'data'
                ? pack.entities || pack.domainEntities
                : engineId === 'interface'
                  ? pack.interfaces
                  : [];
    if (Array.isArray(existing) && existing.length) {
      byId[engineId] = {
        status: TASK_POLICIES.SKIP,
        reason: 'SHEET_PRESENT',
        items: [],
        llmCalls: 0,
        coverage: { status: 'AVAILABLE', reason: null },
      };
      continue;
    }
    byId[engineId] = await runRawSectionDerive({
      engineId,
      pack,
      env,
      invokeFn: opts.invokeFn,
      proposal: opts.proposal,
      g4Understanding: opts.g4Understanding,
      evidence: opts.evidence,
    });
    assertCriticalDeriveOk(engineId, byId[engineId], env);
  }
  return byId;
}

module.exports = {
  SECTION_BY_ENGINE,
  runRawSectionDerive,
  runAllRawSectionDerives,
  buildDerivePrompt,
  mapRowToItem,
  assertCriticalDeriveOk,
  resolveBgDeriveTimeoutMs,
  resolveBgDeriveMaxTokens,
};
