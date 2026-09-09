/**
 * Compact V2 orchestrator — heuristic-first, ≤2 serial LLM calls per job, no parallel.
 */

const {
  generateJson,
  ollamaModel,
  isAiPlanningLlmEnabled,
} = require('./ollamaClient');
const {
  PROMPT_VERSION,
  isCompactV2Enabled,
  buildPackContentHash,
  selectHotFrSlices,
  buildQualityFlags,
  shouldRunGapLlm,
  compactGenerateOpts,
  compactJobWallMs,
} = require('./aiAnalysisCompactPolicy');
const {
  frRowsTsv,
  capsRowsCompact,
  flagRowsCompact,
  buildPassADataCapabilityPrompt,
  buildPassBGapPrompt,
  buildPassCWbsPrompt,
  buildPassDArchRiskPrompt,
  buildJsonRepairPrompt,
} = require('./aiAnalysisCompactPrompts');
const { getLlmCache, setLlmCache } = require('./aiAnalysisLlmCache');
const {
  buildFrIdSet,
  buildRequirementFrSlices,
  buildRequirementFrSlicesForAnalysis,
  expandFrIdSetWithSlices,
  buildProjectContextSlice,
} = require('./aiAnalysisFrSlice');
const {
  buildDataHintSlice,
  buildHeuristicDataEntities,
  buildHeuristicDataFlows,
  validateAndNormalizeDataPayload,
  dropOrphanRefs,
  dedupeDataEntities,
  enrichEntitiesCrudFromFrSlices,
} = require('./aiAnalysisData');
const {
  buildGapInputHints,
  buildHeuristicGapItems,
  validateAndNormalizeGapPayload,
  buildGapPolicyMeta,
  dedupeGapItems,
} = require('./aiAnalysisGap');
const {
  buildHeuristicCapabilityItems,
  validateAndNormalizeCapabilityPayload,
  dedupeCapabilityItems,
} = require('./aiAnalysisCapability');
const {
  buildHeuristicWbsTasks,
  validateAndNormalizeWbsPayload,
} = require('./aiAnalysisWbs');
const { runDependencyAnalysis } = require('./aiAnalysisDependency');
const {
  buildHeuristicArchitectureItems,
  buildHeuristicChains,
  validateAndNormalizeArchitecturePayload,
  buildArchitectureInputSlices,
  selectTopNArchitectureItems,
} = require('./aiAnalysisArchitectureImpact');
const {
  buildHeuristicRiskItems,
  validateAndNormalizeRiskPayload,
  buildRiskInputSlices,
  selectTopRisks,
  buildRiskPolicyMeta,
} = require('./aiAnalysisRisk');

/**
 * One generate + optional single JSON repair. Never parallel.
 * @param {string} prompt
 * @param {{ generateJsonFn?: Function, remainingCalls?: number, allowRepair?: boolean }} [deps]
 */
async function generateJsonOnce(prompt, deps = {}) {
  const gen = deps.generateJsonFn || generateJson;
  const opts = compactGenerateOpts();
  const remaining =
    deps.remainingCalls != null && Number.isFinite(Number(deps.remainingCalls))
      ? Math.max(0, Math.floor(Number(deps.remainingCalls)))
      : 2;
  if (remaining < 1) {
    return {
      ok: false,
      model: ollamaModel(),
      data: null,
      error: 'llm_budget',
      skipped: true,
      llmCalls: 0,
      repaired: false,
    };
  }

  let result = await gen({ prompt, ...opts });
  let llmCalls = result.skipped ? 0 : 1;
  if (result.ok && result.data != null) {
    return { ...result, llmCalls, repaired: false };
  }
  if (result.skipped) {
    return { ...result, llmCalls: 0, repaired: false };
  }

  const canRepair = deps.allowRepair !== false && remaining - llmCalls >= 1;
  if (!canRepair) {
    return { ...result, llmCalls, repaired: false };
  }

  const repairPrompt = buildJsonRepairPrompt(
    typeof result.data === 'string' ? result.data : JSON.stringify(result.data || result.error || '')
  );
  const repair = await gen({
    prompt: `${prompt}\n\nPrevious output invalid. ${repairPrompt}`,
    ...opts,
    numPredict: Math.min(opts.numPredict, 256),
  });
  llmCalls += repair.skipped ? 0 : 1;
  return { ...repair, llmCalls, repaired: true };
}

