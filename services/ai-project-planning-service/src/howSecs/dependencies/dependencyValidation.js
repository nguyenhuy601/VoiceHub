/**
 * Dependency result validation — status-aware (D2/D3).
 * RULE-DEP-01 only for COMPLETE_NO_EDGES (LLM OK intentional empty).
 * Empty from SKIPPED/FAILED/INCOMPLETE/cycle ≠ succeeded analysis.
 */

const { ANALYSIS_STATUS } = require('./dependencyAnalysisStatus');

function asIdSet(list) {
  const set = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const id = String(raw || '').trim();
    if (id) set.add(id);
  }
  return set;
}

function edgeEndpoints(edge) {
  const from = String(edge?.from || edge?.source || edge?.predecessorId || '').trim();
  const to = String(edge?.to || edge?.target || edge?.successorId || '').trim();
  return { from, to };
}

function collectEdges(result) {
  if (Array.isArray(result?.schedulableEdges)) return result.schedulableEdges;
  if (Array.isArray(result?.edges)) return result.edges;
  if (Array.isArray(result?.dependencies)) return result.dependencies;
  if (Array.isArray(result?.items)) return result.items;
  return [];
}

function resolveAnalysisStatus(result) {
  const explicit =
    result?.analysisStatus ||
    result?.meta?.analysisStatus ||
    result?.assessment?.conclusion ||
    '';
  const token = String(explicit || '').trim().toUpperCase();
  if (token && Object.values(ANALYSIS_STATUS).includes(token)) return token;

  const source = String(result?.meta?.source || result?.meta?.fallbackReason || '');
  if (source === 'semantic_incomplete') return ANALYSIS_STATUS.SEMANTIC_INCOMPLETE;
  if (source === 'llm_skipped' || source === 'LLM_off' || source === 'llm_disabled') {
    return ANALYSIS_STATUS.SKIPPED;
  }
  if (source === 'llm_failed' || source === 'parse_empty') return ANALYSIS_STATUS.FAILED;
  return null;
}

/**
 * @param {object|null} result
 * @param {{ allowTaskIds?: Iterable<string>|null, analyzedUnitIds?: Iterable<string>|null }} [opts]
 */
