/**
 * Architecture impact — heuristic components from capabilities / gaps.
 */

function slugPart(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function inferLayer(cap) {
  const blob = `${cap.name || ''} ${cap.module || ''} ${(cap.requiredSkills || [])
    .map((s) => (typeof s === 'string' ? s : s.name || ''))
    .join(' ')}`.toLowerCase();
  if (/front|react|ui|css|html/.test(blob)) return 'frontend';
  if (/db|sql|mongo|data store/.test(blob)) return 'database';
  if (/api|gateway|rest|graphql/.test(blob)) return 'api';
  if (/external|third.?party|integration|webhook/.test(blob)) return 'external';
  if (/deploy|infra|devops|k8s/.test(blob)) return 'infrastructure';
  return 'backend';
}

function complexityToImpact(complexity) {
  const c = String(complexity || '').toLowerCase();
  if (c === 'high') return 'high';
  if (c === 'low') return 'low';
  return 'medium';
}

function buildHeuristicArchitectureItems({ capabilities = [], gaps = [] } = {}) {
  const items = [];
  let idx = 0;
  for (const cap of capabilities) {
    if (!cap?.capabilityId && !cap?.name) continue;
    idx += 1;
    const layer = inferLayer(cap);
    items.push({
      impactId: `IMP-H-${slugPart(cap.capabilityId || cap.name) || idx}`,
      sourceFrIds: Array.isArray(cap.sourceFrIds) ? [...cap.sourceFrIds] : [],
      capabilityIds: cap.capabilityId ? [cap.capabilityId] : [],
      component: cap.name || cap.capabilityId || `Component ${idx}`,
      layer,
      apis: layer === 'api' || layer === 'backend' ? [`${cap.name || 'Service'} API`] : [],
      databases: layer === 'database' ? [`${cap.name || 'Data'} Store`] : [],
      externalSystems: layer === 'external' ? [cap.name || 'External'] : [],
      impactLevel: complexityToImpact(cap.complexity),
    });
  }
  for (const gap of gaps) {
    if (gap.type !== 'missing_integration' && gap.type !== 'missing_dependency_target') continue;
    idx += 1;
    items.push({
      impactId: `IMP-H-GAP-${slugPart(gap.gapId) || idx}`,
      sourceFrIds: Array.isArray(gap.relatedFrIds) ? [...gap.relatedFrIds] : [],
      capabilityIds: [],
      component: gap.missingTarget || gap.issue || `Gap ${idx}`,
      layer: 'external',
      apis: [],
      databases: [],
      externalSystems: [gap.missingTarget || 'Unknown'],
      impactLevel: gap.severity === 'critical' || gap.severity === 'high' ? 'high' : 'medium',
    });
  }
  return items;
}

function buildHeuristicChains(items = []) {
  const byLayer = new Map();
  for (const it of items) {
    if (!byLayer.has(it.layer)) byLayer.set(it.layer, it);
  }
  const path = ['frontend', 'api', 'backend', 'database', 'external']
    .map((l) => byLayer.get(l)?.impactId)
    .filter(Boolean);
  if (path.length < 2) return [];
  return [{ chainId: 'CHAIN-H-request', nodes: path }];
}

function runArchitectureEngine(container = {}, packOrSnapshot = {}) {
  const capabilities = container?.analyses?.capability?.items || [];
  const gaps = container?.analyses?.gap?.items || [];
  const catalog = Array.isArray(packOrSnapshot.architectureCatalog)
    ? packOrSnapshot.architectureCatalog
    : Array.isArray(packOrSnapshot.technology)
      ? packOrSnapshot.technology
      : [];
  const items = buildHeuristicArchitectureItems({ capabilities, gaps });
  for (let i = 0; i < catalog.length; i += 1) {
    const tech = catalog[i];
    const name = String(tech?.name || tech || '').trim();
    if (!name) continue;
    items.push({
      impactId: `IMP-H-TECH-${slugPart(name) || i + 1}`,
      sourceFrIds: [],
      capabilityIds: [],
      component: name,
      layer: String(tech.layer || tech.category || 'backend').toLowerCase(),
      apis: [],
      databases: [],
      externalSystems: [],
      impactLevel: tech.mandatory ? 'high' : 'medium',
    });
  }
  const chains = buildHeuristicChains(items);
  return {
    status: 'ready',
    model: null,
    generatedAt: new Date().toISOString(),
    items,
    chains,
    components: items.map((it) => ({
      id: it.impactId,
      name: it.component,
      layer: it.layer,
      impactLevel: it.impactLevel,
    })),
    dependencies: chains.flatMap((c) =>
      (c.nodes || []).slice(1).map((to, i) => ({ from: c.nodes[i], to }))
    ),
    constraints: [],
    meta: {
      source: 'heuristic',
      llmCalls: 0,
      itemCount: items.length,
      stub: false,
    },
  };
}

function applyArchitectureToContainer(container, archResult) {
  const next = {
    ...container,
    analyses: { ...(container?.analyses || {}) },
  };
  next.analyses.architectureImpact = {
    status: archResult.status || 'ready',
    model: archResult.model || null,
    generatedAt: archResult.generatedAt || new Date().toISOString(),
    items: archResult.items || [],
    entities: [],
    edges: archResult.dependencies || [],
    dataFlows: [],
    orderHint: [],
    chains: archResult.chains || [],
    meta: archResult.meta || {},
  };
  return next;
}

module.exports = {
  buildHeuristicArchitectureItems,
  buildHeuristicChains,
  runArchitectureEngine,
  applyArchitectureToContainer,
};
