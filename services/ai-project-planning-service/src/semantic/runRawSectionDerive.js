/**
 * LLM derive Analysis sections from Customer Raw pack slices (RULE-RAW-DERIVE-01…05).
 * Same pipeline for every unlocked sec; input/output shaped per section (BG as reference).
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
const {
  SECTION_BY_ENGINE,
  RESULT_KEY_BY_ENGINE,
  RESULT_ALIASES,
  PREFIX_BY_ENGINE,
  SECTION_LABEL,
  resolveSectionMaxTokens,
  resolveSectionTimeoutMs,
  resolveDeriveNumCtx,
} = require('./sectionDeriveRegistry');
const { applySectionDeriveQuality } = require('./sectionDeriveQuality');

/** @deprecated use resolveSectionTimeoutMs('bg') — kept for tests */
function resolveBgDeriveTimeoutMs(env = process.env) {
  return resolveSectionTimeoutMs('bg', env);
}

/** @deprecated use resolveSectionMaxTokens('bg') — kept for tests */
function resolveBgDeriveMaxTokens(env = process.env) {
  return resolveSectionMaxTokens('bg', env);
}

/**
 * Opt-in only: deterministic BG from BRQ (not the main WHAT path).
 * Default OFF — real LLM derive. Set PHASE1_BG_BRQ_SEED=1 to enable.
 */
