/**
 * Binds a context request to the trusted caller.
 * The kernel does not read gateway headers. A wider scope than the caller
 * holds is rejected (RULE-SL-07).
 */

const { resolvePurposeProfile } = require('./purposeProfiles');

const POLICY_RANK = Object.freeze({
  NONE: 0,
  SAME_PROJECT: 1,
  SAME_ORGANIZATION: 2,
  CROSS_PROJECT: 3,
});

function rankOf(policy) {
  return POLICY_RANK[policy] ?? -1;
}

function tighterPolicy(left, right) {
  return rankOf(left) <= rankOf(right) ? left : right;
}

function bindContextRequest(request = {}, caller = {}) {
  if (request.skipPermission || request.allowCrossProject || request.relaxSnapshot) {
    return { ok: false, code: 'SCOPE_ESCALATION' };
  }
  const profile = resolvePurposeProfile(
    request.purpose,
    request.required,
    request.optional
  );
  if (!profile) return { ok: false, code: 'UNKNOWN_PURPOSE' };
  if (!request.snapshotId) return { ok: false, code: 'SNAPSHOT_REQUIRED', reason: 'missing' };
  if (!caller.organizationId || !caller.projectId) {
    return { ok: false, code: 'CALLER_SCOPE_REQUIRED' };
  }
  if (request.organizationId && request.organizationId !== caller.organizationId) {
    return { ok: false, code: 'SCOPE_MISMATCH' };
  }
  if (request.projectId && request.projectId !== caller.projectId) {
    return { ok: false, code: 'SCOPE_MISMATCH' };
  }
  const callerMax = caller.maxHistoricalEvidencePolicy || 'NONE';
  if (rankOf(callerMax) < 0) return { ok: false, code: 'CALLER_SCOPE_REQUIRED' };
  if (
    request.historicalEvidencePolicy &&
    rankOf(request.historicalEvidencePolicy) > rankOf(callerMax)
  ) {
    return { ok: false, code: 'SCOPE_ESCALATION' };
  }

  const historicalEvidencePolicy = request.historicalEvidencePolicy
    ? request.historicalEvidencePolicy
    : tighterPolicy(profile.defaultHistoricalPolicy, callerMax);

  const requestedBudget = Number(request.tokenBudget);
  const tokenBudget =
    Number.isFinite(requestedBudget) && requestedBudget > 0
      ? Math.min(requestedBudget, profile.maxTokenBudget)
      : profile.defaultTokenBudget;

  return {
    ok: true,
    purpose: request.purpose,
    snapshotId: String(request.snapshotId),
    organizationId: caller.organizationId,
    projectId: caller.projectId,
    actorId: caller.actorId || null,
    targetIds: Array.isArray(request.targetIds) ? [...request.targetIds] : [],
    tokenBudget,
    historicalEvidencePolicy,
    includeProposals: request.includeProposals === true,
    profile,
    toolResult: request.toolResult || null,
  };
}

module.exports = {
  POLICY_RANK,
  bindContextRequest,
};
