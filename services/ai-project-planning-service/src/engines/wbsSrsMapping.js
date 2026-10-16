/**
 * Soft SRS → Agile WBS mapping.
 * Epic ← Business Goal (outcome); Feature ← product capability / module;
 * Story/Task keep FR/UC/NFR as source*Ids only (traceability), not hierarchy identity.
 */

const { normalizeNameKey, namesEqual, resolveFeatureDisplayName } = require('./wbsAgileNaming');

function listFrRows(pack = {}) {
  if (Array.isArray(pack.functionalRequirements)) return pack.functionalRequirements;
  if (Array.isArray(pack.frList)) return pack.frList;
  if (Array.isArray(pack.requirements)) return pack.requirements;
  return [];
}

function listBgRows(pack = {}) {
  if (Array.isArray(pack.businessGoals)) return pack.businessGoals;
  if (Array.isArray(pack.goals)) return pack.goals;
  return [];
}

function listNfrRows(pack = {}) {
  if (Array.isArray(pack.nonFunctionalRequirements)) return pack.nonFunctionalRequirements;
  if (Array.isArray(pack.nfrs)) return pack.nfrs;
  return [];
}

function listUcRows(pack = {}) {
  if (Array.isArray(pack.useCases)) return pack.useCases;
  if (Array.isArray(pack.ucList)) return pack.ucList;
  return [];
}

function frRowId(row, index = 0) {
  return String(row?.externalId || row?.id || row?._id || `FR-${index + 1}`).trim();
}

function bgRowId(row, index = 0) {
  return String(row?.goalId || row?.externalId || row?.id || row?._id || `BG-${index + 1}`).trim();
}

function bgDisplayName(row, index = 0) {
  const text = String(
    row?.statement || row?.name || row?.title || row?.businessGoal || bgRowId(row, index)
  )
    .trim()
    .slice(0, 120);
  return text || bgRowId(row, index);
}

function nfrRowId(row, index = 0) {
  return String(row?.nfrId || row?.externalId || row?.id || row?._id || `NFR-${index + 1}`).trim();
}

function relatedIds(row, keys = []) {
  const out = [];
  for (const key of keys) {
    const val = row?.[key];
    if (Array.isArray(val)) out.push(...val.map(String).filter(Boolean));
    else if (val != null && String(val).trim()) out.push(String(val).trim());
  }
  return [...new Set(out)];
}

/**
 * FR id → primary Business Goal { id, name }.
 * Prefers BG.relatedFrIds; also FR.relatedBgIds / businessGoalId.
 */
function buildFrToBgIndex(pack = {}) {
  const map = new Map();
  const bgs = listBgRows(pack);

  bgs.forEach((row, i) => {
    const id = bgRowId(row, i);
    const name = bgDisplayName(row, i);
    const frIds = relatedIds(row, ['relatedFrIds', 'sourceFrIds', 'frIds']);
    for (const frId of frIds) {
      if (!map.has(frId)) map.set(frId, { id, name });
    }
  });

  listFrRows(pack).forEach((row, i) => {
    const frId = frRowId(row, i);
    if (map.has(frId)) return;
    const bgRefs = relatedIds(row, [
      'relatedBgIds',
      'sourceBgIds',
      'businessGoalIds',
      'goalIds',
      'businessGoalId',
      'goalId',
    ]);
    if (!bgRefs.length) return;
    const bgRef = bgRefs[0];
    const hit = bgs.find((g, j) => bgRowId(g, j) === bgRef);
    if (hit) {
      map.set(frId, { id: bgRef, name: bgDisplayName(hit, bgs.indexOf(hit)) });
    }
  });

  return map;
}

/**
 * FR id → NFR ids (soft).
 */
function buildFrToNfrIndex(pack = {}) {
  const map = new Map();
  listNfrRows(pack).forEach((row, i) => {
    const id = nfrRowId(row, i);
    const frIds = relatedIds(row, ['relatedFrIds', 'sourceFrIds', 'frIds']);
    for (const frId of frIds) {
      if (!map.has(frId)) map.set(frId, []);
      map.get(frId).push(id);
    }
  });
  listFrRows(pack).forEach((row, i) => {
    const frId = frRowId(row, i);
    const fromFr = relatedIds(row, ['relatedNfrIds', 'sourceNfrIds', 'nfrIds']);
    if (!fromFr.length) return;
    const cur = map.get(frId) || [];
    map.set(frId, [...new Set([...cur, ...fromFr])]);
  });
  return map;
}

function capabilityForFr(capabilities = [], frId) {
  return (capabilities || []).find((c) =>
    (c.sourceFrIds || []).map(String).includes(String(frId))
  );
}

/**
 * Epic = business outcome (BG). Fallback: project overview outcome, then module.
 * @returns {{ epicKey: string, epicName: string, sourceBgIds: string[], epicOrigin: 'bg'|'overview'|'module' }}
 */
