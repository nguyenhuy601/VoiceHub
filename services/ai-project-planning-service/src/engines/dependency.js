/**
 * Dependency analysis — tool candidates → optional LLM synthesize → schema 2.0.
 * Legacy edges projected for Sequencing / Risk / Schedule (RULE-05).
 */

const { runDependencyCandidateTool } = require('./dependencyCandidateEngine');
const { buildDependencyContextPack } = require('./dependencyContextPack');
const {
  dependenciesFromCandidates,
  normalizeDependencyAnalysisV2,
  SCHEMA_VERSION,
} = require('./dependencySchemaV2');
const { synthesizeDependencyWithLlm } = require('./dependencyLlm');
const { buildDependencyEdgesFromSrs } = require('./dependencyFromSrs');

function taskId(task, index = 0) {
  return String(task?.id || task?.taskId || `TASK-${index + 1}`).trim();
}

function edgeKey(e) {
  return `${e.from}->${e.to}`;
}

/**
 * @deprecated Prefer runDependencyCandidateTool — kept for callers/tests.
 * Builds legacy-style edges from SRS + explicit only (no same-area auto-block).
 */
function buildHeuristicDependencyEdges(tasks = [], opts = {}) {
  const pack = opts.pack || {};
  const planningHints = opts.planningHints || null;
  const container = { planning: { tasks } };
  const tool = runDependencyCandidateTool({ container, pack, planningHints });
  const known = new Set(tasks.map((t, i) => taskId(t, i)).filter(Boolean));
  const analysis = dependenciesFromCandidates(tool.data.candidates, {
    knownTaskIds: known,
    unresolvedTaskIds: tool.data.unresolvedTaskIds,
    // include weak only if caller opts in (default false per plan)
    includeWeakAsDeps: Boolean(opts.includeWeakAsDeps),
  });
  return analysis.edges;
}

function buildOrderHint(tasks = [], edges = []) {
  const ids = tasks.map((t, i) => taskId(t, i)).filter(Boolean);
  if (!edges.length) return ids;
  const indegree = new Map(ids.map((id) => [id, 0]));
  const adj = new Map(ids.map((id) => [id, []]));
  for (const e of edges) {
    // from depends on to → to before from
    if (!indegree.has(e.from) || !indegree.has(e.to)) continue;
    adj.get(e.to).push(e.from);
    indegree.set(e.from, (indegree.get(e.from) || 0) + 1);
  }
  const queue = ids.filter((id) => (indegree.get(id) || 0) === 0);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const next of adj.get(id) || []) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  for (const id of ids) {
    if (!order.includes(id)) order.push(id);
  }
  return order;
}

/**
 * Full HOW dependency run: candidates → context → LLM (optional) → schema 2.0.
 */
