/**
 * Capability analysis — heuristic one capability per FR.
 */

function normProse(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugPart(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function listFrRows(packOrSnapshot = {}) {
  if (Array.isArray(packOrSnapshot.functionalRequirements)) {
    return packOrSnapshot.functionalRequirements;
  }
  if (Array.isArray(packOrSnapshot.frList)) return packOrSnapshot.frList;
  if (Array.isArray(packOrSnapshot.requirements)) return packOrSnapshot.requirements;
  return [];
}

function frId(row, index) {
  return String(row?.externalId || row?.id || row?._id || `FR-${index + 1}`).trim();
}

function buildFrSlices(packOrSnapshot = {}) {
  const rows = listFrRows(packOrSnapshot);
  const slices = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const level = String(row.level || row.type || 'Requirement').trim();
    if (level && level !== 'Requirement' && level !== 'FR') continue;
    const id = frId(row, i);
    if (!id) continue;
    slices.push({
      id,
      title: normProse(row.name || row.title || id),
      description: normProse(row.description || row.desc || ''),
      ac: normProse(row.ac || row.acceptanceCriteria || ''),
      actor: normProse(row.actor || ''),
      module: normProse(row.module || row.moduleLabel || row.moduleName || 'General') || 'General',
      feature: normProse(row.feature || row.featureLabel || ''),
      priority: row.priority || null,
    });
  }
  // If every row was filtered out by level, treat all as requirements
  if (!slices.length && rows.length) {
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const id = frId(row, i);
      slices.push({
        id,
        title: normProse(row.name || row.title || id),
        description: normProse(row.description || ''),
        ac: normProse(row.ac || row.acceptanceCriteria || ''),
        actor: normProse(row.actor || ''),
        module: normProse(row.module || row.moduleLabel || 'General') || 'General',
        feature: normProse(row.feature || row.featureLabel || ''),
        priority: row.priority || null,
      });
    }
  }
  return slices;
}

function inferSkills(slice) {
  const text = `${slice.title || ''} ${slice.description || ''} ${slice.ac || ''}`.toLowerCase();
  const skills = [];
  if (/react|frontend|ui|css|html/.test(text)) skills.push({ name: 'Frontend', level: 3 });
  if (/api|backend|node|java|service/.test(text)) skills.push({ name: 'Backend', level: 3 });
  if (/db|sql|mongo|data/.test(text)) skills.push({ name: 'Database', level: 2 });
  if (/auth|oauth|jwt|login/.test(text)) skills.push({ name: 'Security', level: 3 });
  if (/test|qa|selenium/.test(text)) skills.push({ name: 'QA', level: 2 });
  if (!skills.length) skills.push({ name: 'General Development', level: 2 });
  return skills.slice(0, 8);
}

function inferComplexity(slice) {
  const descLen = String(slice.description || '').length;
  const acLen = String(slice.ac || '').length;
  if (descLen > 180 || acLen > 120) return 'high';
  if (descLen > 60 || acLen > 40) return 'medium';
  return 'low';
}

function inferConfidence(slice) {
  let score = 0.45;
  if (slice.description) score += 0.2;
  if (slice.ac) score += 0.2;
  if (slice.actor) score += 0.1;
  return Math.min(0.95, Math.round(score * 100) / 100);
}

function buildHeuristicCapabilityItems(frSlices = []) {
  const items = [];
  const seen = new Set();
  for (let i = 0; i < frSlices.length; i += 1) {
    const slice = frSlices[i];
    const name = slice.title || slice.id;
    const moduleName = slice.module || 'General';
    const key = `${moduleName.toLowerCase()}::${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      capabilityId: `CAP-H-${slugPart(moduleName) || 'm'}-${slugPart(name) || i + 1}`,
      name,
      module: moduleName,
      ...(slice.feature ? { feature: slice.feature } : {}),
      sourceFrIds: [slice.id],
      requiredSkills: inferSkills(slice),
      complexity: inferComplexity(slice),
      confidence: inferConfidence(slice),
    });
  }
  return items;
}

function runCapabilityEngine(packOrSnapshot = {}, opts = {}) {
  const frSlices = opts.frSlices || buildFrSlices(packOrSnapshot);
  const items = buildHeuristicCapabilityItems(frSlices);
  return {
    status: 'ready',
    model: null,
    generatedAt: new Date().toISOString(),
    items,
    meta: {
      source: frSlices.length ? 'heuristic' : 'empty',
      llmCalls: 0,
      partial: false,
      frCount: frSlices.length,
    },
  };
}

function applyCapabilityToContainer(container, capabilityResult) {
  const next = {
    ...container,
    analyses: { ...(container?.analyses || {}) },
  };
  next.analyses.capability = {
    status: capabilityResult.status || 'ready',
    model: capabilityResult.model || null,
    generatedAt: capabilityResult.generatedAt || new Date().toISOString(),
    items: capabilityResult.items || [],
    entities: [],
    edges: [],
    meta: capabilityResult.meta || {},
  };
  return next;
}

module.exports = {
  buildFrSlices,
  buildHeuristicCapabilityItems,
  runCapabilityEngine,
  applyCapabilityToContainer,
};
