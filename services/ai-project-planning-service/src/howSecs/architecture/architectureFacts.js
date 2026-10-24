/**
 * Architecture Fact Tool — project real capability/gap/catalog only (no synthetic API/DB).
 */

const { clip } = require('./architectureSchema');

/**
 * @param {{ semantic: object, allowLists: object }} ctx
 */
function buildArchitectureFacts(ctx = {}) {
  const semantic = ctx.semantic || {};
  const allowLists = ctx.allowLists || {};
  const caps = semantic.upstream?.capabilityBrief || [];
  const gaps = semantic.upstream?.gapBrief || [];
  const catalog = semantic.system?.architectureCatalog || [];
  const leaves = semantic.upstream?.wbsLeafBrief || [];

  const capabilityFacts = caps.map((c) => ({
    capabilityId: c.id,
    name: c.name,
    complexity: c.complexity,
    sourceFrIds: (c.sourceFrIds || []).filter((id) =>
      !allowLists.frIds?.length ? true : allowLists.frIds.includes(String(id))
    ),
    source: 'analyses.capability',
  }));

  const gapFacts = gaps
    .filter((g) => g.type === 'missing_integration' || g.type === 'missing_dependency_target')
    .map((g) => ({
      gapId: g.gapId,
      type: g.type,
      issue: g.issue,
      relatedFrIds: (g.relatedFrIds || []).filter((id) =>
        !allowLists.frIds?.length ? true : allowLists.frIds.includes(String(id))
      ),
      source: 'analyses.gap',
    }));

  const catalogFacts = catalog.map((c) => ({
    name: c.name,
    layer: c.layer || null,
    source: c.source || 'pack_or_snapshot',
  }));

  const wbsAreaFacts = [];
  const areaSet = new Set();
  for (const leaf of leaves) {
    const area = String(leaf.area || '').trim().toLowerCase();
    if (!area || areaSet.has(area)) continue;
    areaSet.add(area);
    wbsAreaFacts.push({
      area,
      sampleTaskId: leaf.id,
      sourceFrIds: leaf.sourceFrIds || [],
      source: 'planning.tasks',
    });
  }

  return {
    capabilityFacts,
    gapFacts,
    catalogFacts,
    wbsAreaFacts,
    allowLists: {
      frIds: [...(allowLists.frIds || [])],
      capabilityIds: [...(allowLists.capabilityIds || [])],
      taskIds: [...(allowLists.taskIds || [])],
      catalogNames: [...(allowLists.catalogNames || [])],
    },
    meta: {
      capabilityCount: capabilityFacts.length,
      gapCount: gapFacts.length,
      catalogCount: catalogFacts.length,
      areaCount: wbsAreaFacts.length,
      // Explicit: facts never invent component/API/DB labels
      inventForbidden: true,
    },
  };
}

function factsPromptSlice(facts) {
  return {
    capabilities: (facts.capabilityFacts || []).map((c) => ({
      id: c.capabilityId,
      name: clip(c.name, 80),
      complexity: c.complexity,
      sourceFrIds: c.sourceFrIds,
    })),
    gaps: facts.gapFacts || [],
    catalog: (facts.catalogFacts || []).map((c) => ({
      name: clip(c.name, 80),
      layer: c.layer,
    })),
    wbsAreas: facts.wbsAreaFacts || [],
  };
}

module.exports = {
  buildArchitectureFacts,
  factsPromptSlice,
};
