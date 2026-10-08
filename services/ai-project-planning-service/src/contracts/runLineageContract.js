/**
 * Run lineage — generationId / parentRunId (S1, S4, RULE-S07).
 * generationId = String(runId) while 1 run = 1 generation.
 */

/**
 * @param {string|null|undefined} runId
 * @returns {string|null}
 */
function normalizeGenerationId(runId) {
  const id = String(runId || '').trim();
  return id || null;
}

/**
 * @param {string|null|undefined} parentRunId
 * @returns {string|null}
 */
function normalizeParentRunId(parentRunId) {
  const id = String(parentRunId || '').trim();
  return id || null;
}

/**
 * Validate parent run for Loop1 child creation.
 * @param {object|null} parent — lean PlanningRun
 * @param {{ packId: string, organizationId: string, job?: string }} childCtx
 * @returns {{ ok: true, parentRunId: string } | never}
 */
function assertParentRunAllowed(parent, childCtx = {}) {
  if (!parent || typeof parent !== 'object') {
    const err = new Error('parentRunId not found');
    err.code = 'PARENT_RUN_NOT_FOUND';
    err.statusCode = 409;
    throw err;
  }

  const parentId = String(parent._id || parent.runId || '').trim();
  if (!parentId) {
    const err = new Error('parentRunId not found');
    err.code = 'PARENT_RUN_NOT_FOUND';
    err.statusCode = 409;
    throw err;
  }

  const parentJob = String(parent.job || '').trim();
  if (parentJob !== 'phase_what') {
    const err = new Error('parentRunId must be a phase_what run');
    err.code = 'PARENT_RUN_INVALID_JOB';
    err.statusCode = 409;
    throw err;
  }

  const packId = String(childCtx.packId || '').trim();
  const organizationId = String(childCtx.organizationId || '').trim();
  if (packId && String(parent.packId || '').trim() !== packId) {
    const err = new Error('parentRunId packId mismatch');
    err.code = 'PARENT_RUN_MISMATCH';
    err.statusCode = 409;
    throw err;
  }
  if (
    organizationId &&
    String(parent.organizationId || '').trim() !== organizationId
  ) {
    const err = new Error('parentRunId organizationId mismatch');
    err.code = 'PARENT_RUN_MISMATCH';
    err.statusCode = 409;
    throw err;
  }

  return { ok: true, parentRunId: parentId };
}

/**
 * Resolve FE hint vs server authority (project-service).
 * @param {string|null|undefined} hintParentRunId
 * @param {string|null|undefined} authorityParentRunId
 * @returns {{ parentRunId: string|null, mismatch: boolean }}
 */
function resolveParentHint(hintParentRunId, authorityParentRunId) {
  const hint = normalizeParentRunId(hintParentRunId);
  const authority = normalizeParentRunId(authorityParentRunId);
  if (hint && authority && hint !== authority) {
    return { parentRunId: authority, mismatch: true };
  }
  return { parentRunId: authority || hint || null, mismatch: false };
}

module.exports = {
  normalizeGenerationId,
  normalizeParentRunId,
  assertParentRunAllowed,
  resolveParentHint,
};
