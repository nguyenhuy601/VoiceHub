import { entityRelId } from './projectHubBacklogStats.js';

/**
 * Parent title cho thẻ Board — camelCase thống nhất với OverviewTab.
 * Feature → epic (parentId); Task → feature / epic / parentTask.
 */
export function resolveBoardParentTitle(card, { epics = [], features = [], allCards = [] } = {}) {
  if (!card) return '';
  const kind = String(card.kind || '').toLowerCase();
  const issueType = String(card.issueType || card.type || '').toLowerCase();
  const isFeature = kind === 'planning' || issueType === 'feature';

  if (isFeature) {
    const parentId = entityRelId(card.parentId || card.epicId);
    if (!parentId) return '';
    const epic = (epics || []).find((e) => entityRelId(e._id || e.id) === parentId);
    return String(epic?.title || '').trim();
  }

  const featureId = entityRelId(card.featureId);
  if (featureId) {
    const feature = (features || []).find((f) => entityRelId(f._id || f.id) === featureId);
    if (feature?.title) return String(feature.title).trim();
  }

  const epicId = entityRelId(card.epicId);
  if (epicId) {
    const epic = (epics || []).find((e) => entityRelId(e._id || e.id) === epicId);
    if (epic?.title) return String(epic.title).trim();
  }

  const parentTaskId = entityRelId(card.parentTaskId);
  if (parentTaskId) {
    const parentCard = (allCards || []).find((c) => entityRelId(c._id || c.id) === parentTaskId);
    if (parentCard?.title) return String(parentCard.title).trim();
  }

  return '';
}
