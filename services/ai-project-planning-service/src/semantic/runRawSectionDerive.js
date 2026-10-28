/**
 * LLM derive Analysis sections from Customer Raw pack slices (RULE-RAW-DERIVE-01…05).
 * Same pipeline for every unlocked sec; input/output shaped per section (BG as reference).
 */

const { getSemanticTask, TASK_POLICIES } = require('./semanticTaskRegistry');
const { invokeSemanticRuntime } = require('./semanticRuntime');
const { stampProposalItem, PRODUCERS } = require('./stampProvenance');
const { buildRawDeriveInput, profileBgDeriveInput } = require('./buildRawDeriveInput');
const { toDerivePromptPayload } = require('./buildSemanticDeriveContext');
const {
  shouldRawDeriveSection,
  isLlmDeriveSection,
  getActiveLlmDeriveSections,
  isCriticalRawDeriveSection,
  isCustomerRawIntakePack,
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

/** Map provider errors to Gate1 coverage reasons (quota vs generic empty). */
function coverageReasonFromLlmFailure(reason) {
  const text = String(reason || '').toLowerCase();
  if (!text) return 'DERIVE_EMPTY';
  if (text === 'llm_disabled') return 'LLM_DISABLED';
  if (
    text.includes('403') ||
    text.includes('quota') ||
    text.includes('free tier') ||
    text.includes('rate_limit') ||
    text.includes('429')
  ) {
    return 'LLM_QUOTA_EXHAUSTED';
  }
  if (text.startsWith('openai_') || text.includes('timeout') || text.includes('econn')) {
    return 'LLM_ERROR';
  }
  return 'DERIVE_EMPTY';
}

/**
 * Fail-soft BG from BRQ when LLM fails (quota/3B) — same rows as PHASE1_BG_BRQ_SEED path.
 */
function tryBgBrqSeedFallback(pack, opts = {}) {
  const { buildDeterministicBgGoalsFromBrq } = require('./buildBgDeriveInput');
  const seeded = buildDeterministicBgGoalsFromBrq(pack, { snapshot: opts.snapshot });
  if (!seeded.items.length) return null;
  const items = seeded.items.map((row, i) => mapRowToItem('bg', row, i));
  return {
    items,
    reason: 'BRQ_SEED_FALLBACK',
    sourceRows: seeded.brqWithGoal,
  };
}

/**
 * Fail-soft BR from explicit FR/BRQ rule fields only (no invented policy text).
 */
function tryBrFieldSeedFallback(pack, input) {
  const rows = [];
  const seen = new Set();
  const pushRule = (statement, sourceId, sheet) => {
    const text = String(statement || '').trim();
    if (text.length < 8) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({
      id: `BR-${rows.length + 1}`,
      statement: text.slice(0, 400),
      title: text.slice(0, 120),
      sourceRefs: sourceId ? [{ externalId: sourceId, sheet: sheet || '03_Requirement' }] : [],
      relatedFrIds: sourceId ? [sourceId] : [],
    });
  };

  const frs = Array.isArray(input?.frFull)
    ? input.frFull
    : Array.isArray(pack?.functionalRequirements)
      ? pack.functionalRequirements
      : [];
  for (const fr of frs) {
    const frId = String(fr?.id || fr?.externalId || fr?.logicalId || '').trim();
    const fields = [
      fr?.businessRule,
      fr?.businessRules,
      fr?.constraint,
      fr?.constraints,
      fr?.rule,
      fr?.rules,
    ];
    for (const field of fields) {
      if (Array.isArray(field)) {
        for (const part of field) {
          pushRule(
            typeof part === 'string' ? part : part?.statement || part?.text || part?.description,
            frId
          );
        }
      } else if (field) {
        pushRule(field, frId);
      }
    }
  }

  const brqs = Array.isArray(input?.brqFull)
    ? input.brqFull
    : Array.isArray(pack?.aiAnalysis?.customerRawRows?.businessRequests)
      ? pack.aiAnalysis.customerRawRows.businessRequests
      : [];
  for (const brq of brqs) {
    const id = String(brq?.id || brq?.requestId || brq?.externalId || '').trim();
    pushRule(brq?.businessRule || brq?.rule || brq?.constraint, id, '01_BusinessRequest');
  }

  if (!rows.length) return null;
  const items = rows.slice(0, 10).map((row, i) => mapRowToItem('br', row, i));
  return {
    items,
    reason: 'FR_FIELD_SEED_FALLBACK',
    sourceRows: rows.length,
  };
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
  const payload = toDerivePromptPayload(input);
  // V2: compact instruction + deduped input (no frSlim alias / schema dump).
  if (isV2) {
    return [
      `SemanticTask=${engineId} mode=raw_derive_v2 section=${section}`,
      'Derive CANDIDATES from Input: frFull (source requirement text) + annotations (llm_proposal, not source facts) + BRQ/overview + ambiguities/evidence + retrievedContext when present.',
      'retrievedContext is snapshot evidence (keyword and/or vector). Use it as support. Do not invent ids outside Input.',
      'Do not invent FR ids not present in Input. Treat annotations as proposals until a person accepts them.',
      'Every item MUST include sourceRefs and/or relatedFrIds when possible.',
      input?.languageInstruction || '',
      `Put the array under key "${resultKey}". JSON object only — no markdown.`,
      task?.promptPolicy || '',
      input?.deriveInstruction || '',
      `Input: ${JSON.stringify(payload)}`,
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
    `Input: ${JSON.stringify(payload)}`,
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
    row.goalId ||
      row.ruleId ||
      row.processId ||
      row.ucId ||
      row.entityId ||
      row.nfrId ||
      row.scopeId ||
      row.actorId ||
      row.ifId ||
      row.id ||
      ''
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
  if (engineId === 'nfr') return pack.nonFunctionalRequirements || pack.nfrs;
  if (engineId === 'scope') return pack.scope || pack.scopeItems;
  return [];
}

function sourceRowCount(input) {
  return (
    input?.requirements?.length ||
    input?.frFull?.length ||
    input?.frSlim?.length ||
    input?.integrationSignals?.length ||
    input?.functionalRequirements?.length ||
    input?.businessRequests?.length ||
    input?.brqFull?.length ||
    input?.brqSlim?.length ||
    input?.modules?.length ||
    0
  );
}

/**
 * Fact step — applicability, grounded seed, prompt bundle.
 * Does not call the model. LLM sees only the returned bundle.
 * @returns {{ mode: 'result', result: object } | { mode: 'llm', bundle: object }}
 */
function prepareSectionDerive(opts = {}) {
  const engineId = String(opts.engineId || '');
  const pack = opts.pack || {};
  const env = opts.env || process.env;
  const section = SECTION_BY_ENGINE[engineId];

  if (!isLlmDeriveSection(engineId) || !shouldRawDeriveSection(engineId, pack, env)) {
    return {
      mode: 'result',
      result: {
        status: TASK_POLICIES.SKIP,
        reason: 'RAW_DERIVE_NOT_APPLICABLE',
        items: [],
        llmCalls: 0,
        coverage: { status: 'NO_DATA', reason: 'RAW_DERIVE_NOT_APPLICABLE' },
        section,
      },
    };
  }

  if (!isLlmEnabled(env)) {
    return {
      mode: 'result',
      result: {
        status: TASK_POLICIES.SKIP,
        reason: 'LLM_DISABLED',
        items: [],
        llmCalls: 0,
        coverage: { status: 'NO_DATA', reason: 'LLM_DISABLED' },
        section,
      },
    };
  }

  // Same skip as runAllRawSectionDerives — Pattern B subgraph must not re-LLM when section exists.
  const proposalItems = section ? opts.proposal?.generated?.[section]?.items : null;
  if (Array.isArray(proposalItems) && proposalItems.length) {
    return {
      mode: 'result',
      result: {
        status: TASK_POLICIES.SKIP,
        reason: 'SHEET_PRESENT',
        items: [],
        llmCalls: 0,
        coverage: { status: 'AVAILABLE', reason: null },
        section,
      },
    };
  }
  // Customer Raw: pack.* sheets after materialize are leftover AI rows — do not skip LLM on pack.
  const customerRaw = isCustomerRawIntakePack(pack);
  const existing = existingSheetRows(engineId, pack);
  if (!customerRaw && Array.isArray(existing) && existing.length) {
    return {
      mode: 'result',
      result: {
        status: TASK_POLICIES.SKIP,
        reason: 'SHEET_PRESENT',
        items: [],
        llmCalls: 0,
        coverage: { status: 'AVAILABLE', reason: null },
        section,
      },
    };
  }

  /**
   * PERF: grounded-first for secs with strong FR signals (not invent).
   * Default ON for data/uc/bpm — keeps LLM for bg+br. Disable via PHASE1_<SEC>_GROUNDED_FIRST=0.
   */
  const groundedCfg = {
    data: { envKey: 'PHASE1_DATA_GROUNDED_FIRST', min: 3 },
    uc: { envKey: 'PHASE1_UC_GROUNDED_FIRST', min: 2 },
    bpm: { envKey: 'PHASE1_BPM_GROUNDED_FIRST', min: 2 },
  }[engineId];
  if (groundedCfg) {
    const flag = String(env[groundedCfg.envKey] ?? '1').trim().toLowerCase();
    const groundedOn = flag !== '0' && flag !== 'false' && flag !== 'off';
    if (groundedOn) {
      const inputPreview = buildRawDeriveInput(engineId, pack, {
        proposal: opts.proposal,
        frUnderstanding: opts.frUnderstanding,
        evidence: opts.evidence,
        snapshot: opts.snapshot,
        contextPackage: opts.contextPackage || null,
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
          mode: 'result',
          result: {
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
          },
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
        mode: 'result',
        result: {
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
        },
      };
    }
  }

  const task = getSemanticTask(engineId);
  const input = buildRawDeriveInput(engineId, pack, {
    proposal: opts.proposal,
    frUnderstanding: opts.frUnderstanding,
    evidence: opts.evidence,
    snapshot: opts.snapshot,
    locale: opts.locale || pack?.aiAnalysis?.deriveLocale || null,
    contextPackage: opts.contextPackage || null,
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

  return {
    mode: 'llm',
    bundle: {
      engineId,
      pack,
      env,
      section,
      input,
      prompt,
      maxTokens,
      timeoutMs,
      numCtx,
      snapshot: opts.snapshot || null,
    },
  };
}

function mergeProposedParts(engineId, parts) {
  const key = RESULT_KEY_BY_ENGINE[engineId] || 'items';
  const items = [];
  let generationMs = 0;
  let evalCount = 0;
  let ok = false;
  for (const part of parts) {
    generationMs += part.generationMs || 0;
    evalCount += Number(part.runtime?.usage?.evalCount) || 0;
    if (!part.runtime?.ok) continue;
    ok = true;
    items.push(...extractArray(engineId, part.runtime.data));
  }
  return {
    runtime: {
      ok,
      data: { [key]: items },
      reason: ok ? null : 'DERIVE_EMPTY',
      usage: { evalCount },
    },
    generationMs,
    llmCalls: parts.length,
  };
}

/**
 * Propose step — JSON generation only. No ids, filters, or counts.
 * @param {object} bundle
 * @param {Function} [invokeFn]
 */
async function proposeSectionJson(bundle, invokeFn) {
  const units = bundle?.input?.workUnits;
  if (Array.isArray(units) && units.length > 1 && bundle.input?.contextStatus === 'needs_split') {
    const task = getSemanticTask(bundle.engineId);
    const parts = [];
    for (const unit of units) {
      const input = {
        ...bundle.input,
        frFull: unit.frRows || [],
        workUnits: undefined,
        contextStatus: 'ready',
      };
      const prompt = buildDerivePrompt(bundle.engineId, input, task);
      parts.push(await proposeOne({ ...bundle, input, prompt }, invokeFn));
    }
    return mergeProposedParts(bundle.engineId, parts);
  }
  return proposeOne(bundle, invokeFn);
}

async function proposeOne(bundle, invokeFn) {
  const invoke = invokeFn || invokeSemanticRuntime;
  const startedAt = Date.now();
  const runtime = await invoke({
    prompt: bundle.prompt,
    env: bundle.env,
    maxTokens: bundle.maxTokens,
    timeoutMs: bundle.timeoutMs,
    numCtx: bundle.numCtx,
  });
  const generationMs = Date.now() - startedAt;
  // eslint-disable-next-line no-console
  console.info(
    '[raw_derive_timing] section=%s generationMs=%d ok=%s reason=%s promptChars=%d maxTokens=%d evalCount=%d',
    bundle.engineId,
    generationMs,
    Boolean(runtime?.ok),
    runtime?.reason || null,
    bundle.prompt.length,
    bundle.maxTokens,
    Number(runtime?.usage?.evalCount) || 0
  );
  return { runtime, generationMs };
}

/**
 * Accept step — ids, quality filter, grounded fallback. No model call.
 * @param {object} bundle
 * @param {{ runtime: object, generationMs: number }} proposed
 */
function acceptSectionDerive(bundle, proposed) {
  const engineId = bundle.engineId;
  const pack = bundle.pack;
  const section = bundle.section;
  const input = bundle.input;
  const prompt = bundle.prompt;
  const maxTokens = bundle.maxTokens;
  const runtime = proposed?.runtime;
  const generationMs = proposed?.generationMs || 0;

  // eslint-disable-next-line no-console
  console.info(
    '[raw_derive_accept] section=%s generationMs=%d ok=%s',
    engineId,
    generationMs,
    Boolean(runtime?.ok)
  );

  if (!runtime?.ok || runtime.skipped) {
    const reason = runtime?.reason || 'DERIVE_EMPTY';
    // data: grounded seed when LLM fails — keeps section usable on 3B drift/timeout
    if (engineId === 'data' && reason !== 'LLM_DISABLED') {
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
          llmCalls: proposed?.llmCalls || (runtime?.skipped ? 0 : 1),
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
    // bg/br: fail-soft when DashScope quota/error — UC/BPM/Data already use GROUNDED_FIRST
    if (reason !== 'LLM_DISABLED') {
      let soft = null;
      if (engineId === 'bg') soft = tryBgBrqSeedFallback(pack, { snapshot: bundle.snapshot });
      else if (engineId === 'br') soft = tryBrFieldSeedFallback(pack, input);
      if (soft?.items?.length) {
        // eslint-disable-next-line no-console
        console.warn(
          '[raw_derive] section=%s items=%d llmCalls=%d reason=%s fallback=%s',
          engineId,
          soft.items.length,
          runtime?.skipped ? 0 : 1,
          reason,
          soft.reason
        );
        return {
          status: TASK_POLICIES.RUN,
          reason: soft.reason,
          items: soft.items,
          llmCalls: proposed?.llmCalls || (runtime?.skipped ? 0 : 1),
          generationMs,
          coverage: {
            status: 'AVAILABLE',
            reason: soft.reason,
            sourceStats: {
              sourceRows: soft.sourceRows || sourceRowCount(input),
              mappedRows: soft.items.length,
              orphanRows: 0,
            },
          },
          section,
        };
      }
    }
    const coverageReason = coverageReasonFromLlmFailure(reason);
    // eslint-disable-next-line no-console
    console.warn(
      '[raw_derive] section=%s items=0 llmCalls=%d reason=%s error=%s coverage=%s',
      engineId,
      runtime?.skipped ? 0 : 1,
      reason,
      runtime?.error || null,
      coverageReason
    );
    return {
      status: TASK_POLICIES.SKIP,
      reason,
      items: [],
      llmCalls: runtime?.skipped ? 0 : 1,
      generationMs,
      coverage: {
        status: 'NO_DATA',
        reason: coverageReason,
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
    llmCalls: proposed?.llmCalls || 1,
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
 * One section: LangGraph fact → propose (JSON only) → accept (ids/quality).
 */
async function runRawSectionDerive(opts = {}) {
  const { runWhatSectionGraph } = require('../whatSecs/sectionGraph');
  return runWhatSectionGraph(opts);
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
  // Customer Raw has no Analysis sheets. Pack.businessGoals|… after materialize are
  // leftover AI/heuristic rows — must NOT skip LLM (otherwise only empty secs like data re-derive).
  const customerRaw = isCustomerRawIntakePack(pack);
  for (const engineId of order) {
    if (!shouldRawDeriveSection(engineId, pack, env)) continue;
    const sectionKey = SECTION_BY_ENGINE[engineId];
    const proposalItems = sectionKey
      ? opts.proposal?.generated?.[sectionKey]?.items
      : null;
    if (Array.isArray(proposalItems) && proposalItems.length) {
      byId[engineId] = {
        status: TASK_POLICIES.SKIP,
        reason: 'SHEET_PRESENT',
        items: [],
        llmCalls: 0,
        coverage: { status: 'AVAILABLE', reason: null },
        section: sectionKey,
      };
      continue;
    }
    const existing = existingSheetRows(engineId, pack);
    if (!customerRaw && Array.isArray(existing) && existing.length) {
      byId[engineId] = {
        status: TASK_POLICIES.SKIP,
        reason: 'SHEET_PRESENT',
        items: [],
        llmCalls: 0,
        coverage: { status: 'AVAILABLE', reason: null },
        section: sectionKey,
      };
      continue;
    }
    byId[engineId] = await runRawSectionDerive({
      engineId,
      pack,
      env,
      invokeFn: opts.invokeFn,
      proposal: opts.proposal,
      frUnderstanding: opts.frUnderstanding,
      evidence: opts.evidence,
      snapshot: opts.snapshot,
      locale: opts.locale || pack?.aiAnalysis?.deriveLocale || null,
      contextPackage: opts.contextPackage || null,
    });
    assertCriticalDeriveOk(engineId, byId[engineId], env);
  }
  return byId;
}

module.exports = {
  SECTION_BY_ENGINE,
  prepareSectionDerive,
  proposeSectionJson,
  acceptSectionDerive,
  runRawSectionDerive,
  runAllRawSectionDerives,
  buildDerivePrompt,
  mapRowToItem,
  resolveDeriveLogicalId,
  extractArray,
  existingSheetRows,
  assertCriticalDeriveOk,
  resolveBgDeriveTimeoutMs,
  resolveBgDeriveMaxTokens,
  isBgBrqSeedEnabled,
  coverageReasonFromLlmFailure,
  tryBgBrqSeedFallback,
  tryBrFieldSeedFallback,
};