function enrichCapabilityRaw(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  return {
    ...raw,
    module: raw.module || 'General',
    complexity: raw.complexity || 'medium',
    confidence: raw.confidence != null ? raw.confidence : 0.55,
    requiredSkills:
      Array.isArray(raw.requiredSkills) && raw.requiredSkills.length
        ? raw.requiredSkills
        : [{ name: 'general' }],
    sourceFrIds: raw.sourceFrIds || raw.relatedFrIds || [],
  };
}

function mapPassAToDataPayload(data) {
  if (!data || typeof data !== 'object') return { entities: [], dataFlows: [] };
  const entities = Array.isArray(data.entities) ? data.entities : [];
  return { entities, dataFlows: Array.isArray(data.dataFlows) ? data.dataFlows : [] };
}

function mapPassAToCapPayload(data) {
  const caps = Array.isArray(data?.caps)
    ? data.caps
    : Array.isArray(data?.items)
      ? data.items
      : [];
  return { items: caps.map(enrichCapabilityRaw) };
}

/**
 * @param {object} pack
 * @param {object} container
 * @param {{ force?: boolean, generateJsonFn?: Function }} [opts]
 */
async function runCompactRequirementAnalysis(pack, container, opts = {}) {
  const started = Date.now();
  const wallMs = opts.wallMs ?? compactJobWallMs('requirementAnalysis');
  const model = ollamaModel();
  const hierarchy = container?.analyses?.hierarchy || null;
  const contentHash = buildPackContentHash(pack, { hierarchy });
  const cacheKey = {
    contentHash,
    job: 'requirementAnalysis',
    model,
    promptVersion: PROMPT_VERSION,
  };

  if (!opts.force) {
    const cached = getLlmCache(container, cacheKey);
    if (cached.hit && cached.payload?.dataResult && cached.payload?.gapResult) {
      return {
        container: cached.container,
        dataResult: {
          ...cached.payload.dataResult,
          meta: { ...cached.payload.dataResult.meta, cacheHit: true, promptVersion: PROMPT_VERSION },
        },
        gapResult: {
          ...cached.payload.gapResult,
          meta: { ...cached.payload.gapResult.meta, cacheHit: true, promptVersion: PROMPT_VERSION },
        },
        llmCalls: 0,
        cacheHit: true,
        contentHash,
      };
    }
  }

  const frSlices = buildRequirementFrSlicesForAnalysis(pack, hierarchy);
  const packFrIds = expandFrIdSetWithSlices(
    buildFrIdSet(pack?.functionalRequirements || []),
    frSlices
  );
  const context = buildProjectContextSlice(pack);
  const dataHints = buildDataHintSlice(pack);
  const heuristicEntities = buildHeuristicDataEntities(frSlices, dataHints);
  const heuristicFlows = buildHeuristicDataFlows(heuristicEntities);
  const gapHints = buildGapInputHints(pack, { hierarchy, frSlices });
  const heuristicGaps = buildHeuristicGapItems(gapHints);

  let llmCalls = 0;
  let partial = false;
  let lastError = null;
  let usedModel = null;
  let entities = heuristicEntities;
  let dataFlows = heuristicFlows;
  let gaps = heuristicGaps;
  let dataSource = 'heuristic';
  let gapSource = heuristicGaps.length ? 'heuristic' : 'empty';
  const MAX_CALLS = 2;

  const llmOn = isAiPlanningLlmEnabled();
  const hotFr = selectHotFrSlices(frSlices);

  if (llmOn && hotFr.length && Date.now() - started < wallMs && llmCalls < MAX_CALLS) {
    const prompt = buildPassADataCapabilityPrompt({
      context,
      frRows: frRowsTsv(hotFr),
    });
    const result = await generateJsonOnce(prompt, {
      ...opts,
      remainingCalls: MAX_CALLS - llmCalls,
      allowRepair: MAX_CALLS - llmCalls > 1,
    });
    llmCalls += result.llmCalls || 0;
    if (result.ok && result.data != null) {
      usedModel = result.model || model;
      try {
        const parsed = validateAndNormalizeDataPayload(
          mapPassAToDataPayload(result.data),
          packFrIds,
          null
        );
        const cleaned = dropOrphanRefs(parsed.entities, parsed.dataFlows);
        if (cleaned.entities.length) {
          const withCrud = enrichEntitiesCrudFromFrSlices(cleaned.entities, frSlices);
          entities = dedupeDataEntities([...withCrud, ...heuristicEntities]);
          dataFlows = cleaned.dataFlows.length ? cleaned.dataFlows : heuristicFlows;
          dataSource = 'llm';
        } else {
          partial = true;
        }
        void mapPassAToCapPayload(result.data);
      } catch (err) {
        partial = true;
        lastError = err.code || 'DATA_INVALID';
      }
    } else {
      partial = true;
      lastError = result.error || 'ollama_error';
    }
  }

  const qualityFlags = buildQualityFlags(frSlices);
  if (
    llmOn &&
    shouldRunGapLlm(qualityFlags) &&
    Date.now() - started < wallMs &&
    llmCalls < MAX_CALLS
  ) {
    const flaggedIds = new Set(qualityFlags.map((f) => f.id));
    const flaggedFr = frSlices.filter((s) => flaggedIds.has(s.id)).slice(0, 24);
    const prompt = buildPassBGapPrompt({
      context,
      flagRows: flagRowsCompact(qualityFlags),
      frRows: frRowsTsv(flaggedFr.length ? flaggedFr : hotFr.slice(0, 16)),
    });
    const result = await generateJsonOnce(prompt, {
      ...opts,
      remainingCalls: MAX_CALLS - llmCalls,
      allowRepair: false,
    });
    llmCalls += result.llmCalls || 0;
    if (result.ok && result.data != null) {
      usedModel = result.model || usedModel || model;
      try {
        const items = validateAndNormalizeGapPayload(result.data, packFrIds, null);
        if (items.length) {
          gaps = dedupeGapItems([...items, ...heuristicGaps]);
          gapSource = 'llm';
        } else {
          partial = true;
        }
      } catch (err) {
        partial = true;
        lastError = err.code || 'GAP_INVALID';
      }
    } else if (!result.skipped) {
      partial = true;
      lastError = result.error || lastError;
    }
  }

  llmCalls = Math.min(llmCalls, MAX_CALLS);

  const policy = buildGapPolicyMeta(gaps);
  const dataResult = {
    status: 'ready',
    model: llmCalls > 0 ? usedModel : null,
    generatedAt: new Date().toISOString(),
    entities,
    dataFlows,
    meta: {
      source: dataSource,
      llmCalls: Math.min(llmCalls, 2),
      partial,
      error: lastError || undefined,
      elapsedMs: Date.now() - started,
      promptVersion: PROMPT_VERSION,
      contentHash,
      compactV2: true,
      cacheHit: false,
    },
  };
  // Attribute full llmCalls on job return; split meta for sections
  const gapLlmPortion = gapSource === 'llm' ? Math.min(1, llmCalls) : 0;
  const dataLlmPortion = dataSource === 'llm' ? Math.max(0, Math.min(2, llmCalls) - gapLlmPortion) : 0;
  dataResult.meta.llmCalls = dataLlmPortion;

  const gapResult = {
    status: 'ready',
    model: gapSource === 'llm' ? usedModel : null,
    generatedAt: new Date().toISOString(),
    items: gaps,
    meta: {
      source: gapSource,
      llmCalls: gapLlmPortion,
      partial,
      error: lastError || undefined,
      elapsedMs: Date.now() - started,
      promptVersion: PROMPT_VERSION,
      contentHash,
      compactV2: true,
      cacheHit: false,
      ...policy,
      doesNotOverwriteValidation: true,
    },
  };

  let nextContainer = setLlmCache(container, cacheKey, { dataResult, gapResult });
  return {
    container: nextContainer,
    dataResult,
    gapResult,
    llmCalls: Math.min(llmCalls, 2),
    cacheHit: false,
    contentHash,
  };
}

