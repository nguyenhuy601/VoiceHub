/**
 * runSemanticTask — deterministic path + optional Runtime (RULE-EMPTY-01).
 */

const {
  getSemanticTask,
  resolveTaskPolicy,
  TASK_POLICIES,
} = require('./semanticTaskRegistry');
const { invokeSemanticRuntime } = require('./semanticRuntime');
const { stampAiSynthesis, stampExtracted } = require('./stampProvenance');

function isSourceEmpty(rows) {
  return !Array.isArray(rows) || rows.length === 0;
}

/**
 * Build a minimal prompt for non-FR tasks (Step 5 enable path).
 */
function buildTaskPrompt(task, rows) {
  return [
    `SemanticTask=${task.id} section=${task.section}`,
    task.promptPolicy,
    'Return JSON only matching the task semantic schema.',
    `Schema hint: ${JSON.stringify(task.semanticSchema)}`,
    `Input rows (${rows.length}):`,
    JSON.stringify(rows.slice(0, 40)),
  ].join('\n');
}

function mapRuntimeDataToItems(task, data) {
  if (!data || typeof data !== 'object') return [];
  const key =
    task.id === 'bg'
      ? 'goals'
      : task.id === 'br'
        ? 'rules'
        : task.id === 'nfr'
          ? 'nfrs'
          : task.id === 'scope'
            ? 'scopeItems'
            : task.id === 'bpm'
              ? 'processes'
              : task.id === 'interface'
                ? 'interfaces'
                : task.id === 'uc'
                  ? 'useCases'
                  : task.id === 'data'
                    ? 'entities'
                    : task.id === 'fr'
                      ? 'items'
                      : null;
  const arr = key && Array.isArray(data[key]) ? data[key] : Array.isArray(data.items) ? data.items : [];
  return arr.map((row, i) => ({
    logicalId: row.goalId || row.ruleId || row.nfrId || row.scopeId || row.processId || row.ifId || row.ucId || row.entityId || row.frId || row.id || `${task.id.toUpperCase()}-${i + 1}`,
    title: row.statement || row.name || row.goal || row.title || row.term || `Item ${i + 1}`,
    description: row.description || row.ruleAction || row.rationale || '',
    sourceRefs: row.evidence || row.sourceRefs || [],
    ...row,
  }));
}

/**
 * @param {{
 *   taskId: string,
 *   rows?: object[],
 *   pack?: object,
 *   forcePolicy?: string,
 *   env?: NodeJS.ProcessEnv,
 *   frRuntimeFn?: Function,
 * }} opts
 */
