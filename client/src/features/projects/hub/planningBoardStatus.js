import {
  classifyListStatusBucket,
  listsForStatusSelect,
  statusSelectBucket,
} from './projectHubUtils.js';

const LEGACY_STATUS_TO_SELECT_BUCKET = {
  planned: 'todo',
  active: 'doing',
  done: 'done',
  cancelled: 'cancelled',
};

function listIdOf(list) {
  return String(list?._id || list?.id || '');
}

function asListArray(lists) {
  if (Array.isArray(lists)) return lists;
  if (lists && typeof lists === 'object') return Object.values(lists);
  return [];
}

function optionBucket(list) {
  return statusSelectBucket(list);
}

/**
 * Map status PlanningItem (legacy hoặc statusKey) → listId trên dropdown board.
 */
export function planningStatusToListId(status, lists = []) {
  const options = listsForStatusSelect(lists, '');
  if (!options.length) return '';
  const raw = String(status || 'planned').trim().toLowerCase();
  const byKey = options.find((l) => String(l.statusKey || '').trim().toLowerCase() === raw);
  if (byKey) return listIdOf(byKey);

  const selectBucket = LEGACY_STATUS_TO_SELECT_BUCKET[raw] || raw;
  const bySelect = options.find((l) => optionBucket(l) === selectBucket);
  if (bySelect) return listIdOf(bySelect);

  const uiBucket = classifyListStatusBucket(raw);
  const byUi = options.find((l) => classifyListStatusBucket(l) === uiBucket);
  if (byUi) return listIdOf(byUi);

  return listIdOf(options[0]);
}

/**
 * listId cột board → statusKey lưu trên PlanningItem.
 */
export function listIdToPlanningStatus(listId, lists = []) {
  const id = String(listId || '');
  if (!id) return '';
  const arr = asListArray(lists);
  const list = arr.find((l) => listIdOf(l) === id);
  if (!list) return '';
  const key = String(list.statusKey || '').trim().toLowerCase();
  if (key) return key;
  return optionBucket(list);
}