async function runCompactCapabilityAnalysis(pack, container, opts = {}) {
  const started = Date.now();
  const wallMs = opts.wallMs ?? compactJobWallMs('capabilityAnalysis');
  const model = ollamaModel();
  const hierarchy = container?.analyses?.hierarchy || null;
  const contentHash = buildPackContentHash(pack, { hierarchy });
  const cacheKey = {
    contentHash,
    job: 'capabilityAnalysis',
    model,
    promptVersion: PROMPT_VERSION,
  };

  if (!opts.force) {
    const cached = getLlmCache(container, cacheKey);
    if (cached.hit && cached.payload?.capabilityResult) {
      return {
        container: cached.container,
        capabilityResult: {
          ...cached.payload.capabilityResult,
          meta: {
            ...cached.payload.capabilityResult.meta,
            cacheHit: true,
            promptVersion: PROMPT_VERSION,
          },
        },
        llmCalls: 0,
        cacheHit: true,
        contentHash,
      };
    }
  }

  const frSlices = buildRequirementFrSlicesForAnalysis(pack, hierarchy);
  const packFrIds = expandFrIdSetWithSlices(
    buildFrIdSet(pack?.functionalRequirements || []),
    frSlices
  );
  const context = buildProjectContextSlice(pack);
  const heuristic = buildHeuristicCapabilityItems(frSlices);
  let items = heuristic;
  let llmCalls = 0;
  let partial = false;
  let lastError = null;
  let usedModel = null;
  let source = 'heuristic';

  const hotFr = selectHotFrSlices(frSlices);
  if (isAiPlanningLlmEnabled() && hotFr.length && Date.now() - started < wallMs) {
    const prompt = buildPassADataCapabilityPrompt({
      context,
      frRows: frRowsTsv(hotFr),
    });
    const result = await generateJsonOnce(prompt, {
      ...opts,
      remainingCalls: 2,
      allowRepair: true,
    });
    llmCalls = Math.min(result.llmCalls || 0, 2);
    if (result.ok && result.data != null) {
      usedModel = result.model || model;
      try {
        const normalized = validateAndNormalizeCapabilityPayload(
          mapPassAToCapPayload(result.data),
          packFrIds
        );
        if (normalized.length) {
          items = dedupeCapabilityItems([...normalized, ...heuristic]);
          source = 'llm';
        } else {
          partial = true;
        }
      } catch (err) {
        partial = true;
        lastError = err.code || 'CAPABILITY_INVALID';
      }
    } else if (!result.skipped) {
      partial = true;
      lastError = result.error || 'ollama_error';
    }
  }

  const capabilityResult = {
    status: 'ready',
    model: llmCalls > 0 ? usedModel : null,
    generatedAt: new Date().toISOString(),
    items,
    meta: {
      source,
      llmCalls: Math.min(llmCalls, 2),
      partial,
      error: lastError || undefined,
      elapsedMs: Date.now() - started,
      promptVersion: PROMPT_VERSION,
      contentHash,
      compactV2: true,
      cacheHit: false,
    },
  };
  const nextContainer = setLlmCache(container, cacheKey, { capabilityResult });
  return {
    container: nextContainer,
    capabilityResult,
    llmCalls: Math.min(llmCalls, 2),
    cacheHit: false,
    contentHash,
  };
}

