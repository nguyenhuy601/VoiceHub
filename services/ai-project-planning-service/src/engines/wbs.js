/**
 * WBS generation — LLM task leaves per approved FR.
 * An FR with 2+ tasks is promoted to a Feature under its Gate1 Story or Epic.
 */

const { proposeWbsTasksWithLlm, isHowWbsLlmEnabled } = require('./wbsProposeLlm');
const { resolveWbsStoriesFromSot } = require('./wbsStorySot');
const { buildWbsSemanticFromStories } = require('./wbsSemantic');

/** Whitelist only — never persist legacy hierarchy_chunked / void meta keys. */
const WBS_META_KEYS = Object.freeze([
  'source',
  'decompositionOutcome',
  'fallbackReason',
  'reasonCodes',
  'unresolvedUnitIds',
  'unresolvedStoryIds',
  'uncoveredFrIds',
  'isolatedFrIds',
  'uncoveredAcKeys',
  'llmCalls',
  'llmMs',
  'model',
  'promptChars',
  'storyCount',
  'epicCount',
  'featureCount',
  'unitCount',
  'leafCount',
  'taskCount',
  'chunks',
  'chunkOrchestrator',
  'deadLetterIds',
  'rejectedSnapshotIds',
]);

function sanitizeWbsMeta(meta = {}) {
  const src = meta && typeof meta === 'object' ? meta : {};
  const out = {};
  for (const key of WBS_META_KEYS) {
    if (src[key] !== undefined) out[key] = src[key];
  }
  if (!out.source) out.source = 'llm_failed';
  if (out.llmCalls == null) out.llmCalls = 0;
  if (!out.decompositionOutcome) {
    out.decompositionOutcome =
      out.source === 'llm_story_tasks' ||
      out.source === 'llm_story_tasks_chunked' ||
      out.source === 'llm_fr_tasks' ||
      out.source === 'llm_fr_tasks_chunked'
        ? 'success'
        : 'failure';
  }
  return out;
}

function wbsDecompositionError(result) {
  const outcome = String(result?.meta?.decompositionOutcome || '').toLowerCase();
  if (result?.status !== 'error' && outcome !== 'failure') return null;
  const reason = result?.meta?.fallbackReason || outcome || 'wbs_decomposition_failed';
  const err = new Error(`Phân rã WBS thất bại (${reason}).`);
  err.code = 'WBS_DECOMPOSITION_FAILED';
  return err;
}

function failClosedResult(meta = {}) {
  return {
    status: 'error',
    model: meta.model || null,
    generatedAt: new Date().toISOString(),
    tasks: [],
    wbs: { roots: [], nodes: [], taskCount: 0 },
    meta: sanitizeWbsMeta({
      source: 'llm_failed',
      llmCalls: meta.llmCalls || 0,
      ...meta,
      decompositionOutcome: meta.decompositionOutcome || 'failure',
    }),
  };
}

function llmSuccessResult(llmOut) {
  return {
    status: 'ready',
    model: llmOut.meta?.model || null,
    generatedAt: new Date().toISOString(),
    tasks: llmOut.tasks,
    wbs: llmOut.wbs,
    meta: sanitizeWbsMeta({
      ...llmOut.meta,
      source: llmOut.meta?.source || 'llm_story_tasks',
      decompositionOutcome: llmOut.meta?.decompositionOutcome || 'success',
      taskCount: llmOut.tasks?.length || 0,
      leafCount: llmOut.wbs?.taskCount ?? 0,
    }),
  };
}

function runWbsEngine(_container = {}, opts = {}) {
  const sot = resolveWbsStoriesFromSot({
    pack: opts.pack,
    container: _container,
    toolData: opts.toolData,
    approvedBacklogStructure: opts.approvedBacklogStructure,
  });
  if (!sot.ok) {
    return failClosedResult({
      fallbackReason: 'missing_approved_backlog_stories',
      reasonCodes: sot.reasonCodes,
    });
  }
  return failClosedResult({
    fallbackReason: 'sync_path_requires_async_llm',
    reasonCodes: ['sync_path_requires_async_llm'],
    storyCount: sot.stories.length,
  });
}

