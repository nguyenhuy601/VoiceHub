/**
 * ApprovedSrsVersionManifest — ONLY after PO approve (not at materialize draft).
 */

function createApprovedSrsVersionManifest(opts = {}) {
  return {
    schemaVersion: 1,
    manifestId: opts.manifestId || `manifest-${Date.now()}`,
    approvedSrsVersion: opts.approvedSrsVersion || `v${Date.now()}`,
    approvedAt: opts.approvedAt || new Date().toISOString(),
    approvedBy: opts.approvedBy || null,
    projectId: opts.projectId || null,
    packId: opts.packId || null,
    proposalGenerationId: opts.proposalGenerationId || null,
    proposalVersion: opts.proposalVersion ?? null,
    sections: opts.sections || {},
    source: 'po_approve',
  };
}

/**
 * Materialize Draft projection from reviewed proposal.
 * Requires reviewComplete === true. Does NOT create ApprovedSrsVersionManifest.
 */
function materializeSrsDraft(proposal, opts = {}) {
  const summary = proposal?.review?.summary;
  const complete =
    summary?.complete === true ||
    (summary == null && opts.force !== true ? false : opts.force === true);
  if (!complete && opts.force !== true) {
    const err = new Error('Materialize requires reviewComplete === true');
    err.statusCode = 409;
    err.errorCode = 'REVIEW_NOT_COMPLETE';
    throw err;
  }

  const generated = proposal?.generated || {};
  return {
    kind: 'srs_draft',
    draftedAt: new Date().toISOString(),
    draftedBy: opts.userId || null,
    proposalVersion: proposal?.proposalVersion ?? null,
    generationId: proposal?.generationId || null,
    reviewVersion: proposal?.reviewVersion ?? null,
    sections: {
      functionalRequirements: generated.functionalRequirements?.items || [],
      nonFunctionalRequirements: generated.nonFunctionalRequirements?.items || [],
      businessRules: generated.businessRules?.items || [],
      scope: generated.scope?.items || [],
      actors: generated.actors?.items || [],
      domain: generated.domain?.items || [],
      processes: generated.processes?.items || [],
      useCases: generated.useCases?.items || [],
      entities: generated.entities?.items || [],
      businessGoals: generated.businessGoals?.items || [],
    },
    decisions: proposal?.review?.decisions || {},
    // Explicit: no manifest at draft time
    approvedSrsVersionManifest: null,
  };
}

/**
 * PO approve draft → manifest + approved SRS pointer.
 * T-X18: proposal rerun must not mutate existing Approved SRS / manifest.
 */
function approveSrsDraft(draft, opts = {}) {
  if (!draft || draft.kind !== 'srs_draft') {
    const err = new Error('SRS draft required for PO approve');
    err.statusCode = 400;
    err.errorCode = 'SRS_DRAFT_REQUIRED';
    throw err;
  }
  const manifest = createApprovedSrsVersionManifest({
    approvedBy: opts.userId || null,
    projectId: opts.projectId,
    packId: opts.packId,
    proposalGenerationId: draft.generationId,
    proposalVersion: draft.proposalVersion,
    sections: Object.fromEntries(
      Object.entries(draft.sections || {}).map(([k, items]) => [
        k,
        { count: Array.isArray(items) ? items.length : 0 },
      ])
    ),
    approvedSrsVersion: opts.approvedSrsVersion,
  });
  return {
    approvedSrs: {
      version: manifest.approvedSrsVersion,
      approvedAt: manifest.approvedAt,
      sections: draft.sections,
      decisions: draft.decisions,
    },
    approvedSrsVersionManifest: manifest,
  };
}

module.exports = {
  createApprovedSrsVersionManifest,
  materializeSrsDraft,
  approveSrsDraft,
};
