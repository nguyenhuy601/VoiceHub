import { classifyListStatusBucket } from './projectHubUtils.js';

/**
 * Đếm work con (parentTaskId) và số con đã Done — dùng icon cây Backlog.
 * @returns {{ total: number, done: number }}
 */
export function childWorkStats(cards = [], parentId, lists = []) {
  const pid = String(parentId || '').trim();
  if (!pid) return { total: 0, done: 0 };
  const listById = new Map((lists || []).map((l) => [String(l._id || l.id || ''), l]));
  let total = 0;
  let done = 0;
  for (const card of cards || []) {
    if (String(card?.parentTaskId || '') !== pid) continue;
    total += 1;
    const list = listById.get(String(card?.listId || card?.list || ''));
    if (classifyListStatusBucket(card?.status || list) === 'done') done += 1;
  }
  return { total, done };
}