async function runCompactWbsGeneration(pack, container, opts = {}) {
  const started = Date.now();
  const wallMs = opts.wallMs ?? compactJobWallMs('wbsGeneration');
  const model = ollamaModel();
  const contentHash = buildPackContentHash(pack);
  const cacheKey = {
    contentHash,
    job: 'wbsGeneration',
    model,
    promptVersion: PROMPT_VERSION,
  };

  if (!opts.force) {
    const cached = getLlmCache(container, cacheKey);
    if (cached.hit && cached.payload?.wbsResult) {
      return {
        container: cached.container,
        wbsResult: {
          ...cached.payload.wbsResult,
          meta: { ...cached.payload.wbsResult.meta, cacheHit: true, promptVersion: PROMPT_VERSION },
        },
        llmCalls: 0,
        cacheHit: true,
        contentHash,
      };
    }
  }

  const packFrIds = buildFrIdSet(pack?.functionalRequirements || []);
  const capabilities =
    opts.capabilities ||
    container?.analyses?.capability?.items ||
    buildHeuristicCapabilityItems(buildRequirementFrSlices(pack));
  const knownCapIds = new Set(
    (capabilities || []).map((c) => c.capabilityId).filter(Boolean)
  );
  const heuristic = buildHeuristicWbsTasks(capabilities);
  let tasks = heuristic;
  let llmCalls = 0;
  let partial = false;
  let lastError = null;
  let usedModel = null;
  let source = 'heuristic';

  if (
    isAiPlanningLlmEnabled() &&
    capabilities.length &&
    Date.now() - started < wallMs
  ) {
    const prompt = buildPassCWbsPrompt({
      capsRows: capsRowsCompact(capabilities),
    });
    const result = await generateJsonOnce(prompt, {
      ...opts,
      remainingCalls: 2,
      allowRepair: true,
    });
    llmCalls = Math.min(result.llmCalls || 0, 2);
    if (result.ok && result.data != null) {
      usedModel = result.model || model;
      try {
        const normalized = validateAndNormalizeWbsPayload(
          result.data,
          packFrIds,
          knownCapIds
        );
        if (normalized.length) {
          tasks = normalized;
          source = 'llm';
        } else {
          partial = true;
        }
      } catch (err) {
        partial = true;
        lastError = err.code || 'WBS_INVALID';
      }
    } else if (!result.skipped) {
      partial = true;
      lastError = result.error || 'ollama_error';
    }
  }

  const wbsResult = {
    status: 'ready',
    model: llmCalls > 0 ? usedModel : null,
    generatedAt: new Date().toISOString(),
    tasks,
    meta: {
      source,
      llmCalls,
      partial,
      error: lastError || undefined,
      elapsedMs: Date.now() - started,
      promptVersion: PROMPT_VERSION,
      contentHash,
      compactV2: true,
      cacheHit: false,
    },
  };
  const nextContainer = setLlmCache(container, cacheKey, { wbsResult });
  return {
    container: nextContainer,
    wbsResult,
    llmCalls,
    cacheHit: false,
    contentHash,
  };
}

