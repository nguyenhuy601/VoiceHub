/**
 * Risk analysis — heuristic risks from high-complexity caps, gaps, arch impact.
 */

function slugPart(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function clampPi(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.max(1, Math.min(5, Math.round(v)));
}

function scoreFromPi(probability, impact) {
  return probability * impact;
}

function bandFromScore(score) {
  if (score >= 15) return 'critical';
  if (score >= 10) return 'high';
  if (score >= 6) return 'medium';
  return 'low';
}

function buildHeuristicRiskItems({
  capabilities = [],
  gaps = [],
  architectureItems = [],
  dependencyEdges = [],
} = {}) {
  const items = [];
  let idx = 0;
  const push = (partial) => {
    const probability = clampPi(partial.probability);
    const impact = clampPi(partial.impact);
    if (probability == null || impact == null) return;
    idx += 1;
    const score = scoreFromPi(probability, impact);
    items.push({
      riskId: `RSK-${String(idx).padStart(3, '0')}-${slugPart(partial.title)}`,
      title: String(partial.title || '').slice(0, 160),
      relatedFrIds: Array.isArray(partial.relatedFrIds) ? partial.relatedFrIds : [],
      probability,
      impact,
      score,
      band: bandFromScore(score),
      mitigation: partial.mitigation ? String(partial.mitigation).slice(0, 240) : undefined,
    });
  };

  for (const cap of capabilities) {
    if (String(cap.complexity || '').toLowerCase() !== 'high') continue;
    push({
      title: `High complexity capability: ${cap.name || cap.capabilityId}`,
      relatedFrIds: cap.sourceFrIds || [],
      probability: 3,
      impact: 4,
      mitigation: 'Spike early; assign senior owner; buffer effort',
    });
  }

  for (const gap of gaps) {
    if (!['high', 'critical'].includes(String(gap.severity || '').toLowerCase())) continue;
    push({
      title: `Requirement gap (${gap.severity}): ${gap.type}`,
      relatedFrIds: gap.relatedFrIds || [],
      probability: gap.severity === 'critical' ? 4 : 3,
      impact: gap.severity === 'critical' ? 5 : 4,
      mitigation: gap.recommendation || 'Clarify with BA before delivery',
    });
  }

  for (const arch of architectureItems) {
    if (String(arch.impactLevel || '').toLowerCase() !== 'high') continue;
    push({
      title: `High architecture impact: ${arch.component} (${arch.layer})`,
      relatedFrIds: arch.sourceFrIds || [],
      probability: 3,
      impact: 4,
      mitigation: 'Review integration boundaries; add tech spike if new stack',
    });
  }

  for (const edge of dependencyEdges) {
    if (!edge.blocking && !edge.critical) continue;
    push({
      title: `Blocking dependency ${edge.from} → ${edge.to}`,
      relatedFrIds: [],
      probability: 3,
      impact: 5,
      mitigation: 'Track as blocker; confirm owner and SLA',
    });
  }

  return items;
}

function runRiskEngine(container = {}) {
  const capabilities = container?.analyses?.capability?.items || [];
  const gaps = container?.analyses?.gap?.items || [];
  const architectureItems = container?.analyses?.architectureImpact?.items || [];
  const dependencyEdges = container?.analyses?.dependency?.edges || [];
  const risks = buildHeuristicRiskItems({
    capabilities,
    gaps,
    architectureItems,
    dependencyEdges,
  });
  const maxSeverity = risks.reduce((max, r) => {
    const rank = { low: 1, medium: 2, high: 3, critical: 4 };
    return (rank[r.band] || 0) > (rank[max] || 0) ? r.band : max;
  }, null);

  return {
    status: 'ready',
    model: null,
    generatedAt: new Date().toISOString(),
    items: risks,
    risks,
    maxSeverity,
    meta: {
      source: 'heuristic',
      llmCalls: 0,
      riskCount: risks.length,
      stub: false,
    },
  };
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
  buildHeuristicRiskItems,
  runRiskEngine,
  applyRiskToContainer,
  bandFromScore,
  scoreFromPi,
};