function isBgBrqSeedEnabled(env = process.env) {
  if (String(env.PHASE1_BG_FORCE_LLM || '').trim() === '1') return false;
  const raw = String(env.PHASE1_BG_BRQ_SEED ?? '0').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

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

function buildDerivePrompt(engineId, input, task) {
  const resultKey = RESULT_KEY_BY_ENGINE[engineId] || 'items';
  const section = SECTION_BY_ENGINE[engineId] || engineId;
  const isV2 = input?.mode === 'raw_derive_v2';
  // V2: compact instruction + input only (no full schema dump — was wasting tokens/time).
  if (isV2) {
    return [
      `SemanticTask=${engineId} mode=raw_derive_v2 section=${section}`,
      'Derive CANDIDATES only from the Input. Do not invent FR ids not present in Input.',
      'Every item MUST include sourceRefs and/or relatedFrIds when possible.',
      `Put the array under key "${resultKey}". JSON object only — no markdown.`,
      task?.promptPolicy || '',
      input?.deriveInstruction || '',
      `Input: ${JSON.stringify(input)}`,
    ].join('\n');
  }
  const schemaHint = task?.semanticSchema ? JSON.stringify(task.semanticSchema) : '{}';
  return [
    `SemanticTask=${engineId} mode=raw_derive section=${section}`,
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
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const key = RESULT_KEY_BY_ENGINE[engineId];
  if (key && Array.isArray(data[key])) return data[key];
  if (Array.isArray(data.items)) return data.items;
  const aliases = RESULT_ALIASES[engineId] || [];
  for (const alias of aliases) {
    if (Array.isArray(data[alias])) return data[alias];
  }
  return [];
}

function resolveDeriveLogicalId(engineId, row, index) {
  const prefix = PREFIX_BY_ENGINE[engineId] || 'ITEM';
  const raw = String(
    row.goalId || row.ruleId || row.processId || row.ucId || row.entityId || row.ifId || row.id || ''
  ).trim();
  if (!raw) return `${prefix}-${index + 1}`;
  // BG may keep BRQ-* lineage; other secs must not use CR/FR/NFR as their own id.
  if (engineId === 'bg') return raw;
  if (/^(CR|FR|NFR)-/i.test(raw)) return `${prefix}-${index + 1}`;
  return raw;
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

  let description =
    row.description ||
    row.ruleAction ||
    row.rationale ||
    row.mainFlow ||
    (Array.isArray(row.businessSteps) ? row.businessSteps.map((s) => s.name || s).join('; ') : '') ||
    (Array.isArray(row.steps) ? row.steps.map((s) => (typeof s === 'string' ? s : s.name || '')).join('; ') : '') ||
    '';
  if (!description && Array.isArray(row.attributes) && row.attributes.length) {
    description = row.attributes.map(String).join(', ');
  }

  return stampProposalItem(
    {
      logicalId: resolveDeriveLogicalId(engineId, row, index),
      title: String(title).slice(0, 240),
      description: typeof description === 'string' ? description.slice(0, 2000) : String(description || '').slice(0, 2000),
      actor: row.actor || row.primaryActor || undefined,
      relatedFrIds: related,
      sourceRefs,
      attributes: row.attributes,
      steps: row.mainFlow || row.businessSteps || row.steps,
      classification: row.category || row.direction || row.protocol || undefined,
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

function existingSheetRows(engineId, pack) {
  if (engineId === 'bg') return pack.businessGoals || pack.goals;
  if (engineId === 'br') return pack.businessRules;
  if (engineId === 'bpm') return pack.businessProcesses || pack.processes;
  if (engineId === 'uc') return pack.useCases;
  if (engineId === 'data') return pack.entities || pack.domainEntities;
  if (engineId === 'interface') return pack.interfaces;
  return [];
}

function sourceRowCount(input) {
  return (
    input?.requirements?.length ||
    input?.frSlim?.length ||
    input?.integrationSignals?.length ||
    input?.functionalRequirements?.length ||
    input?.businessRequests?.length ||
    input?.brqSlim?.length ||
    input?.modules?.length ||
    0
  );
}

/**
 * Derive one LLM section from Raw pack.
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

  /**
   * PERF: grounded-first for secs with strong FR signals (not invent).
   * Default ON for data/interface/uc/bpm — keeps LLM for bg+br. Disable via PHASE1_<SEC>_GROUNDED_FIRST=0.
   */
  const groundedCfg = {
    data: { envKey: 'PHASE1_DATA_GROUNDED_FIRST', min: 3 },
    interface: { envKey: 'PHASE1_INTERFACE_GROUNDED_FIRST', min: 2 },
    uc: { envKey: 'PHASE1_UC_GROUNDED_FIRST', min: 2 },
    bpm: { envKey: 'PHASE1_BPM_GROUNDED_FIRST', min: 2 },
  }[engineId];
  if (groundedCfg) {
    const flag = String(env[groundedCfg.envKey] ?? '1').trim().toLowerCase();
    const groundedOn = flag !== '0' && flag !== 'false' && flag !== 'off';
    if (groundedOn) {
      const inputPreview = buildRawDeriveInput(engineId, pack, {
        proposal: opts.proposal,
        g4Understanding: opts.g4Understanding,
        evidence: opts.evidence,
        snapshot: opts.snapshot,
      });
      const seeded = applySectionDeriveQuality(engineId, [], pack, inputPreview);
      if (seeded.rows.length >= groundedCfg.min) {
        const items = seeded.rows.map((row, i) => mapRowToItem(engineId, row, i));
        // eslint-disable-next-line no-console
        console.info(
          '[raw_derive] section=%s items=%d llmCalls=0 reason=GROUNDED_FIRST',
          engineId,
          items.length
        );
        return {
          status: TASK_POLICIES.RUN,
          reason: 'GROUNDED_FIRST',
          items,
          llmCalls: 0,
          generationMs: 0,
          evalCount: 0,
          promptChars: 0,
          maxTokens: 0,
          quality: { ...seeded.quality, seeded: true, reason: 'GROUNDED_FIRST' },
          coverage: {
            status: 'AVAILABLE',
            reason: 'GROUNDED_FIRST',
            sourceStats: {
              sourceRows: sourceRowCount(inputPreview),
              mappedRows: items.length,
              orphanRows: 0,
            },
          },
          section,
        };
      }
    }
  }

  // Opt-in shortcut only (PHASE1_BG_BRQ_SEED=1). Default path is real LLM.
  if (engineId === 'bg' && isBgBrqSeedEnabled(env)) {
    const { buildDeterministicBgGoalsFromBrq } = require('./buildBgDeriveInput');
    const seeded = buildDeterministicBgGoalsFromBrq(pack, { snapshot: opts.snapshot });
    const minGoals = Number(env.PHASE1_BG_BRQ_SEED_MIN);
    const need = Number.isFinite(minGoals) && minGoals >= 1 ? Math.floor(minGoals) : 2;
    if (seeded.items.length >= need) {
      const items = seeded.items.map((row, i) => mapRowToItem(engineId, row, i));
      // eslint-disable-next-line no-console
      console.info(
        '[raw_derive] section=bg items=%d llmCalls=0 reason=BRQ_SEED brqWithGoal=%d',
        items.length,
        seeded.brqWithGoal
      );
      return {
        status: TASK_POLICIES.RUN,
        reason: 'BRQ_SEED',
        items,
        llmCalls: 0,
        generationMs: 0,
        evalCount: 0,
        promptChars: 0,
        maxTokens: 0,
        coverage: {
          status: 'AVAILABLE',
          reason: 'BRQ_SEED',
          sourceStats: {
            sourceRows: seeded.brqWithGoal,
            mappedRows: items.length,
            orphanRows: 0,
          },
        },
        section,
      };
    }
  }

  const task = getSemanticTask(engineId);
  const input = buildRawDeriveInput(engineId, pack, {
    proposal: opts.proposal,
    g4Understanding: opts.g4Understanding,
    evidence: opts.evidence,
    snapshot: opts.snapshot,
  });
  const prompt = buildDerivePrompt(engineId, input, task);
  const isV2 = input?.mode === 'raw_derive_v2';
  const maxTokens = resolveSectionMaxTokens(engineId, env);
  const timeoutMs = resolveSectionTimeoutMs(engineId, env);
  const numCtx = resolveDeriveNumCtx(env);

  if (isV2 && engineId === 'bg') {
    const profile = profileBgDeriveInput(input, prompt);
    // eslint-disable-next-line no-console
    console.info('[bg_input_profile] %s', JSON.stringify(profile));
  } else if (isV2) {
    // eslint-disable-next-line no-console
    console.info(
      '[sec_input_profile] section=%s promptChars=%d maxTokens=%d numCtx=%d timeoutMs=%d sourceRows=%d',
      engineId,
      prompt.length,
      maxTokens,
      numCtx,
      timeoutMs,
      sourceRowCount(input)
    );
  }

  const startedAt = Date.now();
  const runtime = await invokeFn({ prompt, env, maxTokens, timeoutMs, numCtx });
  const generationMs = Date.now() - startedAt;

  // eslint-disable-next-line no-console
  console.info(
    '[raw_derive_timing] section=%s generationMs=%d ok=%s reason=%s promptChars=%d maxTokens=%d evalCount=%d',
    engineId,
    generationMs,
    Boolean(runtime?.ok),
    runtime?.reason || null,
    prompt.length,
    maxTokens,
    Number(runtime?.usage?.evalCount) || 0
  );

  if (!runtime?.ok || runtime.skipped) {
    const reason = runtime?.reason || 'DERIVE_EMPTY';
    // data/interface: grounded seed when LLM fails — keeps section usable on 3B drift/timeout
    if ((engineId === 'data' || engineId === 'interface') && reason !== 'LLM_DISABLED') {
      const qualityPass = applySectionDeriveQuality(engineId, [], pack, input);
      if (qualityPass.rows.length) {
        const items = qualityPass.rows.map((row, i) => mapRowToItem(engineId, row, i));
        // eslint-disable-next-line no-console
        console.warn(
          '[raw_derive] section=%s items=%d llmCalls=%d reason=%s fallback=%s',
          engineId,
          items.length,
          runtime?.skipped ? 0 : 1,
          reason,
          qualityPass.quality?.reason
        );
        return {
          status: TASK_POLICIES.RUN,
          reason: qualityPass.quality?.reason || reason,
          items,
          llmCalls: runtime?.skipped ? 0 : 1,
          generationMs,
          quality: qualityPass.quality,
          coverage: {
            status: 'AVAILABLE',
            reason: qualityPass.quality?.reason || reason,
            sourceStats: {
              sourceRows: sourceRowCount(input),
              mappedRows: items.length,
              orphanRows: 0,
            },
          },
          section,
        };
      }
    }
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
      generationMs,
      coverage: {
        status: 'NO_DATA',
        reason: reason === 'LLM_DISABLED' ? 'LLM_DISABLED' : 'DERIVE_EMPTY',
      },
      section,
    };
  }

  const rawItems = extractArray(engineId, runtime.data);
  const qualityPass = applySectionDeriveQuality(engineId, rawItems, pack, input);
  const items = qualityPass.rows.map((row, i) => mapRowToItem(engineId, row, i));
  const qualityReason = qualityPass.quality?.reason || null;
  const okReason = qualityReason || (items.length ? 'ok' : 'DERIVE_EMPTY');

  // eslint-disable-next-line no-console
  console.info(
    '[raw_derive] section=%s items=%d llmCalls=1 reason=%s generationMs=%d filtered=%d seeded=%s',
    engineId,
    items.length,
    okReason,
    generationMs,
    Number(qualityPass.quality?.filtered) || 0,
    Boolean(qualityPass.quality?.seeded)
  );

  return {
    status: items.length ? TASK_POLICIES.RUN : TASK_POLICIES.SKIP,
    reason: items.length ? qualityReason : 'DERIVE_EMPTY',
    items,
    llmCalls: 1,
    generationMs,
    evalCount: Number(runtime?.usage?.evalCount) || 0,
    promptEvalCount: Number(runtime?.usage?.promptEvalCount) || 0,
    promptChars: prompt.length,
    maxTokens,
    quality: qualityPass.quality,
    coverage: {
      status: items.length ? 'AVAILABLE' : 'NO_DATA',
      reason: items.length ? qualityReason : 'DERIVE_EMPTY',
      sourceStats: {
        sourceRows: sourceRowCount(input),
        mappedRows: items.length,
        orphanRows: 0,
      },
    },
    section,
    semanticOutput: runtime.data,
  };
}

/**
 * Run active LLM derive sections in unlock order from PHASE1_RAW_DERIVE_SECTIONS.
 * Critical sections (active set) throw RAW_DERIVE_FAILED on empty/fail → abort phase_what.
 */
async function runAllRawSectionDerives(opts = {}) {
  const pack = opts.pack || {};
  const env = opts.env || process.env;
  const order = opts.order || getActiveLlmDeriveSections(env);
  const byId = {};
  for (const engineId of order) {
    if (!shouldRawDeriveSection(engineId, pack, env)) continue;
    const existing = existingSheetRows(engineId, pack);
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
      snapshot: opts.snapshot,
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
  resolveDeriveLogicalId,
  extractArray,
  assertCriticalDeriveOk,
  resolveBgDeriveTimeoutMs,
  resolveBgDeriveMaxTokens,
  isBgBrqSeedEnabled,
};
