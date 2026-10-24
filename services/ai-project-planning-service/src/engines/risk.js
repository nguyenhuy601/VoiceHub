/**
 * Risk score helpers + container patch.
 * Heuristic risk catalog (high-cap / gap titles) is not a runtime path.
 */

function scoreFromPi(probability, impact) {
  return probability * impact;
}

function bandFromScore(score) {
  if (score >= 15) return 'critical';
  if (score >= 10) return 'high';
  if (score >= 6) return 'medium';
  return 'low';
}

function applyRiskToContainer(container, riskResult) {
  const next = {
    ...container,
    analyses: { ...(container?.analyses || {}) },
  };
  next.analyses.risk = {
    status: riskResult.status || 'ready',
    model: riskResult.model || null,
    generatedAt: riskResult.generatedAt || new Date().toISOString(),
    items: riskResult.items || riskResult.risks || [],
    entities: [],
    edges: [],
    dataFlows: [],
    orderHint: [],
    chains: [],
    meta: riskResult.meta || {},
  };
  return next;
}

module.exports = {
  applyRiskToContainer,
  bandFromScore,
  scoreFromPi,
};
