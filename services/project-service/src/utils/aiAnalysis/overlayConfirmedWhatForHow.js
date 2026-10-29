/**
 * HOW phải đọc bản WHAT đã duyệt (srsProposal), không đọc snapshot intake.
 * Chỉ ghi đè sheet khi section đã có item được giữ lại.
 */

const {
  textOf,
  frParentId,
  applyFrParentDualWrite,
} = require('./fieldMapCanon');

function acceptedItems(generated, decisions, sectionKey) {
  const items = generated?.[sectionKey]?.items;
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => {
      if (!item || typeof item !== 'object') return false;
      if (String(item.status || '').toUpperCase() === 'REJECTED') return false;
      const id = String(item.logicalId || item.id || '').trim();
      const action = String(decisions?.[id]?.action || '').toLowerCase();
      return action !== 'reject' && action !== 'rejected';
    })
    .map((item) => {
      const id = String(item.logicalId || item.id || '').trim();
      const d = decisions?.[id];
      const action = String(d?.action || '').toLowerCase();
      const payload =
        d?.editedPayload && typeof d.editedPayload === 'object' ? d.editedPayload : null;
      if (!payload || !['edit', 'accept', 'create'].includes(action)) return item;
      // RULE-E7: FR field edits apply; parentEpicId stays on the item (epicTitle is catalog-only).
      return {
        ...item,
        ...payload,
        parentEpicId: item.parentEpicId,
        logicalId: item.logicalId || item.id,
        id: item.id || item.logicalId,
      };
    });
}

function mapFr(item, index) {
  const id = textOf(item.logicalId || item.id || `FR-${index + 1}`, 64);
  const title = textOf(item.title || item.name || item.statement || id, 240);
  const ac = Array.isArray(item.acceptanceCriteria)
    ? item.acceptanceCriteria.map((row) => textOf(row, 500)).filter(Boolean).join('\n')
    : textOf(item.acceptanceCriteria || item.ac, 2000);
  // level phải đúng casing 'Requirement' — listRequirementRows / packContentHash lọc exact.
  // RULE-01: dual-write parentExternalId + parentEpicId for seed RA + HOW WBS.
  const out = {
    externalId: id,
    level: 'Requirement',
    name: title || id,
    description: textOf(item.description || item.statement || '', 4000),
    moduleLabel: textOf(item.module || item.moduleName || item.moduleLabel, 120),
    featureLabel: textOf(item.feature || item.featureName || item.featureLabel, 120),
    acceptanceCriteria: ac,
    priority: textOf(item.priority || 'Medium', 32) || 'Medium',
    status: 'Draft',
    baNote: 'confirmed:what_proposal',
  };
  const parentId = frParentId(item);
  applyFrParentDualWrite(out, parentId);
  return out;
}

function mapUc(item, index) {
  const id = textOf(item.logicalId || item.id || `UC-${index + 1}`, 64);
  const related = Array.isArray(item.relatedFrIds)
    ? item.relatedFrIds.map((row) => textOf(row, 64)).filter(Boolean)
    : [];
  return {
    externalId: id,
    title: textOf(item.title || item.name || id, 240),
    goal: textOf(item.description || item.goal, 4000),
    actor: textOf(item.actor || (Array.isArray(item.actors) ? item.actors[0] : ''), 120),
    relatedFrIds: related,
    priority: textOf(item.priority || 'Medium', 32) || 'Medium',
    status: 'Draft',
    baNote: 'confirmed:what_proposal',
  };
}

function mapNfr(item, index) {
  const id = textOf(item.logicalId || item.id || `NFR-${index + 1}`, 64);
  return {
    externalId: id,
    name: textOf(item.title || item.name || `NFR ${index + 1}`, 240),
    category: textOf(item.category || 'Quality', 64),
    requirement: textOf(item.requirement || item.description || item.title, 2000),
    target: textOf(item.target, 500),
    priority: textOf(item.priority || 'Medium', 32),
    status: 'Draft',
    baNote: 'confirmed:what_proposal',
  };
}

