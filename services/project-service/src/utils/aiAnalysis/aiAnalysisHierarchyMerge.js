/**
 * Merge hierarchyDecomposition proposals into pack.functionalRequirements.
 * Pure — no mongoose.
 */

const { FR_VALID_PARENT_LEVELS } = require('../../constants/requirementTemplate.constants');
const { normId, normProse } = require('../requirement/requirementTemplateTextNorm');

/**
 * Allocate next unique FR-### style id.
 * @param {Iterable<string>} existingIds
 * @param {string} [preferredPrefix='FR']
 */
function allocateFrExternalId(existingIds, preferredPrefix = 'FR') {
  const prefix = String(preferredPrefix || 'FR')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') || 'FR';
  const taken = new Set();
  for (const raw of existingIds || []) {
    const id = normId(raw);
    if (id) taken.add(id);
  }
  let n = 1;
  while (n < 100000) {
    const candidate = `${prefix}-${String(n).padStart(3, '0')}`;
    if (!taken.has(normId(candidate))) return candidate;
    n += 1;
  }
  return `${prefix}-${Date.now()}`;
}

function shouldIncludeProposal(proposal, { onlyAccepted = true } = {}) {
  if (!proposal || typeof proposal !== 'object') return false;
  const status = String(proposal.status || 'accepted').trim().toLowerCase();
  if (status === 'rejected') return false;
  // onlyAccepted=false keeps pending; default still allows accepted + pending (skip rejected only).
  if (onlyAccepted === false && status === 'pending') return true;
  return status === 'accepted' || status === 'pending' || status === '';
}

function proposalToFrRow(proposal, externalId, parentRow) {
  const level = String(proposal.level || '').trim();
  const parentExternalId = String(
    parentRow.externalId || proposal.parentExternalId || ''
  ).trim();
  let moduleLabel = normProse(proposal.moduleLabel || '');
  let featureLabel = normProse(proposal.featureLabel || '');
  if (level === 'Feature') {
    if (!moduleLabel) moduleLabel = normProse(parentRow.name || parentRow.moduleLabel || '');
  }
  if (level === 'Requirement') {
    if (!featureLabel) featureLabel = normProse(parentRow.name || parentRow.featureLabel || '');
    if (!moduleLabel) {
      moduleLabel = normProse(parentRow.moduleLabel || proposal.moduleLabel || '');
    }
  }
  return {
    externalId,
    level,
    parentExternalId,
    name: normProse(proposal.name || '').slice(0, 500),
    description: normProse(proposal.description || '').slice(0, 4000),
    moduleLabel,
    featureLabel,
    priority: 'Medium',
    actor: '',
    acceptanceCriteria: '',
    sortOrder: 0,
  };
}

/**
 * Append accepted hierarchy proposals as FR rows.
 * Feature proposals first; Requirement parents may be Feature proposalIds
 * remapped to newly allocated externalIds.
 * @returns {{ frList: object[], addedCount: number, addedIds: string[] }}
 */
function mergeHierarchyProposalsIntoFrList(
  frList,
  { proposedFeatures = [], proposedRequirements = [] } = {},
  { onlyAccepted = true } = {}
) {
  const list = Array.isArray(frList) ? frList.map((row) => ({ ...row })) : [];
  const existingIds = new Set(list.map((row) => normId(row.externalId)).filter(Boolean));
  const byId = new Map(list.map((row) => [normId(row.externalId), row]));
  const proposalIdToExternalId = new Map();
  const addedIds = [];

  const queue = [
    ...(Array.isArray(proposedFeatures) ? proposedFeatures : []),
    ...(Array.isArray(proposedRequirements) ? proposedRequirements : []),
  ];

  for (const proposal of queue) {
    if (!shouldIncludeProposal(proposal, { onlyAccepted })) continue;

    const level = String(proposal.level || '').trim();
    if (level !== 'Feature' && level !== 'Requirement') continue;

    const parentId = normId(proposal.parentExternalId);
    let parentRow = byId.get(parentId);
    if (!parentRow && proposalIdToExternalId.has(parentId)) {
      parentRow = byId.get(normId(proposalIdToExternalId.get(parentId)));
    }
    if (!parentRow) continue;

    const allowedParents = FR_VALID_PARENT_LEVELS[level] || [];
    const parentLevel = String(parentRow.level || '').trim();
    if (!allowedParents.includes(parentLevel)) continue;

    const name = normProse(proposal.name || '');
    if (!name) continue;

    const externalId = allocateFrExternalId(existingIds, 'FR');
    existingIds.add(normId(externalId));
    const row = proposalToFrRow(proposal, externalId, parentRow);
    list.push(row);
    byId.set(normId(externalId), row);
    addedIds.push(externalId);

    const proposalId = normId(proposal.proposalId);
    if (level === 'Feature' && proposalId) {
      proposalIdToExternalId.set(proposalId, externalId);
    }
  }

  return {
    frList: list,
    addedCount: addedIds.length,
    addedIds,
  };
}

module.exports = {
  allocateFrExternalId,
  mergeHierarchyProposalsIntoFrList,
};
