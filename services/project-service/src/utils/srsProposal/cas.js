/**
 * Optimistic concurrency for AI proposal callbacks (T-X19).
 * Checks: proposalVersion + generationId + reviewVersion.
 */

/**
 * @param {object} currentProposal
 * @param {{ generationId?: string, proposalVersion?: number, reviewVersion?: number }} incoming
 * @returns {{ ok: true } | { ok: false, errorCode: string, reason: string }}
 */
function assertProposalCallbackCas(currentProposal, incoming = {}) {
  const current = currentProposal && typeof currentProposal === 'object' ? currentProposal : null;
  if (!current) return { ok: true };

  const curGen = current.generationId != null ? String(current.generationId) : null;
  const inGen = incoming.generationId != null ? String(incoming.generationId) : null;

  // Numeric generation compare when both look like numbers / gen-N
  if (curGen && inGen && curGen !== inGen) {
    const curN = Number(String(curGen).replace(/\D/g, '')) || 0;
    const inN = Number(String(inGen).replace(/\D/g, '')) || 0;
    if (inN > 0 && curN > 0 && inN < curN) {
      return {
        ok: false,
        errorCode: 'STALE_GENERATION',
        reason: `incoming generation ${inGen} < current ${curGen}`,
      };
    }
  }

  if (
    incoming.proposalVersion != null &&
    current.proposalVersion != null &&
    Number(incoming.proposalVersion) < Number(current.proposalVersion)
  ) {
    return {
      ok: false,
      errorCode: 'STALE_PROPOSAL_VERSION',
      reason: `incoming proposalVersion ${incoming.proposalVersion} < current ${current.proposalVersion}`,
    };
  }

  if (
    incoming.reviewVersion != null &&
    current.reviewVersion != null &&
    Number(incoming.reviewVersion) !== Number(current.reviewVersion)
  ) {
    // Callbacks that don't touch review may omit; if provided must match for CAS update
    return {
      ok: false,
      errorCode: 'STALE_REVIEW_VERSION',
      reason: `incoming reviewVersion ${incoming.reviewVersion} != current ${current.reviewVersion}`,
    };
  }

  return { ok: true };
}

/**
 * Compare-and-swap apply: reject if versions drifted.
 */
function casReplaceProposal(current, next, expected = {}) {
  const check = assertProposalCallbackCas(current, {
    generationId: expected.incomingGenerationId,
    proposalVersion: expected.incomingProposalVersion,
    reviewVersion: expected.expectedReviewVersion,
  });
  if (!check.ok) {
    const err = new Error(check.reason);
    err.statusCode = 409;
    err.errorCode = check.errorCode;
    throw err;
  }
  if (
    expected.expectedProposalVersion != null &&
    Number(current?.proposalVersion || 0) !== Number(expected.expectedProposalVersion)
  ) {
    const err = new Error('proposalVersion CAS mismatch');
    err.statusCode = 409;
    err.errorCode = 'STALE_PROPOSAL_VERSION';
    throw err;
  }
  return next;
}

module.exports = {
  assertProposalCallbackCas,
  casReplaceProposal,
};
