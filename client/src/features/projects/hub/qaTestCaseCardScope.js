/**
 * Phase 3 — scope catalog TC to a Ready-for-QA board card (HITL attach).
 */

function rowWorkItemId(row) {
  return String(row?.workItemId || '').trim();
}

export function isTcLinkedToWorkItem(row, workItemId) {
  const wid = String(workItemId || '').trim();
  if (!wid) return false;
  return rowWorkItemId(row) === wid;
}

export function isTcUnlinked(row) {
  return !rowWorkItemId(row);
}

/** Haystack for heuristic suggest: title + description + summary. */
export function cardSuggestHaystack(card) {
  return `${card?.title || ''} ${card?.description || ''} ${card?.summary || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Unlinked TC matching card.sourceUcKey (DEC D2), else externalKey in card text.
 */
export function isSuggestedCatalogForCard(row, card) {
  if (!isTcUnlinked(row) || !card) return false;
  const cardUc = String(card?.sourceUcKey || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const tcUc = String(row?.sourceUcKey || row?.externalKey || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (cardUc && tcUc && cardUc === tcUc) return true;
  const key = String(row?.externalKey || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (key.length < 3) return false;
  return cardSuggestHaystack(card).includes(key);
}

export function partitionCatalogForCard(items, workItemId, card) {
  const list = Array.isArray(items) ? items : [];
  const linked = [];
  const suggested = [];
  const unlinkedOther = [];
  const cardUc = String(card?.sourceUcKey || '')
    .trim()
    .toLowerCase();
  for (const row of list) {
    if (isTcLinkedToWorkItem(row, workItemId)) {
      linked.push(row);
      continue;
    }
    if (!isTcUnlinked(row)) continue;
    const tcUc = String(row?.sourceUcKey || row?.externalKey || '')
      .trim()
      .toLowerCase();
    if (cardUc && tcUc && cardUc === tcUc) {
      suggested.push(row);
      continue;
    }
    if (isSuggestedCatalogForCard(row, card)) suggested.push(row);
    else unlinkedOther.push(row);
  }
  return { linked, suggested, unlinkedOther };
}

export function filterTcByResult(items, filter) {
  const list = Array.isArray(items) ? items : [];
  if (!filter || filter === 'all') return list;
  return list.filter((row) => {
    const r = String(row?.lastResult || '')
      .trim()
      .toLowerCase();
    if (filter === 'none') return !r || (r !== 'pass' && r !== 'fail');
    return r === filter;
  });
}

function normalizeListKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isReadyForQaList(list) {
  if (!list) return false;
  const statusKey = normalizeListKey(list.statusKey);
  if (statusKey === 'qa' || statusKey === 'review') return true;
  const title = normalizeListKey(list.title);
  if (!title) return false;
  return (
    title === 'ready for qa' ||
    title.includes('ready for qa') ||
    title === 'cho qa' ||
    title.includes('san sang qa') ||
    title.includes('cho kiem thu')
  );
}

export function isDoneList(list) {
  if (!list) return false;
  const statusKey = normalizeListKey(list.statusKey);
  if (statusKey === 'done' || statusKey === 'completed') return true;
  const title = normalizeListKey(list.title);
  if (!title) return false;
  if (['xong', 'done', 'completed', 'hoan thanh'].includes(title)) return true;
  return title.endsWith(' xong') || title.startsWith('done');
}

export function resolveCardList(card, listsById) {
  const listId = String(card?.listId || card?.list?._id || card?.list?.id || '');
  if (listId && listsById instanceof Map && listsById.has(listId)) return listsById.get(listId);
  if (card?.list && typeof card.list === 'object') return card.list;
  return null;
}

/**
 * Board column is SoT for Done lock — ignore stale card.status when list is known.
 * (Drag Done → Ready for QA often leaves status=done on the task doc.)
 */
export function isWorkItemDone(workItemId, boardCards, listsById) {
  const wid = String(workItemId || '').trim();
  if (!wid) return false;
  const card = (Array.isArray(boardCards) ? boardCards : []).find(
    (c) => String(c._id || c.id) === wid
  );
  if (!card) return false;
  const list = resolveCardList(card, listsById);
  if (list) {
    if (isReadyForQaList(list)) return false;
    if (isDoneList(list)) return true;
    return false;
  }
  const status = normalizeListKey(card.status);
  return status === 'done' || status === 'completed';
}

/**
 * Mirror BE resolveTestCaseRetestCue — Fail + linked bug + (bug Done | parent on Ready for QA).
 */
export function resolveTestCaseRetestCue({
  lastResult = null,
  hasLinkedBug = false,
  linkedBugDone = false,
  parentReadyForQa = false,
} = {}) {
  if (!hasLinkedBug) {
    return {
      cue: null,
      needsRetest: false,
      linkedBugOpen: false,
      linkedBugDone: false,
    };
  }
  const fail =
    String(lastResult || '')
      .trim()
      .toLowerCase() === 'fail';
  const bugDone = Boolean(linkedBugDone);
  const parentOnQa = Boolean(parentReadyForQa);

  if (!fail) {
    return {
      cue: null,
      needsRetest: false,
      linkedBugOpen: false,
      linkedBugDone: bugDone,
    };
  }

  if (bugDone || parentOnQa) {
    return {
      cue: 'needs_retest',
      needsRetest: true,
      linkedBugOpen: !bugDone,
      linkedBugDone: bugDone,
    };
  }
  return {
    cue: 'bug_open',
    needsRetest: false,
    linkedBugOpen: true,
    linkedBugDone: false,
  };
}

/** Recompute TC cues from live board columns (parent / bug list). */
export function enrichTestCasesWithBoardCue(items, boardCards, listsById) {
  const cards = Array.isArray(boardCards) ? boardCards : [];
  const byId = new Map(cards.map((c) => [String(c._id || c.id), c]));
  return (Array.isArray(items) ? items : []).map((row) => {
    const hasLinkedBug = Boolean(row?.linkedBugId);
    if (!hasLinkedBug) {
      return {
        ...row,
        ...resolveTestCaseRetestCue({ lastResult: row?.lastResult, hasLinkedBug: false }),
      };
    }
    const parent = byId.get(String(row.workItemId || ''));
    const bug = byId.get(String(row.linkedBugId || ''));
    const parentReadyForQa = isReadyForQaList(resolveCardList(parent, listsById));
    const linkedBugDone = bug
      ? isDoneList(resolveCardList(bug, listsById))
      : Boolean(row.linkedBugDone);
    return {
      ...row,
      ...resolveTestCaseRetestCue({
        lastResult: row?.lastResult,
        hasLinkedBug: true,
        linkedBugDone,
        parentReadyForQa,
      }),
    };
  });
}

function normalizeTcResult(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

/** TC cần QA xử lý ngay: retest, fail, hoặc bug còn mở. */
export function isTcNeedsAttention(row) {
  if (!row) return false;
  if (row.needsRetest || row.linkedBugOpen) return true;
  return normalizeTcResult(row.lastResult) === 'fail';
}

/**
 * Hàng đợi Kiểm thử: gom TC theo card Ready for QA.
 * Mỗi group tách attention (cần sửa/retest) vs awaiting (chờ duyệt / pass / chưa chạy).
 *
 * @param {{ items?: object[], readyCards?: Array<{id:string,label?:string,card?:object}>, focusCardId?: string, filter?: string, listsById?: Map }} opts
 */
export function buildQaCardQueueGroups({
  items = [],
  readyCards = [],
  focusCardId = '',
  filter = 'all',
  listsById = null,
} = {}) {
  const focus = String(focusCardId || '').trim();
  const cards = (Array.isArray(readyCards) ? readyCards : []).filter((c) => {
    const id = String(c?.id || c?.card?._id || c?.card?.id || '').trim();
    if (!id) return false;
    if (focus && id !== focus) return false;
    return true;
  });

  const list = Array.isArray(items) ? items : [];
  const groups = [];

  for (const opt of cards) {
    const cardId = String(opt.id || opt.card?._id || opt.card?.id || '').trim();
    if (!cardId) continue;
    const card = opt.card || null;
    const linked = filterTcByResult(
      list.filter((row) => isTcLinkedToWorkItem(row, cardId)),
      filter
    );
    if (!linked.length) continue;

    const attention = [];
    const awaiting = [];
    for (const row of linked) {
      if (isTcNeedsAttention(row)) attention.push(row);
      else awaiting.push(row);
    }
    attention.sort((a, b) => {
      const ar = a?.needsRetest ? 0 : a?.linkedBugOpen ? 1 : 2;
      const br = b?.needsRetest ? 0 : b?.linkedBugOpen ? 1 : 2;
      return ar - br;
    });

    const listMeta = resolveCardList(card, listsById);
    groups.push({
      cardId,
      title: String(opt.label || card?.title || cardId).trim() || cardId,
      columnTitle: String(listMeta?.title || '').trim(),
      attention,
      awaiting,
      attentionCount: attention.length,
      awaitingCount: awaiting.length,
      total: linked.length,
    });
  }

  groups.sort((a, b) => {
    if (a.attentionCount !== b.attentionCount) return b.attentionCount - a.attentionCount;
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  });

  return groups;
}