function mapGoal(item, index) {
  const id = textOf(item.logicalId || item.id || `BG-${index + 1}`, 64);
  return {
    externalId: id,
    title: textOf(item.title || item.name || id, 240),
    statement: textOf(item.description || item.statement || item.title, 4000),
    priority: textOf(item.priority || 'Medium', 32) || 'Medium',
    status: 'Draft',
    baNote: 'confirmed:what_proposal',
  };
}

function mapRule(item, index) {
  const id = textOf(item.logicalId || item.id || `BR-${index + 1}`, 64);
  return {
    externalId: id,
    title: textOf(item.title || item.name || id, 240),
    description: textOf(item.description || item.rule || item.title, 4000),
    status: 'Draft',
    baNote: 'confirmed:what_proposal',
  };
}

function mapProcess(item, index) {
  const id = textOf(item.logicalId || item.id || `BPM-${index + 1}`, 64);
  return {
    externalId: id,
    processName: textOf(item.title || item.name || id, 240),
    processDescription: textOf(item.description, 4000),
    status: 'Draft',
    baNote: 'confirmed:what_proposal',
  };
}

function mapScope(item) {
  const typeRaw = String(item.type || item.scopeType || 'in').toLowerCase();
  const type = typeRaw.includes('out') ? 'out' : 'in';
  const description = textOf(item.description || item.title || item.text, 2000);
  if (!description) return null;
  return { type, scopeType: type, description };
}

function mapEntity(item, index) {
  const id = textOf(item.logicalId || item.id || `DATA-${index + 1}`, 64);
  const entity = textOf(item.entity || item.name || item.title || id, 240);
  return {
    externalId: id,
    externalKey: id,
    entity: entity || id,
    attributes: textOf(item.attributes || item.fields || '', 2000),
    validationRules: textOf(item.validationRules || '', 2000),
    description: textOf(item.description || item.summary || '', 4000),
    status: 'Draft',
    baNote: 'confirmed:what_proposal',
  };
}

function mapActor(item, index) {
  const id = textOf(item.logicalId || item.id || `ACTOR-${index + 1}`, 64);
  const name = textOf(item.name || item.title || item.actor || id, 240);
  return {
    externalId: id,
    externalKey: id,
    name: name || id,
    role: textOf(item.role || item.type || '', 120),
    description: textOf(item.description || item.summary || item.goal || '', 4000),
    status: 'Draft',
    baNote: 'confirmed:what_proposal',
  };
}

/**
 * @param {object} pack mongoose doc or plain
 * @returns {{ changed: boolean, counts: Record<string, number> }}
 */
function overlayConfirmedWhatForHow(pack) {
  const proposal = pack?.aiAnalysis?.analyses?.srsProposal;
  const generated = proposal?.generated;
  if (!generated || typeof generated !== 'object') {
    return { changed: false, counts: {} };
  }
  const decisions =
    proposal.review?.decisions && typeof proposal.review.decisions === 'object'
      ? proposal.review.decisions
      : {};

  const counts = {};
  const write = (field, rows) => {
    if (!rows.length) return;
    pack[field] = rows;
    if (typeof pack.markModified === 'function') pack.markModified(field);
    counts[field] = rows.length;
  };

  write('functionalRequirements', acceptedItems(generated, decisions, 'functionalRequirements').map(mapFr));
  write('useCases', acceptedItems(generated, decisions, 'useCases').map(mapUc));
  write(
    'nonFunctionalRequirements',
    acceptedItems(generated, decisions, 'nonFunctionalRequirements').map(mapNfr)
  );
  write('businessGoals', acceptedItems(generated, decisions, 'businessGoals').map(mapGoal));
  write('businessRules', acceptedItems(generated, decisions, 'businessRules').map(mapRule));
  write('businessProcesses', acceptedItems(generated, decisions, 'processes').map(mapProcess));
  write(
    'scope',
    acceptedItems(generated, decisions, 'scope').map(mapScope).filter(Boolean)
  );
  write('dataEntities', acceptedItems(generated, decisions, 'entities').map(mapEntity));
  write('actors', acceptedItems(generated, decisions, 'actors').map(mapActor));

  return { changed: Object.keys(counts).length > 0, counts };
}

module.exports = {
  overlayConfirmedWhatForHow,
  mapFr,
  mapEntity,
  mapActor,
};
