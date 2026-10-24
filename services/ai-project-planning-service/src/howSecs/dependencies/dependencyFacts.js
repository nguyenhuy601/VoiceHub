/**
 * Dependency Facts — candidate tool + SRS edges only (no same-area invent).
 */

const { runDependencyCandidateTool } = require('../../engines/dependencyCandidateEngine');
const { buildDependencyEdgesFromSrs } = require('../../engines/dependencyFromSrs');

function buildDependencyFacts({ pack = {}, container = {}, allowLists = {}, planningHints = null } = {}) {
  const candidateTool = runDependencyCandidateTool({ container, pack, planningHints });
  const tasks = Array.isArray(container?.planning?.tasks) ? container.planning.tasks : [];
  const known = new Set(allowLists.taskIds || []);
  const srsEdges = (buildDependencyEdgesFromSrs({ tasks, pack }) || []).filter(
    (e) => known.has(String(e.from)) && known.has(String(e.to))
  );

  const candidates = (candidateTool.data?.candidates || []).filter(
    (c) =>
      known.has(String(c.predecessorTaskId)) && known.has(String(c.successorTaskId))
  );

  return {
    candidates,
    srsEdges,
    unresolvedTaskIds: (candidateTool.data?.unresolvedTaskIds || []).filter((id) =>
      known.has(String(id))
    ),
    allowLists: { taskIds: [...known] },
    meta: {
      candidateCount: candidates.length,
      srsEdgeCount: srsEdges.length,
      inventForbidden: true,
      noSameAreaHeuristic: true,
    },
    candidateTool,
  };
}

function depTypeOf(value) {
  const token = String(value || '').trim().toUpperCase();
  if (token === 'FS' || token === 'SS' || token === 'FF' || token === 'SF') return token;
  return null;
}

/**
 * Stable evidence ids for one facts payload.
 * from = successor, to = predecessor — same direction the LLM must emit.
 */
function buildDependencyEvidenceCatalog(facts = {}) {
  const byId = new Map();
  const candidates = (facts.candidates || []).map((row, index) => {
    const id = `DEP-CAND-${String(index + 1).padStart(2, '0')}`;
    const entry = {
      id,
      kind: 'candidate',
      from: String(row?.successorTaskId || '').trim(),
      to: String(row?.predecessorTaskId || '').trim(),
      candidateRule: String(row?.candidateRule || ''),
      strength: String(row?.strength || ''),
    };
    byId.set(id, entry);
    return entry;
  });
  const srsEdges = (facts.srsEdges || []).map((edge, index) => {
    const id = String(edge?.edgeId || edge?.id || `DEP-SRS-${String(index + 1).padStart(2, '0')}`);
    const entry = {
      id,
      kind: 'srs',
      from: String(edge?.from || '').trim(),
      to: String(edge?.to || '').trim(),
      depType: depTypeOf(edge?.depType || edge?.type) || 'FS',
    };
    if (!byId.has(id)) byId.set(id, entry);
    return entry;
  });
  return { byId, candidates, srsEdges };
}

module.exports = { buildDependencyFacts, buildDependencyEvidenceCatalog, depTypeOf };
