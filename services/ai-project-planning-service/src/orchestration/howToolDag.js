/**
 * HOW tool dependency DAG — max parallel among independent tools.
 * Edges: prerequisite → dependent (hard unless noted soft).
 */

const { HOW_PHASE_TOOL_STEPS } = require('./jobToToolsMap');

/** @type {Readonly<Record<string, readonly string[]>>} */
const HOW_TOOL_DEPENDENCIES = Object.freeze({
  CapabilityTool: Object.freeze([]),
  // Pattern C: Capability ∥ BacklogMap; Wbs depends on backlog (Pattern A)
  BacklogMapTool: Object.freeze([]),
  WbsTool: Object.freeze(['BacklogMapTool']),
  // Arch after Wbs — never ∥ Wbs (Arch used to echo planning.tasks and wipe leaves)
  ArchitectureTool: Object.freeze(['CapabilityTool', 'WbsTool']),
  DependencyTool: Object.freeze(['WbsTool']),
  RiskTool: Object.freeze(['ArchitectureTool', 'DependencyTool']),
  // After Risk, before Effort (QA informs estimates)
  QualityPlanTool: Object.freeze(['RiskTool', 'ArchitectureTool']),
  EffortTool: Object.freeze([
    'WbsTool',
    'DependencyTool',
    'ArchitectureTool',
    'QualityPlanTool',
  ]),
  SequencingTool: Object.freeze(['DependencyTool', 'EffortTool']),
  EmployeeMatchingTool: Object.freeze(['EffortTool', 'SequencingTool']),
  ScheduleTool: Object.freeze([
    'DependencyTool',
    'SequencingTool',
    'EmployeeMatchingTool',
  ]),
  DeployPlanTool: Object.freeze(['ScheduleTool']),
  ProjectPlanTool: Object.freeze([
    'ScheduleTool',
    'DeployPlanTool',
    'EffortTool',
    'EmployeeMatchingTool',
    'SequencingTool',
    'QualityPlanTool',
  ]),
});

const CANONICAL_ORDER = Object.freeze(
  HOW_PHASE_TOOL_STEPS.map((s) => s.toolName)
);

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
  buildHowToolLayers,
  buildHowToolStepLayers,
};
