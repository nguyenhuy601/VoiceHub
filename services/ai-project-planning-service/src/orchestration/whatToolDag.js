/**
 * WHAT tool dependency DAG — peer tools (same class as HOW).
 * Edges: prerequisite → dependent. Layer numbers are Kahn topo only.
 *
 * WhatFrTool deps=[] (∥ BG/BR). UC/Data wait on FR.
 * Glossary / Assumption / Traceability / Interface: not in active registry — omitted.
 */

const { WHAT_FR_TOOL, WHAT_SECTION_TOOLS } = require('../whatSecs/sectionCatalog');

/** Canonical peer order — toolNames match sectionCatalog / planningToolCatalog. */
const WHAT_PHASE_TOOL_STEPS = Object.freeze([
  { toolName: 'WhatBGTool', engineId: 'bg' },
  { toolName: 'WhatBRTool', engineId: 'br' },
  { toolName: 'WhatNFRTool', engineId: 'nfr' },
  { toolName: 'WhatScopeTool', engineId: 'scope' },
  { toolName: 'WhatBPMTool', engineId: 'bpm' },
  { toolName: 'WhatActorsTool', engineId: 'actors' },
  { toolName: WHAT_FR_TOOL, engineId: 'fr' },
  { toolName: 'WhatUCTool', engineId: 'uc' },
  { toolName: 'WhatDataTool', engineId: 'data' },
]);

/** @type {Readonly<Record<string, readonly string[]>>} */
const WHAT_TOOL_DEPENDENCIES = Object.freeze({
  WhatBGTool: Object.freeze([]),
  WhatBRTool: Object.freeze([]),
  WhatNFRTool: Object.freeze([]),
  WhatScopeTool: Object.freeze([]),
  WhatBPMTool: Object.freeze([]),
  WhatActorsTool: Object.freeze([]),
  [WHAT_FR_TOOL]: Object.freeze([]),
  WhatUCTool: Object.freeze([WHAT_FR_TOOL]),
  WhatDataTool: Object.freeze([WHAT_FR_TOOL]),
});

const CANONICAL_ORDER = Object.freeze(WHAT_PHASE_TOOL_STEPS.map((s) => s.toolName));

const TOOL_BY_NAME = Object.freeze(
  Object.fromEntries(WHAT_PHASE_TOOL_STEPS.map((s) => [s.toolName, s]))
);

/**
 * Topological layers for a subset of tools (Kahn).
 * Edges to tools not in `toolNames` are ignored (outputs assumed already in container).
 *
 * @param {string[]} toolNames
 * @returns {string[][]} layers — tools in each layer may run in parallel
 */
function buildWhatToolLayers(toolNames) {
  const selected = [];
  const seen = new Set();
  const orderIndex = new Map(CANONICAL_ORDER.map((n, i) => [n, i]));

  for (const raw of toolNames || []) {
    const name = String(raw || '').trim();
    if (!name || seen.has(name)) continue;
    if (!(name in WHAT_TOOL_DEPENDENCIES) && !orderIndex.has(name)) continue;
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
    const deps = WHAT_TOOL_DEPENDENCIES[name] || [];
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
 * @param {string[]} toolNames
 * @returns {Array<{ toolName: string, autoConfirm?: boolean }>}
 */
function resolveWhatStepsForToolNames(toolNames) {
  const names = Array.isArray(toolNames) ? toolNames : [];
  const steps = [];
  const seen = new Set();
  for (const raw of names) {
    const name = String(raw || '').trim();
    if (!name || seen.has(name)) continue;
    if (!TOOL_BY_NAME[name]) continue;
    seen.add(name);
    steps.push({ toolName: name, autoConfirm: true });
  }
  return steps;
}

/** Catalog section tools that are also phase DAG peers (excludes FR — listed separately). */
function listWhatSectionPeerToolNames() {
  return WHAT_SECTION_TOOLS.map((row) => row.toolName).filter((n) => n in WHAT_TOOL_DEPENDENCIES);
}

module.exports = {
  WHAT_PHASE_TOOL_STEPS,
  WHAT_TOOL_DEPENDENCIES,
  CANONICAL_ORDER,
  TOOL_BY_NAME,
  buildWhatToolLayers,
  resolveWhatStepsForToolNames,
  listWhatSectionPeerToolNames,
};
