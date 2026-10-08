/**
 * G20 Project Initialization — materialize approved AI plan into project DB.
 * Deterministic application service (NOT an Agent). Lives on project-service (RULE-11).
 *
 * Idempotency: callers MUST pass idempotencyKey; duplicate key returns prior result.
 * Wave B stub — validates payload shape only; full WBS persist comes in later contracts.
 */

const seenKeys = new Map();

function validateMaterializePayload(payload = {}) {
  const errors = [];
  if (!payload.approvedPlan || typeof payload.approvedPlan !== 'object') {
    errors.push('approvedPlan required');
  }
  if (!payload.packId) errors.push('packId required');
  if (!payload.organizationId) errors.push('organizationId required');
  if (!payload.idempotencyKey) errors.push('idempotencyKey required');
  return errors;
}

/**
 * @param {object} payload
 * @returns {{ ok: boolean, idempotent: boolean, projectReady?: object, errors?: string[] }}
 */
async function materializeApprovedPlan(payload = {}) {
  const errors = validateMaterializePayload(payload);
  if (errors.length) {
    return { ok: false, idempotent: false, errors };
  }

  const key = String(payload.idempotencyKey);
  if (seenKeys.has(key)) {
    return { ok: true, idempotent: true, projectReady: seenKeys.get(key) };
  }

  // Stub: document contract; real persist WBS/assignments/schedule in later wave
  const projectReady = {
    packId: String(payload.packId),
    organizationId: String(payload.organizationId),
    artifactIds: [],
    materializedAt: new Date().toISOString(),
    stub: true,
  };
  seenKeys.set(key, projectReady);
  return { ok: true, idempotent: false, projectReady };
}

/** Test helper */
function _clearIdempotencyCacheForTests() {
  seenKeys.clear();
}

module.exports = {
  materializeApprovedPlan,
  validateMaterializePayload,
  _clearIdempotencyCacheForTests,
};
