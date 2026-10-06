/**
 * Wave L — LLM WBS decompose (compact prompt + generateJson).
 * Large packs: chunk by HOW_WBS_LLM_MAX_FR_FOR_CALL (no skip → hierarchy).
 * Does not write container. HARD-03: real pack/capability/hints only.
 */

const { generateJson, isLlmEnabled } = require('../runtime/ollamaGenerate');
const {
  isHowWbsLlmFlagOn,
  WBS_LLM_AC_TRUNCATE,
  WBS_LLM_MAX_AC_PER_FR,
  resolveWbsLlmNumPredict,
  resolveWbsLlmNumCtx,
  resolveWbsLlmTimeoutMs,
  resolveWbsLlmMaxFr,
  resolveWbsLlmMaxCaps,
  resolveWbsLlmMaxFrForCall,
  resolveWbsLlmMaxChunks,
  resolveWbsLlmMaxLeavesPerFr,
  WBS_LLM_TARGET_LEAVES_PER_FR,
} = require('../contracts/howWbsLlmContract');
const { normalizeWbsLlmOutput } = require('./wbsLlmSchema');
const { wrapFlatTasksWithFrHierarchy } = require('./wrapFlatTasksWithFrHierarchy');
const {
  buildWbsLlmCacheKey,
  getWbsLlmCachedResponse,
  setWbsLlmCachedResponse,
  withWbsLlmInflight,
} = require('../jobs/wbsLlmChunkCache');
const {
  compactPackForWbsLlm,
  compactCapabilitiesForWbsLlm,
} = require('./compactWbsLlmInput');

function truncate(text, max) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function listFrRows(pack = {}) {
  if (Array.isArray(pack.functionalRequirements)) return pack.functionalRequirements;
  if (Array.isArray(pack.frList)) return pack.frList;
  if (Array.isArray(pack.requirements)) return pack.requirements;
  return [];
}

function listUcRows(pack = {}) {
  if (Array.isArray(pack.useCases)) return pack.useCases;
  if (Array.isArray(pack.ucList)) return pack.ucList;
  return [];
}

function rowId(row, index = 0) {
  return String(row?.externalId || row?.id || row?._id || `FR-${index + 1}`).trim();
}

function acTexts(row, planningHints, frId) {
  if (Array.isArray(planningHints?.acSummaries)) {
    const fromHints = planningHints.acSummaries
      .filter((a) => String(a.frId) === String(frId))
      .sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0))
      .map((a) => truncate(a.text, WBS_LLM_AC_TRUNCATE))
      .filter(Boolean);
    if (fromHints.length) return fromHints.slice(0, WBS_LLM_MAX_AC_PER_FR);
  }
  const raw = row?.ac || row?.acceptanceCriteria || '';
  if (Array.isArray(row?.acceptanceCriteriaList)) {
    return row.acceptanceCriteriaList
      .map((x) => truncate(x, WBS_LLM_AC_TRUNCATE))
      .filter(Boolean)
      .slice(0, WBS_LLM_MAX_AC_PER_FR);
  }
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw
    .split(/\n|;/)
    .map((s) => s.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((s) => s.length >= 3)
    .map((s) => truncate(s, WBS_LLM_AC_TRUNCATE))
    .slice(0, WBS_LLM_MAX_AC_PER_FR);
}

/**
 * Ultra-compact prompt — flat task leaves only (normalize accepts parentId:null roots).
 * Decode size ≪ full Epic→Feature→Story→Task trees (latency-critical on CPU 3B).
 */
