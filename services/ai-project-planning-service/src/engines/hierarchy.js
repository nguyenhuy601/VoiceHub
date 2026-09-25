/**
 * Hierarchy decomposition — heuristic Module→Feature / Feature→Requirement proposals.
 * Self-contained port (no project-service requires).
 */

const AGILE_MAP = Object.freeze({
  Module: 'Epic',
  Feature: 'Feature',
  Requirement: 'Requirement',
});

const NAME_MAX = 160;
const DESC_MAX = 400;
const MAX_PROPOSALS_PER_PARENT = 3;

function normProse(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitProseParts(raw) {
  const text = normProse(raw);
  if (!text) return [];
  return text
    .split(/[.;\n|/]+/)
    .map((p) => normProse(p))
    .filter((p) => p.length >= 3)
    .slice(0, MAX_PROPOSALS_PER_PARENT);
}

function deriveProposalNames(title, description, extra = '') {
  const base = normProse(title) || 'Item';
  const parts = [...splitProseParts(description), ...splitProseParts(extra)].filter(
    (p) => p.toLowerCase() !== base.toLowerCase()
  );
  const names = [];
  const pushUnique = (name) => {
    const n = normProse(name).slice(0, NAME_MAX);
    if (!n) return;
    if (names.some((x) => x.toLowerCase() === n.toLowerCase())) return;
    if (names.length >= MAX_PROPOSALS_PER_PARENT) return;
    names.push(n);
  };
  pushUnique(`${base} — Core`);
  for (const part of parts) {
    pushUnique(part.length > NAME_MAX ? `${part.slice(0, NAME_MAX - 1)}…` : part);
  }
  if (names.length < 2) pushUnique(`${base} — Details`);
  if (names.length < 3 && (description || extra)) pushUnique(`${base} — Extensions`);
  return names.slice(0, MAX_PROPOSALS_PER_PARENT);
}

function listFrRows(packOrSnapshot = {}) {
  if (Array.isArray(packOrSnapshot.functionalRequirements)) {
    return packOrSnapshot.functionalRequirements;
  }
  if (Array.isArray(packOrSnapshot.frList)) return packOrSnapshot.frList;
  if (Array.isArray(packOrSnapshot.requirements)) return packOrSnapshot.requirements;
  return [];
}

function rowId(row, index = 0) {
  return String(row?.externalId || row?.id || row?._id || `ROW-${index + 1}`).trim();
}

function rowLevel(row) {
  return String(row?.level || row?.type || '').trim();
}

function buildModuleSlices(packOrSnapshot = {}) {
  const rows = listFrRows(packOrSnapshot);
  const byParent = new Map();
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const parent = String(row.parentExternalId || row.parentId || '').trim();
    if (!parent) continue;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push({ id: rowId(row, i), level: rowLevel(row) });
  }

  const modules = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const level = rowLevel(row);
    if (level !== 'Module' && level !== 'Epic') continue;
    const id = rowId(row, i);
    const children = byParent.get(id) || [];
    modules.push({
      id,
      title: normProse(row.name || row.title || id),
      description: normProse(row.description || '').slice(0, DESC_MAX),
      childFeatureIds: children
        .filter((c) => !c.level || c.level === 'Feature')
        .map((c) => c.id),
    });
  }

  if (!modules.length) {
    const seen = new Map();
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const mod = normProse(row.module || row.moduleLabel || row.moduleName || '');
      if (!mod) continue;
      const key = mod.toLowerCase();
      if (!seen.has(key)) {
        const id = `MOD-${key.replace(/[^a-z0-9]+/g, '-').slice(0, 40) || i + 1}`;
        seen.set(key, { id, title: mod, description: '', childFeatureIds: [] });
      }
      const entry = seen.get(key);
      const feat = normProse(row.feature || row.featureLabel || '');
      if (feat) {
        const fid = `FEAT-${feat.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;
        if (!entry.childFeatureIds.includes(fid)) entry.childFeatureIds.push(fid);
      }
    }
    return [...seen.values()];
  }
  return modules;
}

function buildFeatureSlices(packOrSnapshot = {}) {
  const rows = listFrRows(packOrSnapshot);
  const byParent = new Map();
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const parent = String(row.parentExternalId || row.parentId || '').trim();
    if (!parent) continue;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push({ id: rowId(row, i), level: rowLevel(row) });
  }

  const features = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (rowLevel(row) !== 'Feature') continue;
    const id = rowId(row, i);
    const children = byParent.get(id) || [];
    features.push({
      id,
      title: normProse(row.name || row.title || id),
      description: normProse(row.description || '').slice(0, DESC_MAX),
      moduleTitle: normProse(row.moduleLabel || row.module || ''),
      mainFlow: normProse(row.mainFlow || ''),
      childRequirementIds: children
        .filter((c) => !c.level || c.level === 'Requirement')
        .map((c) => c.id),
    });
  }

  if (!features.length) {
    const seen = new Map();
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const feat = normProse(row.feature || row.featureLabel || '');
      if (!feat) continue;
      const key = feat.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, {
          id: `FEAT-${key.replace(/[^a-z0-9]+/g, '-').slice(0, 40) || i + 1}`,
          title: feat,
          description: '',
          moduleTitle: normProse(row.module || row.moduleLabel || ''),
          mainFlow: '',
          childRequirementIds: [],
        });
      }
      const entry = seen.get(key);
      const rid = rowId(row, i);
      if (rid && !entry.childRequirementIds.includes(rid)) {
        entry.childRequirementIds.push(rid);
      }
    }
    return [...seen.values()];
  }
  return features;
}

function buildHeuristicFeatureProposals(moduleSlices = []) {
  const out = [];
  for (const mod of moduleSlices || []) {
    if (!mod?.id) continue;
    if ((mod.childFeatureIds || []).length > 0) continue;
    const names = deriveProposalNames(mod.title, mod.description);
    names.forEach((name, index) => {
      out.push({
        proposalId: `PROP-F-${mod.id}-${index + 1}`,
        parentExternalId: mod.id,
        level: 'Feature',
        name,
        description: mod.description || undefined,
        moduleLabel: mod.title || undefined,
        status: 'accepted',
        source: 'heuristic',
      });
    });
  }
  return out;
}

function buildHeuristicRequirementProposals(featureSlices = []) {
  const out = [];
  for (const feat of featureSlices || []) {
    if (!feat?.id) continue;
    if ((feat.childRequirementIds || []).length > 0) continue;
    const names = deriveProposalNames(feat.title, feat.description, feat.mainFlow);
    names.forEach((name, index) => {
      out.push({
        proposalId: `PROP-R-${feat.id}-${index + 1}`,
        parentExternalId: feat.id,
        level: 'Requirement',
        name,
        description: feat.description || feat.mainFlow || undefined,
        moduleLabel: feat.moduleTitle || undefined,
        featureLabel: feat.title || undefined,
        status: 'accepted',
        source: 'heuristic',
      });
    });
  }
  return out;
}

function buildSyntheticFeatureSlicesFromProposals(featureProposals = []) {
  const out = [];
  for (const proposal of featureProposals || []) {
    if (!proposal || typeof proposal !== 'object') continue;
    if (String(proposal.status || 'accepted').toLowerCase() === 'rejected') continue;
    const id = String(proposal.proposalId || '').trim();
    if (!id) continue;
    out.push({
      id,
      title: proposal.name || id,
      description: proposal.description || '',
      moduleTitle: proposal.moduleLabel || '',
      childRequirementIds: [],
      mainFlow: '',
    });
  }
  return out;
}

function runHierarchyEngine(packOrSnapshot = {}) {
  const generatedAt = new Date().toISOString();
  const moduleSlices = buildModuleSlices(packOrSnapshot);
  const featureSlices = buildFeatureSlices(packOrSnapshot);
  const proposedFeatures = buildHeuristicFeatureProposals(moduleSlices);
  const parentFeatures = [
    ...featureSlices,
    ...buildSyntheticFeatureSlicesFromProposals(proposedFeatures),
  ];
  const proposedRequirements = buildHeuristicRequirementProposals(parentFeatures);
  return {
    proposedFeatures,
    proposedRequirements,
    model: null,
    generatedAt,
    meta: {
      agileMap: { ...AGILE_MAP },
      source: 'heuristic',
      llmCalls: 0,
      moduleCount: moduleSlices.length,
      featureCount: featureSlices.length,
    },
  };
}

function applyHierarchyToContainer(container, result) {
  const next = {
    ...container,
    analyses: { ...(container?.analyses || {}) },
  };
  next.analyses.hierarchy = {
    status: 'ready',
    model: result?.model ?? null,
    generatedAt: result?.generatedAt || new Date().toISOString(),
    proposedFeatures: Array.isArray(result?.proposedFeatures) ? result.proposedFeatures : [],
    proposedRequirements: Array.isArray(result?.proposedRequirements)
      ? result.proposedRequirements
      : [],
    items: [],
    entities: [],
    edges: [],
    meta: {
      ...(result?.meta && typeof result.meta === 'object' ? result.meta : {}),
      agileMap: {
        ...AGILE_MAP,
        ...(result?.meta?.agileMap && typeof result.meta.agileMap === 'object'
          ? result.meta.agileMap
          : {}),
      },
    },
  };
  return next;
}

module.exports = {
  AGILE_MAP,
  deriveProposalNames,
  buildHeuristicFeatureProposals,
  buildHeuristicRequirementProposals,
  buildModuleSlices,
  buildFeatureSlices,
  runHierarchyEngine,
  applyHierarchyToContainer,
};
