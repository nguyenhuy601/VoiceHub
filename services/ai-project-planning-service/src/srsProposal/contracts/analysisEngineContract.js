/**
 * AnalysisEngineContract — EngineResult shape + validators.
 * Engine ≠ AI; Understanding optional.
 */

const COVERAGE_STATUS = Object.freeze(['NO_DATA', 'PARTIAL', 'AVAILABLE']);
const EXECUTION_STATUS = Object.freeze(['SUCCESS', 'FAILED']);

/**
 * @param {object} partial
 * @returns {object}
 */
function createEngineResult(partial = {}) {
  const executionStatus = String(partial.execution?.status || partial.executionStatus || 'SUCCESS')
    .toUpperCase();
  const failed = executionStatus === 'FAILED';

  return {
    execution: {
      status: failed ? 'FAILED' : 'SUCCESS',
      diagnostics: Array.isArray(partial.execution?.diagnostics)
        ? partial.execution.diagnostics
        : Array.isArray(partial.diagnostics)
          ? partial.diagnostics
          : [],
    },
    items: Array.isArray(partial.items) ? partial.items : [],
    relations: Array.isArray(partial.relations) ? partial.relations : [],
    clarificationQuestions: Array.isArray(partial.clarificationQuestions)
      ? partial.clarificationQuestions
      : [],
    coverage: failed
      ? null
      : {
          status: COVERAGE_STATUS.includes(String(partial.coverage?.status || '').toUpperCase())
            ? String(partial.coverage.status).toUpperCase()
            : Array.isArray(partial.items) && partial.items.length
              ? 'AVAILABLE'
              : 'NO_DATA',
          reason: partial.coverage?.reason || null,
          sourceStats: partial.coverage?.sourceStats || null,
        },
    validation: {
      errors: Array.isArray(partial.validation?.errors) ? partial.validation.errors : [],
      warnings: Array.isArray(partial.validation?.warnings) ? partial.validation.warnings : [],
    },
    meta: {
      engineId: partial.meta?.engineId || partial.engineId || null,
      section: partial.meta?.section || partial.section || null,
      version: partial.meta?.version || 1,
      ...(partial.meta || {}),
    },
  };
}

/**
 * SUCCESS + empty items + NO_DATA for missing source (not FAILED).
 */
function noDataResult(meta, reason = 'SOURCE_UNAVAILABLE') {
  return createEngineResult({
    execution: { status: 'SUCCESS' },
    items: [],
    coverage: { status: 'NO_DATA', reason },
    validation: { errors: [], warnings: [] },
    meta,
  });
}

function failedResult(meta, diagnostics = []) {
  return createEngineResult({
    execution: { status: 'FAILED', diagnostics },
    items: [],
    coverage: null,
    meta,
  });
}

/**
 * @param {unknown} result
 * @returns {boolean}
 */
function assertEngineResultShape(result) {
  if (!result || typeof result !== 'object') {
    const err = new Error('EngineResult required');
    err.code = 'INVALID_ENGINE_RESULT';
    throw err;
  }
  const status = String(result.execution?.status || '').toUpperCase();
  if (!EXECUTION_STATUS.includes(status)) {
    const err = new Error('EngineResult.execution.status invalid');
    err.code = 'INVALID_ENGINE_RESULT';
    throw err;
  }
  if (!Array.isArray(result.items)) {
    const err = new Error('EngineResult.items must be array');
    err.code = 'INVALID_ENGINE_RESULT';
    throw err;
  }
  if (status === 'SUCCESS') {
    const cov = String(result.coverage?.status || '').toUpperCase();
    if (!COVERAGE_STATUS.includes(cov)) {
      const err = new Error('EngineResult.coverage.status invalid on SUCCESS');
      err.code = 'INVALID_ENGINE_RESULT';
      throw err;
    }
  }
  if (!result.validation || !Array.isArray(result.validation.errors)) {
    const err = new Error('EngineResult.validation.errors required');
    err.code = 'INVALID_ENGINE_RESULT';
    throw err;
  }
  return true;
}

/** RULE-BOUNDARY-01: engine result must never carry srsDraft */
function assertNoSrsDraftInEngineResult(result) {
  if (result?.srsDraft != null || result?.analyses?.srsDraft != null) {
    const err = new Error('Engines must not produce srsDraft (RULE-BOUNDARY-01)');
    err.code = 'ENGINE_SRS_BOUNDARY';
    throw err;
  }
  return true;
}

module.exports = {
  COVERAGE_STATUS,
  EXECUTION_STATUS,
  createEngineResult,
  noDataResult,
  failedResult,
  assertEngineResultShape,
  assertNoSrsDraftInEngineResult,
};