async function runSemanticTask(opts = {}) {
  const task = getSemanticTask(opts.taskId);
  if (!task) {
    return {
      status: TASK_POLICIES.SKIP,
      reason: 'UNKNOWN_TASK',
      items: [],
      llmCalls: 0,
      semanticOutput: null,
    };
  }

  const rows = Array.isArray(opts.rows) ? opts.rows : [];
  // FR uses snapshot/corpus; empty sheet is handled inside frRuntimeFn / G4 (data gate).
  const sourceEmpty = task.id === 'fr' ? false : isSourceEmpty(rows);
  const policy = resolveTaskPolicy(task.id, {
    sourceEmpty,
    forcePolicy: opts.forcePolicy,
    env: opts.env,
  });

  // FR special: always via Runtime wrapper when provided (RULE — no G4 bypass)
  if (task.id === 'fr' && typeof opts.frRuntimeFn === 'function') {
    const frPolicy =
      policy === TASK_POLICIES.SKIP ? TASK_POLICIES.SKIP : TASK_POLICIES.RUN;
    if (frPolicy === TASK_POLICIES.SKIP) {
      return {
        status: TASK_POLICIES.SKIP,
        reason: 'POLICY_SKIP',
        items: [],
        llmCalls: 0,
        semanticOutput: null,
        coverage: { status: 'NO_DATA', reason: 'POLICY_SKIP' },
      };
    }
    const frOut = await opts.frRuntimeFn(opts);
    return {
      status: TASK_POLICIES.RUN,
      reason: null,
      items: frOut?.items || [],
      llmCalls: Number(frOut?.llmCalls) || 0,
      semanticOutput: frOut?.semanticOutput || null,
      proposalFragment: frOut?.proposalFragment || null,
      meta: {
        ...(frOut?.meta || {}),
        paused: Boolean(frOut?.paused),
        blocked: Boolean(frOut?.blocked),
        g4Understanding: frOut?.g4Understanding,
        conflictAmbiguityGate: frOut?.conflictAmbiguityGate,
        g4Out: frOut?.g4Out || frOut?.meta?.g4Out,
        proposalFragment: frOut?.proposalFragment,
      },
      coverage: frOut?.coverage || { status: 'AVAILABLE' },
      paused: Boolean(frOut?.paused),
      blocked: Boolean(frOut?.blocked),
      g4Understanding: frOut?.g4Understanding || frOut?.semanticOutput,
      conflictAmbiguityGate: frOut?.conflictAmbiguityGate,
      g4Out: frOut?.g4Out || frOut?.meta?.g4Out,
    };
  }

  if (sourceEmpty || policy === TASK_POLICIES.SKIP) {
    return {
      status: TASK_POLICIES.SKIP,
      reason: sourceEmpty ? 'SOURCE_SHEET_EMPTY' : 'POLICY_SKIP',
      items: [],
      llmCalls: 0,
      semanticOutput: null,
      coverage: {
        status: 'NO_DATA',
        reason: sourceEmpty ? 'SOURCE_SHEET_EMPTY' : 'POLICY_SKIP',
      },
    };
  }

  if (policy === TASK_POLICIES.DETERMINISTIC_ONLY || !task.allowsRuntime) {
    const items = rows.map((row, i) =>
      stampExtracted(
        {
          logicalId: row.logicalId || row.id || row.externalId || `${task.engineId}-${i + 1}`,
          title: row.title || row.name || row.goal || row.term || `Item ${i + 1}`,
          description: row.description || row.text || '',
          sourceRefs: row.sourceRefs || [],
        },
        {
          engineId: task.engineId,
          section: task.section,
          index: i,
          defaultPrefix: String(task.id).toUpperCase(),
        }
      )
    );
    return {
      status: TASK_POLICIES.DETERMINISTIC_ONLY,
      reason: null,
      items,
      llmCalls: 0,
      semanticOutput: null,
      coverage: {
        status: items.length ? 'AVAILABLE' : 'NO_DATA',
        sourceStats: { sourceRows: rows.length, mappedRows: items.length, orphanRows: 0 },
      },
    };
  }

  // policy === RUN
  const runtime = await invokeSemanticRuntime({
    prompt: buildTaskPrompt(task, rows),
    env: opts.env,
  });

  if (!runtime.ok) {
    // Degrade: deterministic extract, do not fake AI_SYNTHESIS
    const items = rows.map((row, i) =>
      stampExtracted(
        {
          logicalId: row.logicalId || row.id || `${task.engineId}-${i + 1}`,
          title: row.title || row.name || `Item ${i + 1}`,
          description: row.description || '',
          sourceRefs: row.sourceRefs || [],
        },
        {
          engineId: task.engineId,
          section: task.section,
          index: i,
          defaultPrefix: String(task.id).toUpperCase(),
          rule: 'DEGRADE_AFTER_RUNTIME_FAIL',
        }
      )
    );
    return {
      status: TASK_POLICIES.DETERMINISTIC_ONLY,
      reason: runtime.reason || 'RUNTIME_DEGRADED',
      items,
      llmCalls: runtime.skipped ? 0 : 1,
      semanticOutput: null,
      error: runtime.error,
      coverage: {
        status: 'PARTIAL',
        reason: runtime.reason || 'RUNTIME_DEGRADED',
        sourceStats: { sourceRows: rows.length, mappedRows: items.length, orphanRows: 0 },
      },
    };
  }

  const mapped = mapRuntimeDataToItems(task, runtime.data);
  const items = mapped.map((row, i) =>
    stampAiSynthesis(row, {
      engineId: task.engineId,
      section: task.section,
      index: i,
      taskId: task.id,
      defaultPrefix: String(task.id).toUpperCase(),
    })
  );

  return {
    status: TASK_POLICIES.RUN,
    reason: null,
    items,
    llmCalls: 1,
    semanticOutput: runtime.data,
    usage: runtime.usage,
    coverage: {
      status: items.length ? 'AVAILABLE' : 'PARTIAL',
      sourceStats: { sourceRows: rows.length, mappedRows: items.length, orphanRows: 0 },
    },
  };
}

module.exports = {
  runSemanticTask,
  isSourceEmpty,
};
