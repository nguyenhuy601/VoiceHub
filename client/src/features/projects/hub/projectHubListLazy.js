/** List tree: mặc định thu gọn; chevron khi chưa load / đang load / đã có con. */

export function flattenExpandedRows(nodes, expandedIds) {
  const open = expandedIds instanceof Set ? expandedIds : new Set();
  const out = [];
  const walk = (list, depth) => {
    for (const node of list || []) {
      out.push({ node, depth });
      if (open.has(node.id) && node.children?.length) walk(node.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return out;
}

/** Chỉ hiện chevron khi đã có con hoặc đang load — không speculative theo childTypes. */
export function canExpandListRow({ loading = false, hasChildren = false } = {}) {
  return Boolean(loading || hasChildren);
}

/**
 * Có cần gọi getBoardDetail scoped khi expand không.
 * Skip khi đã có children local hoặc đã loaded; retry khi hadError.
 */
export function shouldFetchListChildren({
  loaded = false,
  loading = false,
  hasChildren = false,
  hadError = false,
} = {}) {
  if (loading) return false;
  if (hadError) return true;
  if (hasChildren || loaded) return false;
  return true;
}

/** Ids node đã có con trong tree — đánh dấu loaded sau seed full board. */
export function collectLoadedIdsFromTree(nodes, out = new Set()) {
  for (const node of nodes || []) {
    const id = node?.id != null ? String(node.id) : '';
    if (id && Array.isArray(node.children) && node.children.length > 0) {
      out.add(id);
      collectLoadedIdsFromTree(node.children, out);
    }
  }
  return out;
}

function relId(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'object') return String(v._id || v.id || '').trim();
  return String(v).trim();
}

/**
 * Cards đã seed local theo cùng rule List tree (epic/feature/card parent).
 * Dùng để skip HTTP khi tree.children rỗng nhưng listCards đã có con.
 */
export function hasLocalChildCards(cards = [], parentRawId, parentWorkType = null) {
  const pid = relId(parentRawId);
  if (!pid) return false;
  const parentType = String(parentWorkType || '').toLowerCase();
  return (Array.isArray(cards) ? cards : []).some((card) => {
    const cardParentTaskId = relId(card?.parentTaskId);
    const cardFeatureId = relId(card?.featureId);
    const cardEpicId = relId(card?.epicId);
    if (parentType === 'feature') return cardFeatureId === pid && !cardParentTaskId;
    if (parentType === 'epic') return cardEpicId === pid && !cardFeatureId && !cardParentTaskId;
    return cardParentTaskId === pid;
  });
}

/** Đánh dấu inflight trên Set ref ngay (trước setState) để chặn request trùng. */
export function addIdToSetRef(setRef, id) {
  const key = String(id || '');
  if (!key || !setRef) return;
  const next = new Set(setRef.current instanceof Set ? setRef.current : []);
  next.add(key);
  setRef.current = next;
}

export function removeIdFromSetRef(setRef, id) {
  const key = String(id || '');
  if (!key || !setRef) return;
  const next = new Set(setRef.current instanceof Set ? setRef.current : []);
  next.delete(key);
  setRef.current = next;
}

/** Infinite scroll List: số root work mỗi lần reveal. */
export const LIST_ROOT_PAGE_SIZE = 5;

export function sliceTreeRoots(tree, limit) {
  const n = Math.max(0, Math.floor(Number(limit) || 0));
  return (Array.isArray(tree) ? tree : []).slice(0, n);
}

export function nextRootLimit(current, total, pageSize = LIST_ROOT_PAGE_SIZE) {
  const cur = Math.max(0, Number(current) || 0);
  const tot = Math.max(0, Number(total) || 0);
  const step = Math.max(1, Math.floor(Number(pageSize) || LIST_ROOT_PAGE_SIZE));
  return Math.min(tot, cur + step);
}

/** Expand đẩy content không đổi scrollTop → không near-bottom trừ khi user scroll. */
export function isScrollNearBottom(el, thresholdPx = 80) {
  if (!el) return false;
  const threshold = Math.max(0, Number(thresholdPx) || 0);
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}
