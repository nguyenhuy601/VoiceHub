/**
 * Project RequirementPack / snapshot canonical → CanonicalRequirementBundle for tools.
 * Read-only projection; no Mongo.
 */

const { asIdList, nonEmptyString } = require('./toolContract');

function pickId(row, ...keys) {
  for (const k of keys) {
    const v = row?.[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

function mapFrNode(row) {
  if (!row || typeof row !== 'object') return null;
  const id = pickId(row, 'externalId', 'id', 'frId');
  if (!id) return null;
  const level = String(row.level || 'requirement').trim().toLowerCase();
  return {
    id,
    level,
    parentId: String(row.parentExternalId || row.parentId || '').trim(),
    name: String(row.name || row.requirement || '').trim(),
    description: String(row.description || '').trim(),
    priority: String(row.priority || 'Medium').trim(),
    actor: String(row.actor || '').trim(),
    trigger: String(row.trigger || '').trim(),
    preconditions: String(row.preconditions || row.precondition || '').trim(),
    mainFlow: String(row.mainFlow || row.mainBehavior || '').trim(),
    exceptionFlow: String(row.exceptionFlow || row.exception || '').trim(),
    businessRules: String(row.businessRules || row.businessRule || '').trim(),
    input: String(row.input || '').trim(),
    output: String(row.output || '').trim(),
    ac: String(row.acceptanceCriteria || row.ac || '').trim(),
    brIds: asIdList(row.brIds || row.brIdsRaw),
    bpmIds: asIdList(row.bpmIds),
    crRefs: asIdList(row.customerRequirementIds || row.crRefs),
    nfrRefs: asIdList(row.nfrRefs || row.nfrIds),
    integrationRefs: asIdList(row.integrationRefs),
    dataEntityIds: asIdList(row.dataEntityIds),
    dependency: String(row.dependency || '').trim(),
    constraint: String(row.constraint || '').trim(),
    assumption: String(row.assumption || '').trim(),
    status: String(row.status || '').trim(),
    moduleLabel: String(row.moduleLabel || row.module || '').trim(),
    capabilityLabel: String(row.capabilityLabel || row.capability || '').trim(),
    featureLabel: String(row.featureLabel || row.feature || '').trim(),
  };
}

function mapNfr(row) {
  if (!row || typeof row !== 'object') return null;
  const id = pickId(row, 'externalId', 'id', 'nfrId');
  if (!id) return null;
  return {
    id,
    category: String(row.category || '').trim(),
    requirement: String(row.requirement || row.name || '').trim(),
    target: String(row.target || '').trim(),
    measurement: String(row.measurement || '').trim(),
    priority: String(row.priority || 'Medium').trim(),
    scope: String(row.scope || '').trim(),
    constraint: String(row.constraint || '').trim(),
    ac: String(row.acceptanceCriteria || row.ac || '').trim(),
    crRefs: asIdList(row.customerRequirementIds || row.crRefs),
  };
}

function mapSimpleArtifact(row, idKeys, titleKeys) {
  if (!row || typeof row !== 'object') return null;
  const id = pickId(row, ...idKeys);
  if (!id) return null;
  const title = pickId(row, ...titleKeys) || id;
  return {
    id,
    title,
    description: String(row.description || row.body || row.goal || row.businessRequirement || '').trim(),
    priority: String(row.priority || '').trim(),
    bgId: pickId(row, 'bgId', 'bgExternalId') || undefined,
    brId: pickId(row, 'brId', 'brExternalId') || undefined,
    frIds: asIdList(row.frIds || row.relatedFrKeys || row.relatedFrIds),
    brIds: asIdList(row.brIds),
    crRefs: asIdList(row.customerRequirementIds || row.crRefs),
    primaryActor: String(row.primaryActor || row.actor || '').trim(),
    businessRule: String(row.businessRule || row.businessRules || '').trim(),
    raw: undefined,
  };
}

function mapUc(row) {
  const base = mapSimpleArtifact(
    row,
    ['externalId', 'id', 'ucId'],
    ['name', 'useCaseName', 'title', 'goal']
  );
  if (!base) return null;
  return {
    ...base,
    frIds: asIdList(row.frIds || row.relatedFrKeys),
    brIds: asIdList(row.brIds),
    mainFlow: String(row.mainFlow || '').trim(),
    exceptionFlow: String(row.exceptionFlow || '').trim(),
  };
}

function mapCapability(row) {
  if (!row || typeof row !== 'object') return null;
  const id = pickId(row, 'id', 'capabilityId', 'externalId');
  if (!id) return null;
  return {
    id,
    frIds: asIdList(row.frIds || row.sourceFrIds || row.requirementIds),
    name: String(row.name || row.title || id).trim(),
  };
}

function mapTask(row) {
  if (!row || typeof row !== 'object') return null;
  const id = pickId(row, 'id', 'taskId', 'workId');
  if (!id) return null;
  return {
    id,
    sourceFrIds: asIdList(row.sourceFrIds || row.frIds || row.requirementIds),
    name: String(row.name || row.title || id).trim(),
  };
}

function buildTraceLinksFromBundle({ fr, bg, br, bpm, uc, traceRows }) {
  const edges = [];
  const push = (from, to, type) => {
    if (!from || !to) return;
    edges.push({ from: String(from), to: String(to), type: String(type) });
  };

  for (const row of fr) {
    for (const cr of row.crRefs || []) push(cr, row.id, 'derives');
    for (const brId of row.brIds || []) push(brId, row.id, 'derives');
    for (const bpmId of row.bpmIds || []) push(bpmId, row.id, 'derives');
    for (const nfrId of row.nfrRefs || []) push(nfrId, row.id, 'constrains');
    if (row.parentId) push(row.parentId, row.id, 'parent');
  }

  for (const row of br) {
    if (row.bgId) push(row.bgId, row.id, 'derives');
    for (const cr of row.crRefs || []) push(cr, row.id, 'derives');
  }

  for (const row of bpm) {
    if (row.brId) push(row.brId, row.id, 'derives');
  }

  for (const row of uc) {
    for (const frId of row.frIds || []) push(row.id, frId, 'covers');
    for (const brId of row.brIds || []) push(brId, row.id, 'derives');
  }

  for (const row of traceRows || []) {
    const analysisId = pickId(row, 'analysisId', 'Analysis ID', 'id');
    const crId = pickId(row, 'customerRequirementId', 'Customer Requirement ID', 'crId');
    const rel = String(row.relationship || row.Relationship || 'Derived').trim().toLowerCase();
    if (analysisId && crId) {
      push(crId, analysisId, rel === 'duplicate' ? 'duplicate' : 'derives');
    }
  }

  // dedupe
  const seen = new Set();
  return edges.filter((e) => {
    const k = `${e.from}|${e.to}|${e.type}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * @param {{ pack?: object, snapshot?: object, aiAnalysis?: object }} sources
 */
function projectCanonicalBundle(sources = {}) {
  const pack = sources.pack && typeof sources.pack === 'object' ? sources.pack : {};
  const snapshot =
    sources.snapshot && typeof sources.snapshot === 'object' ? sources.snapshot : {};
  const aiAnalysis =
    sources.aiAnalysis ||
    pack.aiAnalysis ||
    (snapshot.merged && snapshot.merged.aiAnalysis) ||
    {};

  const canonical = snapshot.canonical && typeof snapshot.canonical === 'object'
    ? snapshot.canonical
    : {};

  const frSrc =
    (Array.isArray(canonical.functionalRequirements) && canonical.functionalRequirements) ||
    (Array.isArray(pack.functionalRequirements) && pack.functionalRequirements) ||
    [];
  const nfrSrc =
    (Array.isArray(canonical.nonFunctionalRequirements) &&
      canonical.nonFunctionalRequirements) ||
    (Array.isArray(pack.nonFunctionalRequirements) && pack.nonFunctionalRequirements) ||
    [];

  const fr = frSrc.map(mapFrNode).filter(Boolean);
  const nfr = nfrSrc.map(mapNfr).filter(Boolean);
  const bg = (pack.businessGoals || []).map((r) =>
    mapSimpleArtifact(r, ['externalId', 'id', 'bgId'], ['goal', 'title', 'name'])
  ).filter(Boolean);
  const br = (pack.businessRules || []).map((r) =>
    mapSimpleArtifact(
      r,
      ['externalId', 'id', 'brId'],
      ['businessRequirement', 'title', 'name']
    )
  ).filter(Boolean);
  const bpm = (pack.businessProcesses || []).map((r) =>
    mapSimpleArtifact(r, ['externalId', 'id', 'bpmId'], ['processName', 'title', 'name'])
  ).filter(Boolean);
  const uc = (pack.useCases || []).map(mapUc).filter(Boolean);
  const traceRows = Array.isArray(pack.traceabilityLinks) ? pack.traceabilityLinks : [];

  const capItems = aiAnalysis?.analyses?.capability?.items || [];
  const capabilities = (Array.isArray(capItems) ? capItems : []).map(mapCapability).filter(Boolean);
  const tasks = (aiAnalysis?.planning?.tasks || []).map(mapTask).filter(Boolean);

  const overview = pack.overview || {};
  const scopeIn = (pack.scope || [])
    .filter((s) => s?.type === 'in')
    .map((s) => String(s.description || '').trim())
    .filter(Boolean);
  const scopeOut = (pack.scope || [])
    .filter((s) => s?.type === 'out')
    .map((s) => String(s.description || '').trim())
    .filter(Boolean);

  const context = {
    objective: String(overview.projectObjective || overview.businessScope || '').trim(),
    constraints: (pack.constraints || [])
      .map((c) => (typeof c === 'string' ? c : c?.description || c?.name || ''))
      .map((s) => String(s).trim())
      .filter(Boolean),
    technology: (pack.technology || [])
      .map((t) => String(t?.name || t || '').trim())
      .filter(Boolean),
    integrations: (pack.integration || pack.integrations || [])
      .map((i) => String(i?.name || i?.system || i || '').trim())
      .filter(Boolean),
    scopeIn,
    scopeOut,
  };

  const traceLinks = buildTraceLinksFromBundle({ fr, bg, br, bpm, uc, traceRows });

  // Link NFR→FR when FR.nfrRefs empty: leave as-is (optional later)

  const snapshotMeta = {
    graphVersion: 1,
    packContentHash: String(snapshot.packContentHash || pack.packContentHash || '').trim(),
    srsVersion: String(
      snapshot.versions?.srs || pack.templateVersion || pack.versionNumber || ''
    ).trim(),
    snapshotId: snapshot._id ? String(snapshot._id) : '',
  };

  return {
    fr,
    nfr,
    bg,
    br,
    bpm,
    uc,
    traceRows,
    traceLinks,
    capabilities,
    tasks,
    context,
    snapshotMeta,
    dependencyDegree: {},
    scope: Array.isArray(pack.scope) ? pack.scope : [],
    baseline: pack.baseline || null,
  };
}

function isFrLeaf(frList, node) {
  if (!node) return false;
  const level = String(node.level || '').toLowerCase();
  if (level === 'requirement') return true;
  // leaf = no children in tree
  return !frList.some((c) => c.parentId === node.id);
}

function listFrLeaves(frList) {
  const list = Array.isArray(frList) ? frList : [];
  return list.filter((n) => isFrLeaf(list, n));
}

module.exports = {
  projectCanonicalBundle,
  mapFrNode,
  mapNfr,
  mapUc,
  buildTraceLinksFromBundle,
  isFrLeaf,
  listFrLeaves,
  nonEmptyString,
};