/** Dependency: sheet + heuristic only (0 LLM) under Compact V2. */
async function runCompactDependencyAnalysis(pack, container, opts = {}) {
  const depResult = await runDependencyAnalysis(pack, container, {
    ...opts,
    forceHeuristic: true,
  });
  return {
    container,
    depResult: {
      ...depResult,
      meta: {
        ...depResult.meta,
        compactV2: true,
        promptVersion: PROMPT_VERSION,
        llmCalls: 0,
      },
    },
    llmCalls: 0,
    cacheHit: false,
  };
}

async function runCompactArchitectureRiskAnalysis(pack, container, opts = {}) {
  const started = Date.now();
  const wallMs = opts.wallMs ?? compactJobWallMs('architectureRiskAnalysis');
  const model = ollamaModel();
  const contentHash = buildPackContentHash(pack);
  const cacheKey = {
    contentHash,
    job: 'architectureRiskAnalysis',
    model,
    promptVersion: PROMPT_VERSION,
  };

  if (!opts.force) {
    const cached = getLlmCache(container, cacheKey);
    if (cached.hit && cached.payload?.archResult && cached.payload?.riskResult) {
      return {
        container: cached.container,
        archResult: {
          ...cached.payload.archResult,
          meta: { ...cached.payload.archResult.meta, cacheHit: true },
        },
        riskResult: {
          ...cached.payload.riskResult,
          meta: { ...cached.payload.riskResult.meta, cacheHit: true },
        },
        llmCalls: 0,
        cacheHit: true,
        contentHash,
      };
    }
  }

  const archInput = buildArchitectureInputSlices(pack, container);
  const riskInput = buildRiskInputSlices(pack, container);
  const heuristicArch = buildHeuristicArchitectureItems(archInput);
  const heuristicChains = buildHeuristicChains(heuristicArch);
  const heuristicRisk = buildHeuristicRiskItems(riskInput);

  let archItems = heuristicArch;
  let chains = heuristicChains;
  let riskItems = heuristicRisk;
  let llmCalls = 0;
  let partial = false;
  let lastError = null;
  let usedModel = null;
  let archSource = 'heuristic';
  let riskSource = heuristicRisk.length ? 'heuristic' : 'empty';

  const caps = archInput.capabilities || [];
  const edges = (container?.analyses?.dependency?.edges || []).slice(0, 20);
  const edgeHint = edges
    .map((e) => `${e.from}->${e.to}`)
    .join(';')
    .slice(0, 400);

  if (isAiPlanningLlmEnabled() && caps.length && Date.now() - started < wallMs) {
    const prompt = buildPassDArchRiskPrompt({
      context: archInput.context || buildProjectContextSlice(pack),
      capsRows: capsRowsCompact(caps),
      edgeHint,
    });
    const result = await generateJsonOnce(prompt, {
      ...opts,
      remainingCalls: 2,
      allowRepair: true,
    });
    llmCalls = Math.min(result.llmCalls || 0, 2);
    if (result.ok && result.data != null) {
      usedModel = result.model || model;
      try {
        const impactsPayload = {
          items: Array.isArray(result.data.impacts) ? result.data.impacts : [],
        };
        const parsedArch = validateAndNormalizeArchitecturePayload(
          impactsPayload,
          archInput.knownFrIds,
          archInput.knownCapabilityIds
        );
        if (parsedArch.items.length) {
          archItems = selectTopNArchitectureItems(parsedArch.items);
          chains = parsedArch.chains?.length
            ? parsedArch.chains
            : buildHeuristicChains(archItems);
          archSource = 'llm';
        }
      } catch (err) {
        partial = true;
        lastError = err.code || 'ARCH_INVALID';
      }
      try {
        const risks = validateAndNormalizeRiskPayload(result.data, riskInput.knownFrIds, {
          fallbackFrIds: riskInput.fallbackFrIds,
        });
        if (risks.length) {
          riskItems = selectTopRisks(risks);
          riskSource = 'llm';
        }
      } catch (err) {
        partial = true;
        lastError = err.code || lastError || 'RISK_INVALID';
      }
    } else if (!result.skipped) {
      partial = true;
      lastError = result.error || 'ollama_error';
    }
  }

  const archResult = {
    status: 'ready',
    model: llmCalls > 0 ? usedModel : null,
    generatedAt: new Date().toISOString(),
    items: archItems,
    chains,
    meta: {
      source: archSource,
      llmCalls: archSource === 'llm' ? Math.min(1, llmCalls) : 0,
      partial,
      error: lastError || undefined,
      elapsedMs: Date.now() - started,
      promptVersion: PROMPT_VERSION,
      contentHash,
      compactV2: true,
      cacheHit: false,
    },
  };
  const riskResult = {
    status: 'ready',
    model: riskSource === 'llm' ? usedModel : null,
    generatedAt: new Date().toISOString(),
    items: riskItems,
    meta: {
      source: riskSource,
      llmCalls: riskSource === 'llm' ? Math.min(1, Math.max(0, llmCalls - (archSource === 'llm' ? 1 : 0))) : 0,
      partial,
      error: lastError || undefined,
      elapsedMs: Date.now() - started,
      promptVersion: PROMPT_VERSION,
      contentHash,
      compactV2: true,
      cacheHit: false,
      ...buildRiskPolicyMeta(riskItems),
    },
  };

  const nextContainer = setLlmCache(container, cacheKey, { archResult, riskResult });
  return {
    container: nextContainer,
    archResult,
    riskResult,
    llmCalls,
    cacheHit: false,
    contentHash,
  };
}

module.exports = {
  isCompactV2Enabled,
  generateJsonOnce,
  runCompactRequirementAnalysis,
  runCompactCapabilityAnalysis,
  runCompactWbsGeneration,
  runCompactDependencyAnalysis,
  runCompactArchitectureRiskAnalysis,
  enrichCapabilityRaw,
  mapPassAToDataPayload,
  mapPassAToCapPayload,
};