function assessDependencyResult(result, opts = {}) {
  const analysisStatus = resolveAnalysisStatus(result);
  const scheduleReady = result?.scheduleReady ?? result?.meta?.scheduleReady;
  const analysisComplete = result?.analysisComplete ?? result?.meta?.analysisComplete;
  const executionTerminal = result?.executionTerminal ?? result?.meta?.executionTerminal ?? true;

  if (analysisStatus === ANALYSIS_STATUS.SEMANTIC_INCOMPLETE) {
    return {
      status: 'incomplete',
      analysisStatus,
      executionTerminal: true,
      analysisComplete: false,
      scheduleReady: false,
      assessment: {
        coverageComplete: false,
        unresolvedCount: 1,
        conclusion: ANALYSIS_STATUS.SEMANTIC_INCOMPLETE,
      },
      validation: { referencesValid: false, acyclic: true },
    };
  }

  if (analysisStatus === ANALYSIS_STATUS.SKIPPED) {
    return {
      status: 'skipped',
      analysisStatus,
      executionTerminal: true,
      analysisComplete: false,
      scheduleReady: false,
      assessment: {
        coverageComplete: false,
        unresolvedCount: 0,
        conclusion: ANALYSIS_STATUS.SKIPPED,
      },
      validation: { referencesValid: true, acyclic: true },
    };
  }

  if (analysisStatus === ANALYSIS_STATUS.FAILED) {
    return {
      status: 'failed',
      analysisStatus,
      executionTerminal: true,
      analysisComplete: false,
      scheduleReady: false,
      assessment: {
        coverageComplete: false,
        unresolvedCount: 1,
        conclusion: ANALYSIS_STATUS.FAILED,
      },
      validation: { referencesValid: true, acyclic: true },
    };
  }

  if (analysisStatus === ANALYSIS_STATUS.INCOMPLETE) {
    return {
      status: 'incomplete',
      analysisStatus,
      executionTerminal: true,
      analysisComplete: false,
      scheduleReady: false,
      assessment: {
        coverageComplete: false,
        unresolvedCount: (result?.openQuestions || []).length || 1,
        conclusion: ANALYSIS_STATUS.INCOMPLETE,
      },
      validation: { referencesValid: true, acyclic: true },
    };
  }

  if (
    analysisStatus === ANALYSIS_STATUS.INVALID ||
    analysisStatus === ANALYSIS_STATUS.PARTIAL
  ) {
    const edges = collectEdges(result);
    return {
      status: analysisStatus === ANALYSIS_STATUS.INVALID ? 'failed' : 'partial',
      analysisStatus,
      executionTerminal: true,
      analysisComplete: false,
      scheduleReady: Boolean(scheduleReady) && edges.length > 0,
      assessment: {
        coverageComplete: false,
        unresolvedCount: (result?.openQuestions || []).length || 1,
        conclusion: analysisStatus,
      },
      validation: {
        referencesValid: true,
        acyclic: analysisStatus !== ANALYSIS_STATUS.INVALID,
      },
      edges,
    };
  }

  // RULE-DEP-01: intentional empty after successful LLM analysis
  if (analysisStatus === ANALYSIS_STATUS.COMPLETE_NO_EDGES) {
    return {
      status: 'succeeded',
      analysisStatus,
      executionTerminal: true,
      analysisComplete: true,
      scheduleReady: true,
      assessment: {
        coverageComplete: true,
        unresolvedCount: 0,
        conclusion: ANALYSIS_STATUS.COMPLETE_NO_EDGES,
      },
      validation: { referencesValid: true, acyclic: true },
      edges: [],
    };
  }

  const edges = collectEdges(result);
  const allow = asIdSet(opts.allowTaskIds);
  const analyzed = asIdSet(
    opts.analyzedUnitIds != null
      ? opts.analyzedUnitIds
      : result?.meta?.analyzedTaskIds || result?.assessment?.analyzedTaskIds || []
  );

  let unresolvedCount = 0;
  let referencesValid = true;
  for (const edge of edges) {
    const { from, to } = edgeEndpoints(edge);
    if (!from || !to || from === to) {
      referencesValid = false;
      unresolvedCount += 1;
      continue;
    }
    if (allow.size && (!allow.has(from) || !allow.has(to))) {
      referencesValid = false;
      unresolvedCount += 1;
    }
  }

  // Legacy path without analysisStatus: empty without COMPLETE_NO_EDGES ⇒ incomplete
  if (!analysisStatus && edges.length === 0) {
    const verifiedEmpty =
      result?.meta?.coverageVerified === true &&
      (result?.assessment?.conclusion === 'NO_SUPPORTED_DEPENDENCIES' ||
        result?.assessment?.conclusion === ANALYSIS_STATUS.COMPLETE_NO_EDGES);
    if (!verifiedEmpty) {
      return {
        status: 'incomplete',
        analysisStatus: ANALYSIS_STATUS.INCOMPLETE,
        executionTerminal: Boolean(executionTerminal),
        analysisComplete: false,
        scheduleReady: false,
        assessment: {
          coverageComplete: false,
          unresolvedCount: 1,
          conclusion: 'EMPTY_WITHOUT_COMPLETE_STATUS',
        },
        validation: { referencesValid: true, acyclic: true },
      };
    }
    return {
      status: 'succeeded',
      analysisStatus: ANALYSIS_STATUS.COMPLETE_NO_EDGES,
      executionTerminal: true,
      analysisComplete: true,
      scheduleReady: true,
      assessment: {
        coverageComplete: true,
        unresolvedCount: 0,
        conclusion: ANALYSIS_STATUS.COMPLETE_NO_EDGES,
      },
      validation: { referencesValid: true, acyclic: true },
      edges: [],
    };
  }

  if (!referencesValid) {
    return {
      status: 'failed',
      analysisStatus: ANALYSIS_STATUS.INVALID,
      executionTerminal: true,
      analysisComplete: false,
      scheduleReady: false,
      assessment: {
        coverageComplete: Boolean(analysisComplete),
        unresolvedCount,
        conclusion: 'INVALID_REFERENCES',
      },
      validation: { referencesValid: false, acyclic: true },
    };
  }

  if (analysisStatus === ANALYSIS_STATUS.DEPENDENCIES_FOUND || edges.length > 0) {
    return {
      status: 'succeeded',
      analysisStatus: analysisStatus || ANALYSIS_STATUS.DEPENDENCIES_FOUND,
      executionTerminal: true,
      analysisComplete: analysisComplete !== false,
      scheduleReady: scheduleReady !== false,
      assessment: {
        coverageComplete: true,
        unresolvedCount: 0,
        conclusion: ANALYSIS_STATUS.DEPENDENCIES_FOUND,
      },
      validation: { referencesValid: true, acyclic: true },
      edges,
      inputTaskSetHash: result?.inputTaskSetHash || null,
    };
  }

  return {
    status: 'incomplete',
    analysisStatus: ANALYSIS_STATUS.INCOMPLETE,
    executionTerminal: Boolean(executionTerminal),
    analysisComplete: false,
    scheduleReady: false,
    assessment: {
      coverageComplete: false,
      unresolvedCount: unresolvedCount || 1,
      conclusion: 'COVERAGE_GAPS',
    },
    validation: { referencesValid, acyclic: true },
  };
}

module.exports = {
  assessDependencyResult,
  collectEdges,
  edgeEndpoints,
  resolveAnalysisStatus,
};
