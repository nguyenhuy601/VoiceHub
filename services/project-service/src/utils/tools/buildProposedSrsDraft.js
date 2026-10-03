/**
 * Phase 1 stage 9 — Proposed SRS draft (side-by-side deltas).
 * Does NOT mutate pack FR list.
 */

const PROPOSED_SRS_SCHEMA = 'proposedSrs.v1';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

/**
 * Map clarifications → FR/NFR field patch proposals.
 * @returns {{ schemaVersion, deltas, unchangedSourceRefs, meta }}
 */
function buildProposedSrsDraft(pack = {}, insights = null) {
  const packSnapshot = {
    overview: cloneJson(pack?.overview || {}),
    functionalRequirementIds: (pack?.functionalRequirements || [])
      .map((r) => String(r.externalId || r._id || '').trim())
      .filter(Boolean),
    nfrIds: (pack?.nonFunctionalRequirements || pack?.nfrs || [])
      .map((r) => String(r.externalId || r._id || '').trim())
      .filter(Boolean),
  };

  const clarifications = Array.isArray(insights?.clarifications)
    ? insights.clarifications
    : [];
  const deltas = [];

  for (const c of clarifications.slice(0, 40)) {
    const frId = c.frId ? String(c.frId).trim() : '';
    const field = String(c.field || 'description').trim() || 'description';
    deltas.push({
      kind: frId ? 'fr_patch' : 'pack_note',
      externalId: frId || null,
      field,
      action: 'propose_append',
      proposedText: String(c.text || '').trim(),
      priority: c.priority || 'Medium',
      clarificationId: c.id || null,
      applied: false,
    });
  }

  const unchangedSourceRefs = packSnapshot.functionalRequirementIds.map((id) => ({
    type: 'fr',
    externalId: id,
  }));

  return {
    schemaVersion: PROPOSED_SRS_SCHEMA,
    sourceOverviewName: String(pack?.overview?.requirementName || '').trim(),
    deltas,
    unchangedSourceRefs,
    packRef: {
      frCount: packSnapshot.functionalRequirementIds.length,
      nfrCount: packSnapshot.nfrIds.length,
    },
    meta: {
      generatedFrom: insights?.schemaVersion || 'requirementInsights',
      clarificationCount: clarifications.length,
      note: 'Proposed only — does not overwrite pack FR until human apply',
    },
  };
}

module.exports = {
  PROPOSED_SRS_SCHEMA,
  buildProposedSrsDraft,
};
