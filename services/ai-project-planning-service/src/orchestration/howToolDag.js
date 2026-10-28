/**
 * HOW tool dependency DAG — soft guide for ReAct selectTools + FE layers.
 * Graph does not force waves; selectTools filters calls whose deps are unmet.
 * Edges: prerequisite → dependent.
 */

const { HOW_PHASE_TOOL_STEPS } = require('./jobToToolsMap');

/** @type {Readonly<Record<string, readonly string[]>>} */
const HOW_TOOL_DEPENDENCIES = Object.freeze({
  // Wbs đọc Gate1 approvedBacklogStructure (Story = FR); không BacklogMap phase.
  WbsTool: Object.freeze([]),
  DependencyTool: Object.freeze(['WbsTool']),
  // Architecture, Effort, Deploy, Sequencing, Matching / BacklogMap are not phase catalog nodes.
  // Lịch và sprint sống trong ScheduleTool (CPM gọi nội bộ khi đóng gói lịch).
  RiskTool: Object.freeze(['DependencyTool']),
  QualityPlanTool: Object.freeze(['RiskTool']),
  ScheduleTool: Object.freeze(['DependencyTool']),
  // ProjectPlanTool removed from ReAct — finalizePlan graph node after required sections.
});

const CANONICAL_ORDER = Object.freeze(
  HOW_PHASE_TOOL_STEPS.map((s) => s.toolName)
);

/**
 * Successful HOW tools: prefer ToolExecution succeeded+validated; legacy toolResults fallback.
 * @param {object} state
 * @returns {Set<string>}
 */
function successfulHowTools(state) {
  const { succeededValidatedTools } = require('./toolExecutionContract');
  return succeededValidatedTools(state);
}

/**
 * Soft deps: tools not listed in HOW_TOOL_DEPENDENCIES (optional secs) are always ready.
 * @param {string} toolName
 * @param {Set<string>} done
 */
function howToolDepsSatisfied(toolName, done) {
  const name = String(toolName || '').trim();
  if (!name) return false;
  if (!(name in HOW_TOOL_DEPENDENCIES)) return true;
  const deps = HOW_TOOL_DEPENDENCIES[name] || [];
  return deps.every((dep) => done.has(dep));
}

/** Phase catalog tools that must succeed before HOW emitReady (Gate 2). */
function requiredHowPhaseTools() {
  return [...CANONICAL_ORDER];
}

/**
 * If LLM picks Schedule before Dependency (or ProjectPlan before Quality/Schedule),
 * rewrite to an unmet prerequisite that is itself ready — prefer CANONICAL_ORDER
 * among unmet deps so Quality is not starved while ProjectPlan→Schedule loops.
 * @param {Set<string>} done
 * @param {string} toolName
 * @returns {string|null} ready tool to run now
 */
function resolveHowToolOrUnmetDep(done, toolName) {
  const name = String(toolName || '').trim();
  if (!name || done.has(name)) return null;
  if (howToolDepsSatisfied(name, done)) return name;
  if (!(name in HOW_TOOL_DEPENDENCIES)) return name;

  const orderIndex = new Map(CANONICAL_ORDER.map((n, i) => [n, i]));
  let cursor = name;
  const seen = new Set();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    if (done.has(cursor)) return null;
    if (howToolDepsSatisfied(cursor, done)) return cursor;
    const unmet = (HOW_TOOL_DEPENDENCIES[cursor] || []).filter((dep) => !done.has(dep));
    if (!unmet.length) return null;
    unmet.sort(
      (a, b) =>
        (orderIndex.has(a) ? orderIndex.get(a) : 999) -
        (orderIndex.has(b) ? orderIndex.get(b) : 999)
    );
    cursor = unmet[0];
  }
  return null;
}

/**
 * Topological layers for a subset of tools (Kahn).
 * Edges to tools not in `toolNames` are ignored (outputs assumed already in container).
 *
 * @param {string[]} toolNames
 * @returns {string[][]} layers — tools in each layer may run in parallel
 */
function buildHowToolLayers(toolNames) {
  const selected = [];
  const seen = new Set();
  const orderIndex = new Map(CANONICAL_ORDER.map((n, i) => [n, i]));

  for (const raw of toolNames || []) {
    const name = String(raw || '').trim();
    if (!name || seen.has(name)) continue;
    if (!(name in HOW_TOOL_DEPENDENCIES) && !orderIndex.has(name)) continue;
    seen.add(name);
    selected.push(name);
  }

  if (!selected.length) return [];

  const selectedSet = new Set(selected);
  /** @type {Map<string, Set<string>>} */
  const preds = new Map();
  /** @type {Map<string, Set<string>>} */
  const succs = new Map();

  for (const name of selected) {
    preds.set(name, new Set());
    succs.set(name, new Set());
  }

  for (const name of selected) {
    const deps = HOW_TOOL_DEPENDENCIES[name] || [];
    for (const dep of deps) {
      if (!selectedSet.has(dep)) continue;
      preds.get(name).add(dep);
      succs.get(dep).add(name);
    }
  }

  const layers = [];
  let remaining = new Set(selected);

  while (remaining.size) {
    const ready = [...remaining].filter((n) => preds.get(n).size === 0);
    if (!ready.length) {
      // Cycle or bad subset — fall back to canonical order one-per-layer
      const fallback = [...remaining].sort(
        (a, b) => (orderIndex.get(a) ?? 999) - (orderIndex.get(b) ?? 999)
      );
      for (const n of fallback) layers.push([n]);
      break;
    }
    ready.sort(
      (a, b) => (orderIndex.get(a) ?? 999) - (orderIndex.get(b) ?? 999)
    );
    layers.push(ready);
    for (const n of ready) {
      remaining.delete(n);
      for (const s of succs.get(n) || []) {
        preds.get(s)?.delete(n);
      }
    }
  }

  return layers;
}

/**
 * @param {Array<{ toolName: string }>} steps
 * @returns {Array<Array<{ toolName: string, stepIndex: number }>>}
 */
function buildHowToolStepLayers(steps) {
  const list = Array.isArray(steps) ? steps : [];
  const byName = new Map();
  list.forEach((step, stepIndex) => {
    const toolName = step?.toolName;
    if (!toolName || byName.has(toolName)) return;
    byName.set(toolName, { toolName, stepIndex, ...step });
  });
  const layers = buildHowToolLayers([...byName.keys()]);
  return layers.map((names) =>
    names.map((toolName) => byName.get(toolName)).filter(Boolean)
  );
}

module.exports = {
  HOW_TOOL_DEPENDENCIES,
  CANONICAL_ORDER,
  successfulHowTools,
  howToolDepsSatisfied,
  requiredHowPhaseTools,
  resolveHowToolOrUnmetDep,
  buildHowToolLayers,
  buildHowToolStepLayers,
};