function buildWbsLlmPrompt({ pack, capabilities, planningHints, env = process.env }) {
  const maxFr = resolveWbsLlmMaxFr(env);
  const maxCaps = resolveWbsLlmMaxCaps(env);
  const frRows = listFrRows(pack).slice(0, maxFr);
  const frPayload = frRows.map((row, i) => {
    const id = rowId(row, i);
    const item = {
      i: id,
      t: truncate(row.name || row.title || id, 48),
    };
    const mod = truncate(row.module || row.moduleName || '', 24);
    if (mod) item.m = mod;
    const ac = acTexts(row, planningHints, id);
    if (ac.length) item.a = ac;
    return item;
  });

  const caps = (capabilities || []).slice(0, maxCaps).map((c) => {
    const item = {
      i: c.capabilityId || c.id,
      t: truncate(c.name, 40),
    };
    if (Array.isArray(c.sourceFrIds) && c.sourceFrIds.length) {
      item.fr = c.sourceFrIds.slice(0, 4);
    }
    return item;
  });

  const maxLeaves = resolveWbsLlmMaxLeavesPerFr(env);
  const targetLeaves = Math.min(WBS_LLM_TARGET_LEAVES_PER_FR, maxLeaves);
  // Flat task leaves only — hierarchy wrap is deterministic post-LLM.
  const lines = [
    'WBS leaves JSON only. No prose. No epic/feature/story nodes.',
    'Shape:{"nodes":[{"id","name","level":"task","parentId":null,"sourceFrIds","effortSeedHours","area"}]}',
    `Rules: 1-${maxLeaves} task leaves per FR (target ~${targetLeaves}); split real work (API/DB/UI/QA) when FR has multiple steps — do NOT copy FR title as every leaf; short id like T-{frId}-{n}; sourceFrIds=[that FR]; effortSeedHours 4-40; area∈frontend|backend|qa|design|infra; use only FR ids listed.`,
    `FRS=${JSON.stringify(frPayload)}`,
  ];
  if (caps.length) lines.push(`CAPS=${JSON.stringify(caps)}`);
  return lines.join('\n');
}

function isHowWbsLlmEnabled(env = process.env) {
  return isHowWbsLlmFlagOn(env) && isLlmEnabled(env);
}

function warnFallback(meta) {
  const reason = meta?.fallbackReason || 'unknown';
  console.warn(
    `[how-wbs-llm] fallback reason=${reason} model=${meta?.model || '-'} llmMs=${meta?.llmMs ?? '-'} fr=${meta?.promptFrCount ?? '-'}`
  );
}

