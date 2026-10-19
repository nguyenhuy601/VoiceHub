/**
 * HOW phải đọc bản WHAT đã duyệt (srsProposal), không đọc snapshot intake.
 * Chỉ ghi đè sheet khi section đã có item được giữ lại.
 */

function textOf(value, max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function acceptedItems(generated, decisions, sectionKey) {
  const items = generated?.[sectionKey]?.items;
  if (!Array.isArray(items)) return [];
  return items.filter((item) => {
    if (!item || typeof item !== 'object') return false;
    if (String(item.status || '').toUpperCase() === 'REJECTED') return false;
    const id = String(item.logicalId || item.id || '').trim();
    const action = String(decisions?.[id]?.action || '').toLowerCase();
    return action !== 'reject' && action !== 'rejected';
  });
}

function mapFr(item, index) {
  const id = textOf(item.logicalId || item.id || `FR-${index + 1}`, 64);
  const title = textOf(item.title || item.name || item.statement || id, 240);
  const ac = Array.isArray(item.acceptanceCriteria)
    ? item.acceptanceCriteria.map((row) => textOf(row, 500)).filter(Boolean).join('\n')
    : textOf(item.acceptanceCriteria || item.ac, 2000);
  return {
    externalId: id,
    level: 'requirement',
    name: title,
    description: textOf(item.description || item.statement || '', 4000),
    module: textOf(item.module || item.moduleName, 120),
    acceptanceCriteria: ac,
    priority: textOf(item.priority || 'Medium', 32) || 'Medium',
    status: 'Draft',
    baNote: 'confirmed:what_proposal',
  };
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

  return { changed: Object.keys(counts).length > 0, counts };
}

module.exports = { overlayConfirmedWhatForHow };
