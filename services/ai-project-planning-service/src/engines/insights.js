/**
 * Requirement insights — minimal requirementInsights.v1-like + proposedSrs / preApproval stubs.
 */

function runInsightsEngine(packOrSnapshot = {}, container = {}) {
  const frs = Array.isArray(packOrSnapshot.functionalRequirements)
    ? packOrSnapshot.functionalRequirements
    : Array.isArray(packOrSnapshot.frList)
      ? packOrSnapshot.frList
      : Array.isArray(packOrSnapshot.requirements)
        ? packOrSnapshot.requirements
        : [];
  const gapItems = container?.analyses?.gap?.items || [];
  const clarifications = (gapItems || [])
    .filter((g) => g.type === 'incomplete' || g.type === 'ambiguous')
    .slice(0, 20)
    .map((g, i) => ({
      clarificationId: `CL-${i + 1}`,
      relatedFrIds: g.relatedFrIds || [],
      question: g.issue || 'Clarify requirement',
      severity: g.severity || 'medium',
    }));

  const gateAPassed = clarifications.filter((c) => c.severity === 'high' || c.severity === 'critical').length === 0;

  const requirementInsights = {
    schemaVersion: 'requirementInsights.v1',
    clarifications,
    quality: {
      frCount: frs.length,
      clarificationCount: clarifications.length,
      gateAPassed,
      coverageScore: container?.analyses?.gap?.meta?.coverage?.score ?? null,
    },
    summary: frs.length
      ? `Heuristic insights for ${frs.length} FR(s); ${clarifications.length} clarification(s).`
      : 'No FRs available for insights.',
  };

  const proposedSrs = {
    schemaVersion: 'proposedSrs.v1',
    deltas: [],
    status: 'stub',
    note: 'Heuristic stub — full SRS proposal reserved for LLM path',
  };

  const preApproval = {
    schemaVersion: 'preApproval.v1',
    passed: gateAPassed,
    checks: [
      {
        checkId: 'PRE-FR-COUNT',
        passed: frs.length > 0,
        message: frs.length > 0 ? 'FR list present' : 'FR list empty',
      },
      {
        checkId: 'PRE-GATE-A',
        passed: gateAPassed,
        message: gateAPassed ? 'No high/critical clarifications' : 'High/critical clarifications remain',
      },
    ],
  };

  return {
    status: 'ready',
    model: null,
    generatedAt: new Date().toISOString(),
    requirementInsights,
    proposedSrs,
    preApproval,
    meta: { source: 'heuristic', llmCalls: 0 },
  };
}

function applyInsightsToContainer(container, result) {
  const next = {
    ...container,
    analyses: { ...(container?.analyses || {}) },
  };
  next.analyses.requirementInsights = result.requirementInsights || null;
  next.analyses.proposedSrs = result.proposedSrs || null;
  next.analyses.preApproval = result.preApproval || null;
  return next;
}

module.exports = {
  runInsightsEngine,
  applyInsightsToContainer,
};
