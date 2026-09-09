import { classifyListStatusBucket } from './projectHubUtils.js';

export function entityRelId(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'object') return String(v._id || v.id || '').trim();
  return String(v).trim();
}

/** Cards có parentTaskId = parent (cấp con trực tiếp). */
export function cardsUnderParent(cards = [], parentId) {
  const pid = entityRelId(parentId);
  if (!pid) return [];
  return (Array.isArray(cards) ? cards : []).filter((c) => entityRelId(c.parentTaskId) === pid);
}

function isDirectChildCard(card, parentId, parentWorkType) {
  const pid = entityRelId(parentId);
  if (!pid) return false;
  const cardParentTaskId = entityRelId(card?.parentTaskId);
  const cardFeatureId = entityRelId(card?.featureId);
  const cardEpicId = entityRelId(card?.epicId);
  const parentType = String(parentWorkType || '').toLowerCase();

  // Align với buildListTree:
  // - Feature => cards featureId=pid, không parentTaskId
  // - Epic => cards epicId=pid, không featureId / parentTaskId
  // - Card => parentTaskId=pid
  if (parentType === 'feature') return cardFeatureId === pid && !cardParentTaskId;
  if (parentType === 'epic') return cardEpicId === pid && !cardFeatureId && !cardParentTaskId;
  return cardParentTaskId === pid;
}

/** Direct children theo work type parent (Feature/Epic/card). */
export function directChildCards(cards = [], parentId, parentWorkType = null) {
  const pid = entityRelId(parentId);
  if (!pid) return [];
  return (Array.isArray(cards) ? cards : []).filter((c) => isDirectChildCard(c, pid, parentWorkType));
}

/**
 * Đếm work con và số con đã Done — dùng icon cây Backlog / List.
 * @returns {{ total: number, done: number }}
 */
export function childWorkStats(cards = [], parentId, lists = [], parentWorkType = null) {
  const children = directChildCards(cards, parentId, parentWorkType);
  if (!children.length) return { total: 0, done: 0 };
  const listById = new Map((lists || []).map((l) => [String(l._id || l.id || ''), l]));
  let done = 0;
  for (const card of children) {
    const list = listById.get(String(card?.listId || card?.list || ''));
    if (classifyListStatusBucket(card?.status || list) === 'done') done += 1;
  }
  return { total: children.length, done };
}