/**
 * @param {object} container
 * @param {{
 *   pack?: object,
 *   toolData?: object,
 *   approvedBacklogStructure?: object,
 *   semantic?: object|null,
 *   env?: object,
 *   generateJsonFn?: Function,
 * }} opts
 */
async function runWbsEngineAsync(container = {}, opts = {}) {
  const pack = opts.pack || {};
  const env = opts.env || process.env;

  const sot = resolveWbsStoriesFromSot({
    pack,
    container,
    toolData: opts.toolData,
    approvedBacklogStructure: opts.approvedBacklogStructure,
  });

  if (!sot.ok || !sot.stories.length) {
    console.error('[how-wbs] fail-closed missing_approved_backlog_stories');
    return failClosedResult({
      fallbackReason: 'missing_approved_backlog_stories',
      reasonCodes: sot.reasonCodes || ['missing_approved_backlog_stories'],
    });
  }

  const semanticBundle = opts.semanticBundle
    ? opts.semanticBundle
    : opts.semantic && typeof opts.semantic === 'object'
      ? { ok: true, semantic: opts.semantic }
      : await buildWbsSemanticFromStories({
          stories: sot.stories,
          pack,
          env,
        });

  if (!semanticBundle.ok) {
    console.error('[how-wbs] fail-closed', semanticBundle.contextStatus || 'semantic_incomplete');
    return failClosedResult({
      fallbackReason: semanticBundle.contextStatus || 'semantic_incomplete',
      reasonCodes: semanticBundle.missingSlots || ['semantic_incomplete'],
      storyCount: sot.stories.length,
      epicCount: sot.epics.length,
    });
  }

  if (!isHowWbsLlmEnabled(env)) {
    console.error('[how-wbs] fail-closed LLM_disabled');
    return failClosedResult({
      fallbackReason: 'HOW_WBS_LLM_or_runtime_off',
      reasonCodes: ['HOW_WBS_LLM_or_runtime_off'],
      storyCount: sot.stories.length,
      epicCount: sot.epics.length,
    });
  }

  const llmOut = await proposeWbsTasksWithLlm({
    stories: sot.stories,
    epics: sot.epics,
    semantic: semanticBundle.semantic || null,
    roleAllowList: Array.isArray(opts.roleAllowList) ? opts.roleAllowList : null,
    env,
    generateJsonFn: opts.generateJsonFn,
    runId: opts.runId || null,
    generationId: opts.generationId || null,
    inputSnapshotId: opts.inputSnapshotId || null,
  });

  if (llmOut.ok && Array.isArray(llmOut.tasks) && llmOut.wbs) {
    return llmSuccessResult(llmOut);
  }

  console.error(
    '[how-wbs] fail-closed',
    llmOut.meta?.fallbackReason || 'llm_failed',
    (llmOut.meta?.reasonCodes || []).join(';')
  );
  return failClosedResult({
    ...llmOut.meta,
    llmCalls: llmOut.meta?.llmCalls || 0,
    model: llmOut.meta?.model || null,
    storyCount: sot.stories.length,
    epicCount: sot.epics.length,
  });
}

function applyWbsToContainer(container, wbsResult) {
  const next = {
    ...container,
    planning: { ...(container?.planning || {}) },
  };
  next.planning.tasks = Array.isArray(wbsResult.tasks) ? wbsResult.tasks : [];
  const baseWbs = wbsResult.wbs || {
    roots: [],
    nodes: [],
    taskCount: 0,
  };
  next.planning.wbs = {
    roots: Array.isArray(baseWbs.roots) ? baseWbs.roots : [],
    nodes: Array.isArray(baseWbs.nodes) ? baseWbs.nodes : [],
    taskCount: Number(baseWbs.taskCount) || 0,
    meta: sanitizeWbsMeta(
      wbsResult.meta && typeof wbsResult.meta === 'object'
        ? wbsResult.meta
        : { source: 'llm_failed', llmCalls: 0 }
    ),
  };
  return next;
}

module.exports = {
  sanitizeWbsMeta,
  wbsDecompositionError,
  WBS_META_KEYS,
  runWbsEngine,
  runWbsEngineAsync,
  applyWbsToContainer,
};