function resolveEpicPlacement({ frId, frRow = {}, pack = {}, frToBg = null } = {}) {
  const index = frToBg || buildFrToBgIndex(pack);
  const linked = index.get(String(frId));
  if (linked?.id && linked?.name) {
    return {
      epicKey: `bg:${linked.id}`,
      epicName: linked.name,
      sourceBgIds: [linked.id],
      epicOrigin: 'bg',
    };
  }

  const overview = pack.overview || {};
  const outcome = String(
    overview.projectObjective || overview.requirementName || overview.businessScope || ''
  ).trim();
  if (outcome) {
    const key = normalizeNameKey(outcome).slice(0, 48) || 'outcome';
    return {
      epicKey: `outcome:${key}`,
      epicName: outcome.slice(0, 120),
      sourceBgIds: [],
      epicOrigin: 'overview',
    };
  }

  const rawModule = String(
    frRow.module || frRow.moduleLabel || frRow.moduleName || ''
  ).trim();
  // "General" is a weak placeholder from import — prefer pack title, else "Delivery"
  if (!rawModule || /^general$/i.test(rawModule)) {
    const packTitle = String(
      pack?.name || pack?.title || pack?.projectName || pack?.requirementName || ''
    ).trim();
    if (packTitle) {
      return {
        epicKey: `pack:${normalizeNameKey(packTitle).slice(0, 48) || 'pack'}`,
        epicName: packTitle.slice(0, 120),
        sourceBgIds: [],
        epicOrigin: 'pack',
      };
    }
    return {
      epicKey: 'module:delivery',
      epicName: 'Delivery',
      sourceBgIds: [],
      epicOrigin: 'fallback',
    };
  }
  return {
    epicKey: `module:${normalizeNameKey(rawModule) || 'module'}`,
    epicName: rawModule,
    sourceBgIds: [],
    epicOrigin: 'module',
  };
}

/**
 * Feature = product capability — never FR title.
 * Prefer explicit feature → distinct capability name → module → bucket.
 */
function resolveFeaturePlacement({
  frId,
  frRow = {},
  frName = '',
  capabilities = [],
  pack = {},
} = {}) {
  const title =
    String(frName || frRow.name || frRow.title || frId || '').trim() || String(frId || '');
  const moduleName =
    String(frRow.module || frRow.moduleLabel || frRow.moduleName || 'General').trim() ||
    'General';
  const cap = capabilityForFr(capabilities, frId);
  const featureName = resolveFeatureDisplayName({
    feature: frRow.feature || frRow.featureName || frRow.featureLabel || cap?.feature,
    capabilityName: cap?.name,
    frName: title,
    moduleName: cap?.module || moduleName,
  });
  const featureKey = `${moduleName}::${featureName}`;
  const sourceCapabilityIds = cap?.capabilityId ? [String(cap.capabilityId)] : [];

  return {
    featureKey,
    featureName,
    moduleName,
    sourceCapabilityIds,
    capability: cap || null,
  };
}

/**
 * Soft trace bag for Story/Task — SRS refs, not hierarchy keys.
 */
function resolveSoftTrace({
  frId,
  pack = {},
  planningHints = null,
  frToBg = null,
  frToNfr = null,
  capabilities = [],
  sourceUcIds = null,
} = {}) {
  const bgIndex = frToBg || buildFrToBgIndex(pack);
  const nfrIndex = frToNfr || buildFrToNfrIndex(pack);
  const bg = bgIndex.get(String(frId));
  const cap = capabilityForFr(capabilities, frId);

  let ucIds = Array.isArray(sourceUcIds) ? sourceUcIds.map(String).filter(Boolean) : [];
  if (!ucIds.length) {
    const fr = listFrRows(pack).find((r, i) => frRowId(r, i) === String(frId));
    if (fr) {
      ucIds.push(...relatedIds(fr, ['useCaseIds', 'sourceUcIds', 'relatedUcIds', 'ucIds']));
    }
    for (const uc of listUcRows(pack)) {
      const frs = relatedIds(uc, ['sourceFrIds', 'frIds', 'relatedFrIds']);
      if (frs.includes(String(frId))) {
        ucIds.push(
          String(uc.externalId || uc.id || uc.ucKey || uc.ucId || '').trim()
        );
      }
    }
  }
  // Do not broadcast planningHints.ucIds onto every FR (noisy); pack links only.

  return {
    sourceFrIds: frId ? [String(frId)] : [],
    sourceBgIds: bg?.id ? [String(bg.id)] : [],
    sourceNfrIds: [...new Set((nfrIndex.get(String(frId)) || []).map(String))],
    sourceUcIds: [...new Set(ucIds.filter(Boolean))],
    sourceCapabilityIds: cap?.capabilityId ? [String(cap.capabilityId)] : [],
  };
}

/**
 * Build indexes once per WBS run.
 */
function buildSrsMappingContext(pack = {}, capabilities = [], planningHints = null) {
  return {
    pack,
    capabilities: Array.isArray(capabilities) ? capabilities : [],
    planningHints,
    frToBg: buildFrToBgIndex(pack),
    frToNfr: buildFrToNfrIndex(pack),
  };
}

module.exports = {
  listFrRows,
  listBgRows,
  listNfrRows,
  listUcRows,
  frRowId,
  bgRowId,
  bgDisplayName,
  nfrRowId,
  relatedIds,
  buildFrToBgIndex,
  buildFrToNfrIndex,
  capabilityForFr,
  resolveEpicPlacement,
  resolveFeaturePlacement,
  resolveSoftTrace,
  buildSrsMappingContext,
  namesEqual,
};