async function runDependencyEngineAsync(container = {}, opts = {}) {
  const tasks = Array.isArray(container?.planning?.tasks) ? container.planning.tasks : [];
  const pack = opts.pack || container?.pack || {};
  const planningHints = opts.planningHints || null;
  const env = opts.env || process.env;
  const knownTaskIds = new Set(tasks.map((t, i) => taskId(t, i)).filter(Boolean));

  const candidateTool = runDependencyCandidateTool({ container, pack, planningHints });
  const contextPack = buildDependencyContextPack(container, pack);

  let analysis = dependenciesFromCandidates(candidateTool.data.candidates, {
    knownTaskIds,
    unresolvedTaskIds: candidateTool.data.unresolvedTaskIds,
  });
  let model = null;
  let llmCalls = 0;
  let llmMeta = {};
  let source = 'candidates_only';

  const synth = await synthesizeDependencyWithLlm({
    candidateToolResult: candidateTool,
    contextPack,
    knownTaskIds,
    env,
    generateJsonFn: opts.generateJsonFn || null,
  });

  if (synth.ok && synth.analysis) {
    // Merge: LLM deps primary; keep unresolved from LLM or fallback tool
    const llmAnalysis = synth.analysis;
    const unresolved =
      llmAnalysis.unresolvedQuestions?.length > 0
        ? llmAnalysis.unresolvedQuestions
        : analysis.unresolvedQuestions;
    analysis = normalizeDependencyAnalysisV2(
      {
        analysisStatus: llmAnalysis.analysisStatus || 'COMPLETED',
        dependencies: llmAnalysis.dependencies,
        unresolvedQuestions: unresolved,
      },
      {
        knownTaskIds,
        candidateKeys: new Set(
          (candidateTool.data.candidates || []).map(
            (c) => `${c.predecessorTaskId}->${c.successorTaskId}`
          )
        ),
      }
    );
    // If LLM returned empty but we had strong explicit candidates, keep those
    if (
      analysis.dependencies.length === 0 &&
      (candidateTool.data.candidates || []).some(
        (c) =>
          c.candidateRule === 'EXPLICIT_DEPENDS_ON' ||
          (c.candidateRule === 'CONSUMES_PRODUCER_OUTPUT' && c.strength === 'strong')
      )
    ) {
      const fallback = dependenciesFromCandidates(
        (candidateTool.data.candidates || []).filter(
          (c) =>
            c.candidateRule === 'EXPLICIT_DEPENDS_ON' ||
            c.candidateRule === 'CONSUMES_PRODUCER_OUTPUT'
        ),
        {
          knownTaskIds,
          unresolvedTaskIds: candidateTool.data.unresolvedTaskIds,
        }
      );
      if (fallback.dependencies.length) {
        analysis = {
          ...fallback,
          unresolvedQuestions:
            unresolved.length > 0 ? unresolved : fallback.unresolvedQuestions,
        };
        source = 'candidates_strong_after_empty_llm';
      } else {
        source = 'srs_heuristic_llm';
      }
    } else {
      source = 'srs_heuristic_llm';
    }
    model = synth.meta?.model || null;
    llmCalls = synth.meta?.llmCalls || 1;
    llmMeta = {
      llmDepsProposed: synth.meta?.llmDepsProposed,
      llmFallback: null,
    };
  } else {
    llmMeta = {
      llmAttempted: Boolean(synth.meta?.fallbackReason),
      llmFallback: synth.meta?.fallbackReason || 'llm_skipped',
    };
  }

  const edges = analysis.edges || [];
  const orderHint = buildOrderHint(tasks, edges);

  return {
    status: 'ready',
    schemaVersion: SCHEMA_VERSION,
    analysisStatus: analysis.analysisStatus || 'COMPLETED',
    model,
    generatedAt: new Date().toISOString(),
    dependencies: analysis.dependencies || [],
    unresolvedQuestions: analysis.unresolvedQuestions || [],
    validation: analysis.validation || {
      missingTaskReferences: [],
      duplicateDependencies: [],
      circularDependencies: [],
      unsupportedRelationships: [],
    },
    edges,
    orderHint,
    candidateTool,
    contextMeta: contextPack.meta,
    meta: {
      source,
      llmCalls,
      edgeCount: edges.length,
      taskCount: tasks.length,
      candidateCount: candidateTool.meta?.candidateCount || 0,
      dependencyCount: (analysis.dependencies || []).length,
      unresolvedCount: (analysis.unresolvedQuestions || []).length,
      srsEdgeCount: (candidateTool.data?.candidates || []).filter((c) =>
        String(c.candidateRule || '').startsWith('SRS_')
      ).length,
      ...llmMeta,
    },
  };
}

