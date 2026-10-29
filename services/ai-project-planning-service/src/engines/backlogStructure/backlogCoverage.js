/**
 * Coverage contract — 3 layers:
 * - Code: structural refs / missing (never SoT COVERED)
 * - LLM: proposedCoverage + evidence
 * - Gate1: SoT status after approval
 * Having sourceFrIds link ≠ COVERED.
 */

const { COVERAGE_STATUS } = require('./constants');

function asList(raw) {
  return (Array.isArray(raw) ? raw : []).map(String).filter(Boolean);
}

/**
 * Structural scan: which FR/AC in-scope lack any story/feature link or unresolved AC refs.
 */
function computeStructuralCoverage(opts = {}) {
  const frInScope = asList(opts.frInScope);
  const acInScope = asList(opts.acInScope);
  const stories = Array.isArray(opts.stories) ? opts.stories : [];
  const features = Array.isArray(opts.features) ? opts.features : [];

  const linkedFr = new Set();
  const linkedAc = new Set();
  for (const s of stories) {
    for (const fr of asList(s.sourceFrIds)) linkedFr.add(fr);
    for (const ac of asList(s.acRefs)) linkedAc.add(ac);
  }
  for (const f of features) {
    for (const fr of asList(f.sourceFrIds)) linkedFr.add(fr);
  }

  const coverageByFrId = {};
  const coverageByAcRef = {};
  const structuralGaps = [];

  for (const fr of frInScope) {
    if (!linkedFr.has(fr)) {
      coverageByFrId[fr] = {
        status: COVERAGE_STATUS.MISSING_REF,
        proposedBy: 'code',
        note: 'no_story_or_feature_link',
      };
      structuralGaps.push({ kind: 'fr', id: fr, status: COVERAGE_STATUS.MISSING_REF });
    } else {
      // Link exists — still NOT SoT COVERED
      coverageByFrId[fr] = {
        status: COVERAGE_STATUS.PROPOSED,
        proposedBy: 'code',
        note: 'linked_awaiting_semantic_and_gate1',
        hasLink: true,
      };
    }
  }

  for (const ac of acInScope) {
    if (!linkedAc.has(ac)) {
      coverageByAcRef[ac] = {
        status: COVERAGE_STATUS.MISSING_REF,
        proposedBy: 'code',
        note: 'ac_not_referenced',
      };
      structuralGaps.push({ kind: 'ac', id: ac, status: COVERAGE_STATUS.MISSING_REF });
    } else {
      coverageByAcRef[ac] = {
        status: COVERAGE_STATUS.PROPOSED,
        proposedBy: 'code',
        note: 'linked_awaiting_semantic_and_gate1',
        hasLink: true,
      };
    }
  }

  return {
    coverageByFrId,
    coverageByAcRef,
    structuralGaps,
    // Explicit: never promote to COVERED here
    sotCoveredCount: 0,
  };
}

/**
 * Merge LLM semantic coverage proposals (still not SoT COVERED).
 */
function mergeLlmCoverageProposals(structural, llmProposals = {}) {
  const coverageByFrId = { ...(structural.coverageByFrId || {}) };
  const coverageByAcRef = { ...(structural.coverageByAcRef || {}) };

  for (const [fr, row] of Object.entries(llmProposals.coverageByFrId || {})) {
    const evidence = asList(row.evidenceRefs);
    coverageByFrId[fr] = {
      ...coverageByFrId[fr],
      status: COVERAGE_STATUS.PROPOSED,
      proposedBy: 'llm',
      proposedStatus: row.status || COVERAGE_STATUS.PARTIALLY_COVERED,
      evidenceRefs: evidence,
      summary: row.summary || null,
    };
  }
  for (const [ac, row] of Object.entries(llmProposals.coverageByAcRef || {})) {
    coverageByAcRef[ac] = {
      ...coverageByAcRef[ac],
      status: COVERAGE_STATUS.PROPOSED,
      proposedBy: 'llm',
      proposedStatus: row.status || COVERAGE_STATUS.PARTIALLY_COVERED,
      evidenceRefs: asList(row.evidenceRefs),
      summary: row.summary || null,
    };
  }

  return { coverageByFrId, coverageByAcRef, structuralGaps: structural.structuralGaps || [] };
}

/**
 * Apply Gate1 decisions → SoT coverage statuses.
 * @param {object} merged — from mergeLlmCoverageProposals
 * @param {object} gate1Decisions — { fr: { [id]: status }, ac: { [id]: status } }
 */
function applyGate1Coverage(merged, gate1Decisions = {}) {
  const coverageByFrId = { ...(merged.coverageByFrId || {}) };
  const coverageByAcRef = { ...(merged.coverageByAcRef || {}) };
  const allowed = new Set(Object.values(COVERAGE_STATUS));

  for (const [fr, status] of Object.entries(gate1Decisions.fr || {})) {
    const st = String(status || '').toUpperCase();
    if (!allowed.has(st) || st === COVERAGE_STATUS.PROPOSED || st === COVERAGE_STATUS.MISSING_REF) {
      continue;
    }
    coverageByFrId[fr] = {
      ...coverageByFrId[fr],
      status: st,
      proposedBy: 'gate1',
      sot: true,
    };
  }
  for (const [ac, status] of Object.entries(gate1Decisions.ac || {})) {
    const st = String(status || '').toUpperCase();
    if (!allowed.has(st) || st === COVERAGE_STATUS.PROPOSED || st === COVERAGE_STATUS.MISSING_REF) {
      continue;
    }
    coverageByAcRef[ac] = {
      ...coverageByAcRef[ac],
      status: st,
      proposedBy: 'gate1',
      sot: true,
    };
  }

  return { coverageByFrId, coverageByAcRef };
}

/** True if any FR is SoT COVERED — used in tests to assert link≠COVERED before Gate1. */
function countSotCovered(coverageByFrId = {}) {
  return Object.values(coverageByFrId).filter((r) => r && r.status === COVERAGE_STATUS.COVERED && r.sot).length;
}

module.exports = {
  computeStructuralCoverage,
  mergeLlmCoverageProposals,
  applyGate1Coverage,
  countSotCovered,
  COVERAGE_STATUS,
};
