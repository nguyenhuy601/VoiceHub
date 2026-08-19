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

/**
 * Đếm work con (parentTaskId) và số con đã Done — dùng icon cây Backlog / List.
 * @returns {{ total: number, done: number }}
 */
export function childWorkStats(cards = [], parentId, lists = []) {
  const pid = entityRelId(parentId);
  if (!pid) return { total: 0, done: 0 };
  const listById = new Map((lists || []).map((l) => [String(l._id || l.id || ''), l]));
  let total = 0;
  let done = 0;
  for (const card of cards || []) {
    if (entityRelId(card?.parentTaskId) !== pid) continue;
    total += 1;
    const list = listById.get(String(card?.listId || card?.list || ''));
    if (classifyListStatusBucket(card?.status || list) === 'done') done += 1;
  }
  return { total, done };
}