/** Sync wrapper — candidates only (no LLM). Used by tests / sync callers. */
function runDependencyEngine(container = {}, opts = {}) {
  const tasks = Array.isArray(container?.planning?.tasks) ? container.planning.tasks : [];
  const pack = opts.pack || container?.pack || {};
  const planningHints = opts.planningHints || null;
  const knownTaskIds = new Set(tasks.map((t, i) => taskId(t, i)).filter(Boolean));

  const candidateTool = runDependencyCandidateTool({ container, pack, planningHints });
  const analysis = dependenciesFromCandidates(candidateTool.data.candidates, {
    knownTaskIds,
    unresolvedTaskIds: candidateTool.data.unresolvedTaskIds,
  });
  const edges = analysis.edges || [];
  const orderHint = buildOrderHint(tasks, edges);

  return {
    status: 'ready',
    schemaVersion: SCHEMA_VERSION,
    analysisStatus: analysis.analysisStatus || 'COMPLETED',
    model: null,
    generatedAt: new Date().toISOString(),
    dependencies: analysis.dependencies || [],
    unresolvedQuestions: analysis.unresolvedQuestions || [],
    validation: analysis.validation || {},
    edges,
    orderHint,
    candidateTool,
    meta: {
      source: 'candidates_only',
      llmCalls: 0,
      edgeCount: edges.length,
      taskCount: tasks.length,
      candidateCount: candidateTool.meta?.candidateCount || 0,
      dependencyCount: (analysis.dependencies || []).length,
      unresolvedCount: (analysis.unresolvedQuestions || []).length,
      srsEdgeCount: (candidateTool.data?.candidates || []).filter((c) =>
        String(c.candidateRule || '').startsWith('SRS_')
      ).length,
    },
  };
}

/**
 * Legacy edges store successor on `from` and predecessor on `to`.
 * Gate2 reads schema-v2 `dependencies` and ignores a present-but-empty array.
 */
function legacyEdgesToDependencies(edges = []) {
  return (Array.isArray(edges) ? edges : [])
    .map((edge, index) => {
      const predecessorTaskId = String(edge?.to || edge?.predecessorTaskId || '').trim();
      const successorTaskId = String(edge?.from || edge?.successorTaskId || '').trim();
      if (!predecessorTaskId || !successorTaskId) return null;
      return {
        id: edge.id || `${predecessorTaskId}->${successorTaskId}` || `dep-${index}`,
        predecessorTaskId,
        successorTaskId,
        relationship: edge.depType || edge.relationship || 'FS',
        depType: edge.depType || 'FS',
        blockingScope: edge.blockingScope || 'FULL',
        reason: edge.reason || edge.summary || edge.title || '',
        title: edge.title || edge.reason || '',
        evidenceRefs: Array.isArray(edge.evidenceRefs) ? edge.evidenceRefs.map(String) : [],
        status: 'PROPOSED',
        source: edge.source || '',
      };
    })
    .filter(Boolean);
}

/** Analyses-only — never echo planning.tasks (safe when ∥ ArchitectureTool). */
function applyDependencyToContainer(container, depResult) {
  void container;
  const edges = Array.isArray(depResult.edges) ? depResult.edges : [];
  const dependencies =
    Array.isArray(depResult.dependencies) && depResult.dependencies.length
      ? depResult.dependencies
      : legacyEdgesToDependencies(edges);
  return {
    analyses: {
      dependency: {
        status: depResult.status || 'ready',
        schemaVersion: depResult.schemaVersion || SCHEMA_VERSION,
        analysisStatus: depResult.analysisStatus || 'COMPLETED',
        model: depResult.model || null,
        generatedAt: depResult.generatedAt || new Date().toISOString(),
        items: [],
        entities: [],
        dependencies,
        unresolvedQuestions: depResult.unresolvedQuestions || [],
        validation: depResult.validation || {
          missingTaskReferences: [],
          duplicateDependencies: [],
          circularDependencies: [],
          unsupportedRelationships: [],
        },
        edges,
        dataFlows: [],
        orderHint: depResult.orderHint || [],
        meta: depResult.meta || {},
      },
    },
  };
}

module.exports = {
  buildHeuristicDependencyEdges,
  buildOrderHint,
  runDependencyEngine,
  runDependencyEngineAsync,
  applyDependencyToContainer,
  // re-export for tests / legacy
  buildDependencyEdgesFromSrs,
  edgeKey,
};
