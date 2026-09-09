/**
 * Compact FR slices for AI Analysis jobs — truncate, WHAT-only Requirement rows.
 */

const { listRequirementRows } = require('./requirementFrLevel');
const { normId, normProse } = require('./requirementTemplateTextNorm');

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
  buildProjectContextSlice,
  truncate,
};
