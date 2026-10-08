/**
 * AnalysisEngineRegistry — catalog + dependency metadata.
 * Registry order is NOT execution order (orchestrator builds DAG).
 * Meta Gate is NOT registered here.
 */

const KIND = Object.freeze({ SECTION: 'SECTION', CROSS_CUTTING: 'CROSS_CUTTING' });

/**
 * @typedef {{
 *   id: string,
 *   section: string,
 *   kind: string,
 *   mode: string,
 *   dependsOn: string[],
 *   optionalDependsOn: string[],
 *   writesSection: string,
 * }} RegistryEntry
 */

/** @type {RegistryEntry[]} */
const ANALYSIS_ENGINE_REGISTRY = Object.freeze([
  {
    id: 'bg',
    section: 'businessGoals',
    kind: KIND.SECTION,
    mode: 'source_ingest',
    dependsOn: [],
    optionalDependsOn: [],
    writesSection: 'businessGoals',
  },
  {
    id: 'br',
    section: 'businessRules',
    kind: KIND.SECTION,
    mode: 'source_ingest',
    dependsOn: [],
    optionalDependsOn: ['bg'],
    writesSection: 'businessRules',
  },
  {
    id: 'nfr',
    section: 'nonFunctionalRequirements',
    kind: KIND.SECTION,
    mode: 'source_ingest',
    dependsOn: [],
    optionalDependsOn: [],
    writesSection: 'nonFunctionalRequirements',
  },
  {
    id: 'scope',
    section: 'scope',
    kind: KIND.SECTION,
    mode: 'source_ingest',
    dependsOn: [],
    optionalDependsOn: [],
    writesSection: 'scope',
  },
  {
    id: 'bpm',
    section: 'processes',
    kind: KIND.SECTION,
    mode: 'source_ingest',
    dependsOn: [],
    optionalDependsOn: [],
    writesSection: 'processes',
  },
  {
    id: 'interface',
    section: 'interfaces',
    kind: KIND.SECTION,
    mode: 'source_ingest',
    dependsOn: [],
    optionalDependsOn: [],
    writesSection: 'interfaces',
  },
  {
    id: 'fr',
    section: 'functionalRequirements',
    kind: KIND.SECTION,
    mode: 'g4_semantic',
    dependsOn: [],
    optionalDependsOn: ['br'],
    writesSection: 'functionalRequirements',
  },
  {
    id: 'uc',
    section: 'useCases',
    kind: KIND.SECTION,
    mode: 'heuristic',
    dependsOn: ['fr'],
    optionalDependsOn: [],
    writesSection: 'useCases',
  },
  {
    id: 'data',
    section: 'entities',
    kind: KIND.SECTION,
    mode: 'source_ingest',
    dependsOn: [],
    optionalDependsOn: ['fr'],
    writesSection: 'entities',
  },
  {
    id: 'glossary',
    section: 'glossary',
    kind: KIND.SECTION,
    mode: 'collect',
    dependsOn: ['bg', 'br', 'bpm', 'fr', 'uc', 'nfr', 'scope', 'interface', 'data'],
    optionalDependsOn: [],
    writesSection: 'glossary',
  },
  {
    id: 'assumption',
    section: 'assumptions',
    kind: KIND.SECTION,
    mode: 'collect_lift',
    dependsOn: ['bg', 'br', 'bpm', 'fr', 'uc', 'nfr', 'scope', 'interface', 'data', 'glossary'],
    optionalDependsOn: [],
    writesSection: 'assumptions',
  },
  {
    id: 'traceability',
    section: 'traceability',
    kind: KIND.CROSS_CUTTING,
    mode: 'deterministic_map',
    dependsOn: [
      'bg',
      'br',
      'bpm',
      'fr',
      'uc',
      'nfr',
      'scope',
      'interface',
      'data',
      'glossary',
      'assumption',
    ],
    optionalDependsOn: [],
    writesSection: 'traceability',
  },
]);

const REGISTRY_BY_ID = Object.freeze(
  Object.fromEntries(ANALYSIS_ENGINE_REGISTRY.map((e) => [e.id, e]))
);

const SECTION_ENGINE_COUNT = 12;

function listRegistryEngines() {
  return [...ANALYSIS_ENGINE_REGISTRY];
}

function getRegistryEntry(id) {
  return REGISTRY_BY_ID[String(id || '')] || null;
}

function assertRegistryComplete() {
  if (ANALYSIS_ENGINE_REGISTRY.length !== SECTION_ENGINE_COUNT) {
    const err = new Error(
      `Registry must have ${SECTION_ENGINE_COUNT} engines, got ${ANALYSIS_ENGINE_REGISTRY.length}`
    );
    err.code = 'REGISTRY_INCOMPLETE';
    throw err;
  }
  const ids = new Set(ANALYSIS_ENGINE_REGISTRY.map((e) => e.id));
  if (ids.has('meta') || ids.has('metaGate')) {
    const err = new Error('Meta Gate must not be in AnalysisEngineRegistry');
    err.code = 'META_IN_REGISTRY';
    throw err;
  }
  return true;
}

/**
 * Build adjacency for DAG (hard dependsOn only — optionalDependsOn do not block).
 * @returns {Map<string, string[]>} id → hard dependency ids
 */
function buildDependencyMap() {
  const map = new Map();
  for (const e of ANALYSIS_ENGINE_REGISTRY) {
    map.set(e.id, [...(e.dependsOn || [])]);
  }
  return map;
}

/**
 * Topological layers for sequential batching (independent nodes same layer).
 * Does not imply Registry array order equals execution order.
 * @returns {string[][]}
 */
function topologicalLayers() {
  const deps = buildDependencyMap();
  const remaining = new Set(deps.keys());
  const done = new Set();
  const layers = [];

  while (remaining.size) {
    const layer = [];
    for (const id of remaining) {
      const need = deps.get(id) || [];
      if (need.every((d) => done.has(d))) layer.push(id);
    }
    if (!layer.length) {
      const err = new Error('Cycle in AnalysisEngineRegistry dependsOn');
      err.code = 'REGISTRY_DAG_CYCLE';
      throw err;
    }
    layer.sort();
    layers.push(layer);
    for (const id of layer) {
      remaining.delete(id);
      done.add(id);
    }
  }
  return layers;
}

module.exports = {
  KIND,
  ANALYSIS_ENGINE_REGISTRY,
  REGISTRY_BY_ID,
  SECTION_ENGINE_COUNT,
  listRegistryEngines,
  getRegistryEntry,
  assertRegistryComplete,
  buildDependencyMap,
  topologicalLayers,
};
