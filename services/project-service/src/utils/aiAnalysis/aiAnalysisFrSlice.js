/**
 * Compact FR slices for AI Analysis jobs — truncate, WHAT-only Requirement rows.
 */

const {
  listRequirementRows,
  listModuleRows,
  listFeatureRows,
  buildFrChildrenByParent,
} = require('../requirement/requirementFrLevel');
const { normId, normProse } = require('../requirement/requirementTemplateTextNorm');

const TITLE_MAX = 120;
const DESC_MAX = 280;
const AC_MAX = 200;
const ACTOR_MAX = 64;
const CONTEXT_MAX = 160;

function truncate(raw, max) {
  const s = normProse(raw);
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

function buildFrIdSet(frList = []) {
  const set = new Set();
  for (const row of frList || []) {
    const id = normId(row.externalId);
    if (id) set.add(id);
  }
  return set;
}

function childrenMatchingLevel(childrenByParent, parentRow, level) {
  const rawId = String(parentRow.externalId || '').trim();
  const nid = normId(parentRow.externalId);
  const direct = childrenByParent.get(rawId) || childrenByParent.get(nid) || [];
  return direct.filter((row) => String(row.level || '').trim() === level);
}

/**
 * @returns {{ id, module, feature, title, description?, actor?, ac? }[]}
 */
function buildRequirementFrSlices(pack, { maxItems = 200 } = {}) {
  const frList = pack?.functionalRequirements || [];
  const byId = new Map(frList.map((r) => [normId(r.externalId), r]));
  const requirements = listRequirementRows(frList);
  const slices = [];

  for (const row of requirements) {
    if (slices.length >= maxItems) break;
    const id = normId(row.externalId);
    if (!id) continue;

    let moduleLabel = normProse(row.moduleLabel || '');
    let featureLabel = normProse(row.featureLabel || '');
    const parent = byId.get(normId(row.parentExternalId));
    if (parent) {
      if (!featureLabel) featureLabel = normProse(parent.name || parent.featureLabel || '');
      const grand = byId.get(normId(parent.parentExternalId));
      if (!moduleLabel) {
        moduleLabel = normProse(
          parent.moduleLabel || grand?.name || grand?.moduleLabel || parent.name || ''
        );
      }
    }
    if (!moduleLabel) moduleLabel = 'General';

    slices.push({
      id,
      module: truncate(moduleLabel, 80),
      feature: featureLabel ? truncate(featureLabel, 80) : '',
      title: truncate(row.name || id, TITLE_MAX),
      description: truncate(row.description || '', DESC_MAX) || undefined,
      actor: truncate(row.actor || '', ACTOR_MAX) || undefined,
      ac: truncate(row.acceptanceCriteria || '', AC_MAX) || undefined,
    });
  }
  return slices;
}

function proposalParentNameKey(parentExternalId, name) {
  const parent = normId(parentExternalId);
  const n = normProse(name || '').toLowerCase();
  if (!parent || !n) return '';
  return `${parent}::${n}`;
}

/**
 * Resolve module/feature labels for a hierarchy Requirement proposal from pack parents.
 */
function resolveHierarchyProposalLabels(pack, proposal) {
  let moduleLabel = normProse(proposal?.moduleLabel || '');
  let featureLabel = normProse(proposal?.featureLabel || '');
  const frList = pack?.functionalRequirements || [];
  const byId = new Map(frList.map((r) => [normId(r.externalId), r]));
  const parent = byId.get(normId(proposal?.parentExternalId));
  if (parent) {
    if (!featureLabel) featureLabel = normProse(parent.name || parent.featureLabel || '');
    const grand = byId.get(normId(parent.parentExternalId));
    if (!moduleLabel) {
      moduleLabel = normProse(
        parent.moduleLabel || grand?.name || grand?.moduleLabel || parent.name || ''
      );
    }
  }
  if (!moduleLabel) moduleLabel = 'General';
  return { moduleLabel, featureLabel };
}

/**
 * Union of pack Requirement rows + hierarchy proposedRequirements (status ≠ rejected).
 * Pack wins on id or (parentExternalId, name) collision.
 * @returns {{ id, module, feature, title, description?, actor?, ac?, source? }[]}
 */
function buildRequirementFrSlicesForAnalysis(pack, hierarchySection, { maxItems = 200 } = {}) {
  const slices = buildRequirementFrSlices(pack, { maxItems });
  const seenIds = new Set(slices.map((s) => s.id));
  const seenKeys = new Set();
  for (const row of listRequirementRows(pack?.functionalRequirements || [])) {
    const key = proposalParentNameKey(row.parentExternalId, row.name);
    if (key) seenKeys.add(key);
  }

  const proposals = Array.isArray(hierarchySection?.proposedRequirements)
    ? hierarchySection.proposedRequirements
    : [];

  for (const proposal of proposals) {
    if (slices.length >= maxItems) break;
    const status = String(proposal?.status || 'accepted').toLowerCase();
    if (status === 'rejected') continue;

    const name = normProse(proposal?.name || proposal?.title || '');
    if (!name) continue;

    const parentExternalId = proposal?.parentExternalId;
    const key = proposalParentNameKey(parentExternalId, name);
    if (key && seenKeys.has(key)) continue;

    const id =
      normId(proposal?.proposalId || proposal?.id) ||
      `PROP-R-${normId(parentExternalId) || 'x'}-${slices.length + 1}`;
    if (seenIds.has(id)) continue;

    const { moduleLabel, featureLabel } = resolveHierarchyProposalLabels(pack, proposal);
    seenIds.add(id);
    if (key) seenKeys.add(key);

    slices.push({
      id,
      module: truncate(moduleLabel, 80),
      feature: featureLabel ? truncate(featureLabel, 80) : '',
      title: truncate(name, TITLE_MAX),
      description: truncate(proposal?.description || '', DESC_MAX) || undefined,
      source: 'hierarchy_proposal',
    });
  }

  return slices;
}

/**
 * Expand pack FR id set with analysis slice ids (includes hierarchy proposal ids).
 */
function expandFrIdSetWithSlices(packFrIds, frSlices = []) {
  const set = packFrIds instanceof Set ? new Set(packFrIds) : buildFrIdSet(packFrIds || []);
  for (const slice of frSlices || []) {
    const id = normId(slice?.id);
    if (id) set.add(id);
  }
  return set;
}

/**
 * @returns {{ id, title, description?, childFeatureIds[], childFeatureTitles[] }[]}
 */
function buildModuleSlices(pack, { maxItems = 200 } = {}) {
  const frList = pack?.functionalRequirements || [];
  const childrenByParent = buildFrChildrenByParent(frList);
  const modules = listModuleRows(frList);
  const slices = [];

  for (const row of modules) {
    if (slices.length >= maxItems) break;
    const id = normId(row.externalId);
    if (!id) continue;
    const features = childrenMatchingLevel(childrenByParent, row, 'Feature');
    slices.push({
      id,
      title: truncate(row.name || id, TITLE_MAX),
      description: truncate(row.description || '', DESC_MAX) || undefined,
      childFeatureIds: features.map((f) => normId(f.externalId)).filter(Boolean),
      childFeatureTitles: features.map((f) => truncate(f.name || f.externalId || '', TITLE_MAX)),
    });
  }
  return slices;
}

/**
 * @returns {{ id, moduleId, moduleTitle, title, description?, actor?, childRequirementIds[], childRequirementTitles[] }[]}
 */
function buildFeatureSlices(pack, { maxItems = 200 } = {}) {
  const frList = pack?.functionalRequirements || [];
  const byId = new Map(frList.map((r) => [normId(r.externalId), r]));
  const childrenByParent = buildFrChildrenByParent(frList);
  const features = listFeatureRows(frList);
  const slices = [];

  for (const row of features) {
    if (slices.length >= maxItems) break;
    const id = normId(row.externalId);
    if (!id) continue;
    const moduleId = normId(row.parentExternalId);
    const moduleRow = byId.get(moduleId);
    const moduleTitle = truncate(
      moduleRow?.name || row.moduleLabel || moduleId || '',
      TITLE_MAX
    );
    const requirements = childrenMatchingLevel(childrenByParent, row, 'Requirement');
    slices.push({
      id,
      moduleId: moduleId || '',
      moduleTitle,
      title: truncate(row.name || id, TITLE_MAX),
      description: truncate(row.description || '', DESC_MAX) || undefined,
      actor: truncate(row.actor || '', ACTOR_MAX) || undefined,
      childRequirementIds: requirements.map((r) => normId(r.externalId)).filter(Boolean),
      childRequirementTitles: requirements.map((r) =>
        truncate(r.name || r.externalId || '', TITLE_MAX)
      ),
      mainFlow: truncate(row.mainFlow || '', DESC_MAX) || undefined,
    });
  }
  return slices;
}

function buildProjectContextSlice(pack) {
  const o = pack?.overview || {};
  return {
    name: truncate(o.requirementName || '', CONTEXT_MAX),
    objective: truncate(o.projectObjective || '', CONTEXT_MAX),
    platform: Array.isArray(o.platform)
      ? o.platform.slice(0, 4).map(String)
      : truncate(o.platform || '', 64)
        ? [truncate(o.platform, 64)]
        : [],
    priority: truncate(o.priority || '', 32) || undefined,
  };
}

module.exports = {
  buildFrIdSet,
  buildRequirementFrSlices,
  buildRequirementFrSlicesForAnalysis,
  expandFrIdSetWithSlices,
  buildModuleSlices,
  buildFeatureSlices,
  buildProjectContextSlice,
  truncate,
};