function chunkArray(items, size) {
  const out = [];
  const n = Math.max(1, size);
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

function frIdSet(frRows) {
  return new Set(frRows.map((row, i) => rowId(row, i)));
}

function slicePackForChunk(pack, frChunk) {
  // No UC in chunk prompts — cuts prompt eval; FR+caps enough for leaf naming
  return {
    ...pack,
    functionalRequirements: frChunk,
    frList: frChunk,
    useCases: [],
    ucList: [],
  };
}

function sliceCapsForChunk(capabilities, frChunk) {
  const ids = frIdSet(frChunk);
  const related = (capabilities || []).filter((c) => {
    const frs = Array.isArray(c.sourceFrIds) ? c.sourceFrIds : [];
    return frs.length > 0 && frs.some((id) => ids.has(String(id)));
  });
  // Prefer related only; empty → no CAPS line (faster) rather than full roster
  return related.slice(0, 12);
}

function prefixTreeIds(nodes, prefix) {
  const list = Array.isArray(nodes) ? nodes : [];
  const idMap = new Map();
  for (const n of list) {
    const old = String(n.id || '');
    if (!old) continue;
    idMap.set(old, `${prefix}${old}`);
  }
  return list.map((n) => {
    const id = String(n.id || '');
    const parentId = n.parentId == null || n.parentId === '' ? null : String(n.parentId);
    return {
      ...n,
      id: idMap.get(id) || `${prefix}${id}`,
      parentId: parentId == null ? null : idMap.get(parentId) || `${prefix}${parentId}`,
    };
  });
}

function prefixTasks(tasks, prefix) {
  return (Array.isArray(tasks) ? tasks : []).map((t) => {
    const id = String(t.id || t.taskId || '');
    const parentId =
      t.parentId == null || t.parentId === '' ? null : String(t.parentId);
    return {
      ...t,
      id: id ? `${prefix}${id}` : id,
      taskId: t.taskId ? `${prefix}${t.taskId}` : t.taskId,
      parentId: parentId ? `${prefix}${parentId}` : parentId,
    };
  });
}

function resolveModelName(env = process.env) {
  return String(env.OLLAMA_MODEL || env.LLM_MODEL || 'qwen2.5:3b-instruct').trim();
}

function applyHierarchyWrap(normalized, pack) {
  const wrapped = wrapFlatTasksWithFrHierarchy({
    tasks: normalized.tasks,
    wbs: normalized.wbs,
    pack,
  });
  return {
    tasks: wrapped.tasks,
    wbs: wrapped.wbs,
    wrapMeta: wrapped.meta,
  };
}

/**
 * Single LLM call for one pack slice (already sized for latency).
 */
async function decomposeWbsWithLlmOnce(opts = {}) {
  const env = opts.env || process.env;
  const pack = compactPackForWbsLlm(opts.pack || {});
  const capabilities = compactCapabilitiesForWbsLlm(opts.capabilities || []);
  const planningHints = null; // keep prompt lean — FR module/feature/AC only
  const gen = typeof opts.generateJsonFn === 'function' ? opts.generateJsonFn : generateJson;

  const frRows = listFrRows(pack);
  const promptFrCount = frRows.length;
  if (promptFrCount === 0) {
    return {
      ok: false,
      meta: {
        source: 'skipped',
        llmCalls: 0,
        fallbackReason: 'empty_fr_pack',
        promptFrCount: 0,
      },
    };
  }

  const tPrompt = Date.now();
  const prompt = buildWbsLlmPrompt({ pack, capabilities, planningHints, env });
  const promptMs = Date.now() - tPrompt;
  const promptChars = prompt.length;
  const numPredict = resolveWbsLlmNumPredict(
    Math.min(promptFrCount, resolveWbsLlmMaxFr(env)),
    env
  );
  const numCtx = resolveWbsLlmNumCtx(env);
  const timeoutMs = resolveWbsLlmTimeoutMs(env);
  const model = resolveModelName(env);
  const cacheKey = buildWbsLlmCacheKey({
    prompt,
    model,
    numPredict,
    numCtx,
  });

  const produce = async () => {
    const cached = await getWbsLlmCachedResponse(cacheKey, env);
    if (cached?.data != null) {
      return {
        ok: true,
        cached: true,
        cacheLayer: cached.cacheLayer || 'cache',
        model: cached.model || model,
        data: cached.data,
        usage: cached.usage || null,
        llmMs: 0,
      };
    }

    const tLlm = Date.now();
    let llmResult;
    try {
      llmResult = await gen({
        prompt,
        numPredict,
        numCtx,
        timeoutMs,
        temperature: 0.1,
        env,
      });
    } catch (err) {
      return {
        ok: false,
        cached: false,
        error: String(err?.message || err || 'llm_throw'),
        llmMs: Date.now() - tLlm,
      };
    }
    const llmMs = Date.now() - tLlm;
    if (!llmResult?.ok || llmResult.data == null) {
      return {
        ok: false,
        cached: false,
        error: llmResult?.error || 'llm_failed',
        model: llmResult?.model || model,
        usage: llmResult?.usage || null,
        llmMs,
      };
    }
    await setWbsLlmCachedResponse(
      cacheKey,
      {
        data: llmResult.data,
        model: llmResult.model || model,
        usage: llmResult.usage || null,
        promptChars,
      },
      env
    );
    return {
      ok: true,
      cached: false,
      model: llmResult.model || model,
      data: llmResult.data,
      usage: llmResult.usage || null,
      llmMs,
    };
  };

  const llmResult = await withWbsLlmInflight(cacheKey, produce);
  if (!llmResult?.ok) {
    return {
      ok: false,
      meta: {
        source: 'llm_error',
        llmCalls: llmResult?.cached ? 0 : 1,
        model: llmResult?.model || model,
        fallbackReason: llmResult?.error || 'llm_failed',
        promptFrCount,
        promptChars,
        promptMs,
        llmMs: llmResult?.llmMs ?? 0,
        numPredict,
        numCtx,
        usage: llmResult?.usage || null,
        cacheKey,
      },
    };
  }

  const tNorm = Date.now();
  const normalized = normalizeWbsLlmOutput(llmResult.data, { pack, capabilities, env });
  const normalizeMs = Date.now() - tNorm;

  if (!normalized.ok) {
    return {
      ok: false,
      meta: {
        source: 'llm_invalid',
        llmCalls: llmResult.cached ? 0 : 1,
        model: llmResult.model || null,
        fallbackReason: (normalized.errors || ['normalize_failed']).join(','),
        promptFrCount,
        promptChars,
        promptMs,
        llmMs: llmResult.llmMs ?? 0,
        normalizeMs,
        numPredict,
        numCtx,
        usage: llmResult.usage || null,
        warnings: normalized.errors,
        cacheHit: Boolean(llmResult.cached),
        cacheKey,
      },
    };
  }

  const applied = {
    tasks: normalized.tasks,
    wbs: normalized.wbs,
    wrapMeta: null,
  };

  return {
    ok: true,
    tasks: applied.tasks,
    wbs: applied.wbs,
    meta: {
      source: llmResult.cached ? 'llm_hierarchy_cached' : 'llm_hierarchy',
      llmCalls: llmResult.cached ? 0 : 1,
      model: llmResult.model || null,
      promptFrCount,
      promptChars,
      promptMs,
      llmMs: llmResult.llmMs ?? 0,
      normalizeMs,
      numPredict,
      numCtx,
      nodeCount: (applied.wbs?.nodes || []).length,
      leafCount: applied.wbs?.taskCount ?? 0,
      usage: llmResult.usage || null,
      warnings: normalized.warnings || [],
      cacheHit: Boolean(llmResult.cached),
      cacheLayer: llmResult.cacheLayer || null,
      cacheKey,
    },
  };
}

/**
 * @param {{
 *   pack?: object,
 *   capabilities?: object[],
 *   planningHints?: object|null,
 *   env?: NodeJS.ProcessEnv,
 *   generateJsonFn?: typeof generateJson,
 * }} opts
 * @returns {Promise<{ ok: boolean, tasks?: object[], wbs?: object, meta: object }>}
 */
async function decomposeWbsWithLlm(opts = {}) {
  const env = opts.env || process.env;
  const pack = opts.pack || {};
  const capabilities = opts.capabilities || [];
  const planningHints = opts.planningHints || null;

  if (!isHowWbsLlmFlagOn(env)) {
    return {
      ok: false,
      meta: {
        source: 'skipped',
        llmCalls: 0,
        fallbackReason: 'HOW_WBS_LLM_off',
      },
    };
  }
  if (!isLlmEnabled(env)) {
    return {
      ok: false,
      meta: {
        source: 'skipped',
        llmCalls: 0,
        fallbackReason: 'AI_PLANNING_LLM_off',
      },
    };
  }

  // Slim at boundary — only FR fields needed for prompt + hierarchy wrap
  const packSlim = compactPackForWbsLlm(pack);
  const capsSlim = compactCapabilitiesForWbsLlm(capabilities);

  const frRows = listFrRows(packSlim);
  const promptFrCount = frRows.length;
  if (promptFrCount === 0) {
    const meta = {
      source: 'skipped',
      llmCalls: 0,
      fallbackReason: 'empty_fr_pack',
      promptFrCount: 0,
    };
    warnFallback(meta);
    return { ok: false, meta };
  }

  const chunkSize = resolveWbsLlmMaxFrForCall(env);
  const maxChunks = resolveWbsLlmMaxChunks(env);
  const allChunks = chunkArray(frRows, chunkSize);
  const chunks = allChunks.slice(0, maxChunks);
  const truncatedFr = allChunks.length > chunks.length;

  if (chunks.length === 1 && !truncatedFr) {
    const once = await decomposeWbsWithLlmOnce({
      pack: packSlim,
      capabilities: capsSlim,
      planningHints,
      env,
      generateJsonFn: opts.generateJsonFn,
    });
    if (!once.ok) {
      warnFallback(once.meta);
      return once;
    }
    const applied = applyHierarchyWrap(once, packSlim);
    return {
      ok: true,
      tasks: applied.tasks,
      wbs: applied.wbs,
      meta: {
        ...once.meta,
        nodeCount: (applied.wbs?.nodes || []).length,
        leafCount: applied.wbs?.taskCount ?? once.meta?.leafCount ?? 0,
        hierarchyWrap: applied.wrapMeta || null,
      },
    };
  }

  console.info(
    `[how-wbs-llm] chunked decompose fr=${promptFrCount} chunkSize=${chunkSize} chunks=${chunks.length}/${allChunks.length}`
  );

  const mergedNodes = [];
  const mergedTasks = [];
  let llmCalls = 0;
  let totalLlmMs = 0;
  let cacheHits = 0;
  const chunkMeta = [];
  let lastModel = null;
  let okChunks = 0;

  for (let i = 0; i < chunks.length; i += 1) {
    const frChunk = chunks[i];
    const packSlice = slicePackForChunk(packSlim, frChunk);
    const capsSlice = sliceCapsForChunk(capsSlim, frChunk);
    const out = await decomposeWbsWithLlmOnce({
      pack: packSlice,
      capabilities: capsSlice,
      planningHints,
      env,
      generateJsonFn: opts.generateJsonFn,
    });
    llmCalls += out.meta?.llmCalls || 0;
    totalLlmMs += Number(out.meta?.llmMs) || 0;
    if (out.meta?.cacheHit) cacheHits += 1;
    chunkMeta.push({
      index: i,
      fr: frChunk.length,
      ok: out.ok === true,
      reason: out.ok ? null : out.meta?.fallbackReason || 'chunk_failed',
      llmMs: out.meta?.llmMs ?? null,
      leaves: out.meta?.leafCount ?? 0,
      numPredict: out.meta?.numPredict ?? null,
      evalCount: out.meta?.usage?.evalCount ?? null,
      promptChars: out.meta?.promptChars ?? null,
      cacheHit: Boolean(out.meta?.cacheHit),
      cacheLayer: out.meta?.cacheLayer || null,
    });
    if (!out.ok) {
      // Soft-continue: one slow/timeout chunk must not kill the whole pack (CPU 3B).
      console.warn(
        `[how-wbs-llm] chunk ${i}/${chunks.length} failed reason=${out.meta?.fallbackReason || 'failed'} — continue`
      );
      continue;
    }
    okChunks += 1;
    lastModel = out.meta?.model || lastModel;
    const prefix = `c${i}-`;
    mergedNodes.push(...prefixTreeIds(out.wbs?.nodes || [], prefix));
    mergedTasks.push(...prefixTasks(out.tasks || [], prefix));
  }

  if (okChunks === 0) {
    const firstFail = chunkMeta.find((c) => !c.ok);
    const meta = {
      source: 'llm_error',
      llmCalls,
      model: lastModel,
      fallbackReason: `all_chunks_failed_${firstFail?.reason || 'unknown'}`,
      promptFrCount,
      llmMs: totalLlmMs,
      chunks: chunks.length,
      chunkMeta,
      truncatedFr,
      cacheHits,
    };
    warnFallback(meta);
    return { ok: false, meta };
  }

  const flatMerged = {
    tasks: mergedTasks.length ? mergedTasks : mergedNodes.filter((n) => n.level === 'task'),
    wbs: {
      roots: mergedNodes.filter((n) => n.parentId == null).map((n) => n.id),
      nodes: mergedNodes,
      taskCount: mergedNodes.filter((n) => String(n.level) === 'task').length,
    },
  };
  // Wrap once after merge so Epic/Feature ids stay shared across chunks (no cN-EPIC dup)
  const applied = applyHierarchyWrap(flatMerged, packSlim);
  const failedChunks = chunkMeta.filter((c) => !c.ok).length;
  const warnings = [];
  if (truncatedFr) warnings.push(`truncated_fr_to_${chunks.length * chunkSize}_of_${promptFrCount}`);
  if (failedChunks > 0) warnings.push(`partial_chunks_ok_${okChunks}_of_${chunks.length}`);

  return {
    ok: true,
    tasks: applied.tasks,
    wbs: applied.wbs,
    meta: {
      source: failedChunks > 0 ? 'llm_hierarchy_chunked_partial' : 'llm_hierarchy_chunked',
      llmCalls,
      model: lastModel,
      promptFrCount,
      llmMs: totalLlmMs,
      chunks: chunks.length,
      chunkSize,
      okChunks,
      truncatedFr,
      chunkMeta,
      cacheHits,
      nodeCount: (applied.wbs?.nodes || []).length,
      leafCount: applied.wbs?.taskCount ?? 0,
      hierarchyWrap: applied.wrapMeta || null,
      warnings,
    },
  };
}

module.exports = {
  buildWbsLlmPrompt,
  decomposeWbsWithLlm,
  decomposeWbsWithLlmOnce,
  isHowWbsLlmEnabled,
  isHowWbsLlmFlagOn,
  warnFallback,
  chunkArray,
  slicePackForChunk,
};
