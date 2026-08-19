/** Phân cấp List / Backlog / Board từ Settings Work types (FE). */

import {
  WORK_TYPE_ALL_IDS,
  WORK_TYPE_CREATE_IDS,
  canNestByDepth,
  configTypeDepth,
  depthDeltaFromPointerX,
  normalizeWorkTypeConfig,
  visibleCreateMenuTypes,
} from './projectWorkTypes.js';

export const LIST_MAX_BANDS = 3;

/**
 * Unique depths types không ẩn. Nếu > 3: giữ min, depth story/task (mid), max
 * để List luôn có Epic → issue → Sub-task khi đủ types.
 * @returns {number[]}
 */
export function hierarchyBands(config) {
  const cfg = normalizeWorkTypeConfig(config);
  const depths = new Set();
  for (const id of WORK_TYPE_ALL_IDS) {
    if (cfg.hidden[id]) continue;
    const d = Number(cfg.depthById[id]);
    if (Number.isFinite(d)) depths.add(d);
  }
  const all = [...depths].sort((a, b) => a - b);
  if (all.length <= LIST_MAX_BANDS) return all;
  const min = all[0];
  const max = all[all.length - 1];
  const boardDepth = Number(cfg.depthById.story);
  const midCandidates = all.filter((d) => d !== min && d !== max);
  let mid = midCandidates[0];
  if (midCandidates.includes(boardDepth)) mid = boardDepth;
  else {
    for (const id of WORK_TYPE_CREATE_IDS) {
      const d = Number(cfg.depthById[id]);
      if (midCandidates.includes(d)) {
        mid = d;
        break;
      }
    }
  }
  return [min, mid, max];
}

/** Types đúng tại depth của bandIndex (0 = cấp 1). */
export function typesInBand(config, bandIndex) {
  const cfg = normalizeWorkTypeConfig(config);
  const bands = hierarchyBands(cfg);
  const depth = bands[bandIndex];
  if (depth == null) return [];
  return cfg.treeOrder.filter((id) => !cfg.hidden[id] && cfg.depthById[id] === depth);
}

export function bandIndexForType(typeId, config) {
  const cfg = normalizeWorkTypeConfig(config);
  const id = String(typeId || '').toLowerCase();
  const bands = hierarchyBands(cfg);
  const depth = cfg.depthById[id];
  if (depth == null || !Number.isFinite(depth) || !bands.length) return -1;
  // Band cuối chỉ dành cho depth >= max (Sub-task). Type trung gian (vd Task depth 3
  // khi bands [0,2,4]) phải ở mid — nếu không sẽ mất Create child → Sub-task.
  if (depth <= bands[0]) return 0;
  if (depth >= bands[bands.length - 1]) return bands.length - 1;
  for (let i = bands.length - 2; i >= 1; i -= 1) {
    if (depth >= bands[i]) return i;
  }
  return Math.min(1, bands.length - 1);
}

/**
 * Band của item runtime: subtask ưu tiên type subtask; card khác theo issueType;
 * planning theo type.
 */
export function resolveItemBand(item, config) {
  const cfg = normalizeWorkTypeConfig(config);
  if (!item || typeof item !== 'object') return -1;
  const raw = String(item.type || item.issueType || item.workType || '').toLowerCase();
  if (raw === 'subtask') return bandIndexForType('subtask', cfg);
  if (raw === 'feature' || raw === 'epic') return bandIndexForType(raw, cfg);
  if (WORK_TYPE_CREATE_IDS.includes(raw)) return bandIndexForType(raw, cfg);
  return bandIndexForType('task', cfg);
}

/**
 * Types để Create child: depth > parentDepth và depth <= nextBandDepth,
 * giao caps. [] nếu parent đã ở band cuối.
 */
export function childTypesForParent(parentType, config, caps = {}) {
  const cfg = normalizeWorkTypeConfig(config);
  const parentId = String(parentType || '').toLowerCase();
  const parentDepth = Number(cfg.depthById[parentId]);
  if (!Number.isFinite(parentDepth) || cfg.hidden[parentId]) return [];
  const bands = hierarchyBands(cfg);
  const parentBand = bandIndexForType(parentId, cfg);
  if (parentBand < 0 || parentBand >= bands.length - 1) return [];
  const nextBandDepth = bands[parentBand + 1];
  const allowed = new Set(visibleCreateMenuTypes(cfg, caps));
  const candidates = cfg.treeOrder.filter((id) => {
    if (cfg.hidden[id] || !allowed.has(id)) return false;
    const d = Number(cfg.depthById[id]);
    return Number.isFinite(d) && d > parentDepth && d <= nextBandDepth;
  });
  if (!candidates.length) return [];
  // Chỉ một bậc xuống gần nhất theo Settings (Epic→Feature/Bug, Task→Sub-task; không nhảy Story→Sub-task).
  const minChildDepth = Math.min(...candidates.map((id) => Number(cfg.depthById[id])));
  return candidates.filter((id) => Number(cfg.depthById[id]) === minChildDepth);
}

/**
 * Payload parent khi tạo card board theo Work types (đúng 1 cấp).
 * @returns {{ parentTaskId?: string, featureId?: string, epicId?: string }}
 */
export function resolveBoardCreateParent({ type, parentNode, config } = {}) {
  const childType = String(type || '').toLowerCase();
  if (!childType) return {};
  const parentType = String(parentNode?.workType || '').toLowerCase();
  const parentRaw = parentNode?.raw || {};
  const parentId = String(parentRaw._id || parentRaw.id || '').trim();
  if (!parentType || !parentId) return {};

  const inheritEpicId =
    parentType === 'epic'
      ? parentId
      : parentRaw.epicId
        ? String(parentRaw.epicId)
        : parentType === 'feature' && parentRaw.parentId
          ? String(parentRaw.parentId)
          : '';

  const nestType = childType === 'subtask' ? 'subtask' : childType;
  const canDirect = canNestByDepth(nestType, parentType, config);
  const canAsSub =
    (childType === 'subtask' || childType === 'task') && canNestByDepth('subtask', parentType, config);
  if (!canDirect && !canAsSub) {
    if (parentType === 'epic' && inheritEpicId) return { epicId: inheritEpicId };
    return {};
  }

  if (parentNode?.kind === 'card' || ['story', 'bug', 'task', 'subtask'].includes(parentType)) {
    return {
      parentTaskId: parentId,
      ...(inheritEpicId ? { epicId: inheritEpicId } : {}),
    };
  }
  if (parentType === 'feature') {
    return {
      featureId: parentId,
      ...(inheritEpicId ? { epicId: inheritEpicId } : {}),
    };
  }
  if (parentType === 'epic') {
    return { epicId: parentId };
  }
  return {};
}

function nodeId(kind, rawId) {
  return `${kind}:${String(rawId)}`;
}

/** Thứ tự List: sortOrder rồi createdAt (khớp BE listPlanningItems). */
export function comparePlanningOrder(a, b) {
  const ao = Number(a?.sortOrder);
  const bo = Number(b?.sortOrder);
  const aOk = Number.isFinite(ao);
  const bOk = Number.isFinite(bo);
  if (aOk && bOk && ao !== bo) return ao - bo;
  if (aOk !== bOk) return aOk ? -1 : 1;
  const at = Date.parse(a?.createdAt || '') || 0;
  const bt = Date.parse(b?.createdAt || '') || 0;
  if (at !== bt) return at - bt;
  return String(a?._id || a?.id || '').localeCompare(String(b?._id || b?.id || ''));
}

/**
 * sortOrder mới khi chèn active trước over trong danh sách sibling đã sort.
 * @returns {number|null}
 */
export function computeInsertSortOrder(siblings = [], activeId, overId) {
  const sid = (row) => String(row?._id || row?.id || '');
  const wantActive = String(activeId || '');
  const wantOver = String(overId || '');
  if (!wantActive || !wantOver || wantActive === wantOver) return null;
  const rows = (Array.isArray(siblings) ? siblings : []).filter(Boolean);
  const from = rows.findIndex((r) => sid(r) === wantActive);
  const to = rows.findIndex((r) => sid(r) === wantOver);
  if (from < 0 || to < 0) return null;
  const without = rows.filter((_, i) => i !== from);
  const insertAt = without.findIndex((r) => sid(r) === wantOver);
  if (insertAt < 0) return null;
  const prev = without[insertAt - 1];
  const next = without[insertAt];
  const prevOrder = Number(prev?.sortOrder);
  const nextOrder = Number(next?.sortOrder);
  const hasPrev = Boolean(prev) && Number.isFinite(prevOrder);
  const hasNext = Boolean(next) && Number.isFinite(nextOrder);
  if (hasPrev && hasNext) {
    if (nextOrder === prevOrder) return prevOrder + 0.001;
    return (prevOrder + nextOrder) / 2;
  }
  if (hasNext) return nextOrder - 1000;
  if (hasPrev) return prevOrder + 1000;
  return 1000;
}

/**
 * Cây List tối đa 3 tầng: Epic → (Feature | Story/Task/Bug) → Sub-task.
 */
export function buildListTree({ epics = [], features = [], cards = [], config } = {}) {
  const cfg = normalizeWorkTypeConfig(config);
  const bands = hierarchyBands(cfg);
  if (!bands.length) return [];

  const cardList = Array.isArray(cards) ? cards : [];
  const byId = new Map(cardList.map((c) => [String(c._id || c.id), c]));
  const childrenByParent = new Map();

  for (const card of cardList) {
    const pid = card.parentTaskId ? String(card.parentTaskId) : '';
    if (!pid) continue;
    if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
    childrenByParent.get(pid).push(card);
  }

  const displayCardWorkType = (card) => {
    const issue = String(card?.issueType || 'task').toLowerCase();
    if (!card?.parentTaskId) return issue === 'story' || issue === 'bug' ? issue : 'task';
    const parent = byId.get(String(card.parentTaskId));
    const parentIssue = parent ? String(parent.issueType || 'task').toLowerCase() : 'task';
    if (issue === 'task' && parentIssue === 'task') return 'subtask';
    if (
      issue === 'task' &&
      !canNestByDepth('task', parentIssue, cfg) &&
      canNestByDepth('subtask', parentIssue, cfg)
    ) {
      return 'subtask';
    }
    return issue === 'story' || issue === 'bug' ? issue : 'task';
  };

  const makeCardNode = (card, band) => {
    const id = String(card._id || card.id);
    const childCards = childrenByParent.get(id) || [];
    const children =
      band < bands.length - 1
        ? childCards.map((c) => makeCardNode(c, Math.min(band + 1, bands.length - 1)))
        : [];
    return {
      id: nodeId('card', id),
      kind: 'card',
      band,
      workType: displayCardWorkType(card),
      title: String(card.title || ''),
      raw: card,
      children,
    };
  };

  const epicList = [...(Array.isArray(epics) ? epics : [])].sort(comparePlanningOrder);
  const featureList = [...(Array.isArray(features) ? features : [])].sort(comparePlanningOrder);
  const featuresByEpic = new Map();
  const orphanFeatures = [];

  for (const f of featureList) {
    const parent = f.parentId ? String(f.parentId) : '';
    if (parent) {
      if (!featuresByEpic.has(parent)) featuresByEpic.set(parent, []);
      featuresByEpic.get(parent).push(f);
    } else {
      orphanFeatures.push(f);
    }
  }

  const cardsByEpic = new Map();
  const cardsByFeature = new Map();
  const rootsOrphan = [];
  for (const card of cardList) {
    if (card.parentTaskId) continue;
    const fid = card.featureId ? String(card.featureId) : '';
    if (fid) {
      if (!cardsByFeature.has(fid)) cardsByFeature.set(fid, []);
      cardsByFeature.get(fid).push(card);
      continue;
    }
    const eid = card.epicId ? String(card.epicId) : '';
    if (!eid) {
      rootsOrphan.push(makeCardNode(card, Math.max(0, resolveItemBand(card, cfg))));
      continue;
    }
    if (!cardsByEpic.has(eid)) cardsByEpic.set(eid, []);
    cardsByEpic.get(eid).push(card);
  }

  const epicBand = Math.max(0, bandIndexForType('epic', cfg));
  const roots = [];

  for (const epic of epicList) {
    const eid = String(epic._id || epic.id);
    const children = [];
    for (const f of featuresByEpic.get(eid) || []) {
      const fBand = Math.max(0, bandIndexForType('feature', cfg));
      const fid = String(f._id || f.id);
      const featureCards = cardsByFeature.get(fid) || [];
      children.push({
        id: nodeId('planning', f._id || f.id),
        kind: 'planning',
        band: fBand,
        workType: 'feature',
        title: String(f.title || ''),
        raw: f,
        children: featureCards.map((c) => makeCardNode(c, Math.max(0, resolveItemBand(c, cfg)))),
      });
    }
    for (const card of cardsByEpic.get(eid) || []) {
      const cBand = Math.max(0, resolveItemBand(card, cfg));
      children.push(makeCardNode(card, cBand));
    }
    roots.push({
      id: nodeId('planning', eid),
      kind: 'planning',
      band: epicBand,
      workType: 'epic',
      title: String(epic.title || ''),
      raw: epic,
      children,
    });
  }

  for (const f of orphanFeatures) {
    const fid = String(f._id || f.id);
    const featureCards = cardsByFeature.get(fid) || [];
    roots.push({
      id: nodeId('planning', f._id || f.id),
      kind: 'planning',
      band: Math.max(0, bandIndexForType('feature', cfg)),
      workType: 'feature',
      title: String(f.title || ''),
      raw: f,
      children: featureCards.map((c) => makeCardNode(c, Math.max(0, resolveItemBand(c, cfg)))),
    });
  }

  for (const n of rootsOrphan) roots.push(n);

  for (const card of cardList) {
    if (!card.parentTaskId) continue;
    const pid = String(card.parentTaskId);
    if (byId.has(pid)) continue;
    roots.push(makeCardNode(card, Math.min(bands.length - 1, 2)));
  }

  return roots;
}

/** Board sẵn sàng khi có sprint active đủ name + startDate + endDate. */
export function isBoardSprintReady(sprints = []) {
  return (Array.isArray(sprints) ? sprints : []).some((s) => {
    if (String(s?.status || '').toLowerCase() !== 'active') return false;
    if (!String(s?.name || '').trim()) return false;
    if (!s?.startDate) return false;
    if (!s?.endDate) return false;
    return true;
  });
}

/**
 * Backlog: thẻ work Story / Task / Bug / Feature (không phải hàng Epic).
 * Task trong nhóm Epic (epicId, hoặc parentTaskId trỏ epic) vẫn hiện — chỉ ẩn sub-task của card khác.
 * @param {object} issue
 * @param {object} config
 * @param {Set<string>|null} [epicIds]
 */
export function isBacklogLevelTwoIssue(issue, config, epicIds = null) {
  if (!issue) return false;
  const it = String(issue.issueType || issue.type || 'task').toLowerCase();
  if (it === 'epic' || it === 'subtask') return false;

  const pid = issue.parentTaskId ? String(issue.parentTaskId) : '';
  if (pid) {
    const epicId = issue.epicId ? String(issue.epicId) : '';
    const parentIsEpic = (epicId && epicId === pid) || (epicIds && epicIds.has(pid));
    if (!parentIsEpic) return false;
  }

  if (it === 'feature') return true;

  const cfg = normalizeWorkTypeConfig(config);
  const band2 = typesInBand(cfg, 1);
  if (band2.includes(it)) return true;
  return WORK_TYPE_CREATE_IDS.includes(it);
}

function collectDescendantIds(node, out = new Set()) {
  for (const child of node?.children || []) {
    out.add(child.id);
    collectDescendantIds(child, out);
  }
  return out;
}

export function findParentListNode(nodes, nodeId) {
  const target = String(nodeId || '');
  for (const n of nodes || []) {
    if (n.id === target) return null;
    if ((n.children || []).some((c) => c.id === target)) return n;
    const deeper = findParentListNode(n.children, target);
    if (deeper !== undefined) return deeper;
  }
  return undefined;
}

/** Peer cùng band ngay trước trong danh sách đang hiển thị (để indent). */
export function findPreviousSameBandPeer(flatRows, activeId) {
  return findIndentTargetNode(flatRows, activeId, { sameBandOnly: true });
}

/**
 * Mục tiêu indent: sibling cùng cấp, hoặc hàng trước đúng 1 cấp trên (vd Feature → Epic).
 */
export function findIndentTargetNode(flatRows, activeId, { sameBandOnly = false } = {}) {
  const id = String(activeId || '');
  const idx = (flatRows || []).findIndex((r) => r?.node?.id === id);
  if (idx <= 0) return null;
  const activeBand = Number(flatRows[idx].node.band);
  if (!Number.isFinite(activeBand)) return null;
  for (let i = idx - 1; i >= 0; i -= 1) {
    const cand = flatRows[i]?.node;
    if (!cand) continue;
    const b = Number(cand.band);
    if (!Number.isFinite(b)) continue;
    if (b > activeBand) continue;
    if (b === activeBand) return cand;
    if (!sameBandOnly && b === activeBand - 1) return cand;
    return null;
  }
  return null;
}

function isExistingSubtask(node) {
  return String(node?.workType || '').toLowerCase() === 'subtask';
}

function nodeWorkType(node) {
  const wt = String(node?.workType || '').toLowerCase();
  if (WORK_TYPE_ALL_IDS.includes(wt)) return wt;
  const raw = String(node?.raw?.issueType || node?.raw?.type || '').toLowerCase();
  if (WORK_TYPE_ALL_IDS.includes(raw)) return raw;
  return '';
}

function nodeTypeDepth(node, config) {
  const wt = nodeWorkType(node);
  if (wt) return configTypeDepth(wt, config);
  const b = Number(node?.band);
  return Number.isFinite(b) ? b : 0;
}

/**
 * Drop không gửi issueType — Task vào Story vẫn là Task.
 */
export function isTypePreservingDrop(activeNode, action) {
  if (!activeNode || !action || action.mode === 'noop') return false;
  return !Object.prototype.hasOwnProperty.call(action, 'issueType');
}

function withTypePreserving(activeNode, action) {
  if (!action) return null;
  if (action.mode === 'noop') return action;
  if (!isTypePreservingDrop(activeNode, action)) return null;
  return action;
}

function nestActionForTarget(activeNode, target, config) {
  if (!activeNode || !target || activeNode.id === target.id) return null;
  if (collectDescendantIds(activeNode).has(target.id)) return null;
  const activeId = rawEntityId(activeNode);
  if (!activeId) return null;
  if (!canNestByDepth(nodeWorkType(activeNode), nodeWorkType(target), config)) return null;

  if (activeNode.kind === 'card' && target.kind === 'card') {
    return {
      mode: 'attach-card-parent',
      kind: 'card',
      activeId,
      parentTaskId: rawEntityId(target),
      epicId: target.raw?.epicId
        ? String(target.raw.epicId)
        : activeNode.raw?.epicId
          ? String(activeNode.raw.epicId)
          : null,
    };
  }
  if (activeNode.kind === 'card' && target.workType === 'epic') {
    return {
      mode: 'attach-card-epic',
      kind: 'card',
      activeId,
      epicId: rawEntityId(target),
      parentTaskId: null,
    };
  }
  if (activeNode.kind === 'card' && target.workType === 'feature') {
    const epicId = target.raw?.parentId ? String(target.raw.parentId) : '';
    if (!epicId) return null;
    return {
      mode: 'attach-card-epic',
      kind: 'card',
      activeId,
      epicId,
      parentTaskId: null,
    };
  }
  if (
    activeNode.kind === 'planning' &&
    activeNode.workType === 'feature' &&
    target.workType === 'epic'
  ) {
    return {
      mode: 'attach-feature-epic',
      kind: 'planning',
      activeId,
      parentId: rawEntityId(target),
    };
  }
  return null;
}

function rawEntityId(node) {
  return String(node?.raw?._id || node?.raw?.id || '');
}

/**
 * Kéo ngang ±1 bậc: phải = indent dưới peer cùng cấp; trái = outdent lên 1 cấp.
 * Dùng depthDeltaFromPointerX (mỗi gesture chỉ ±1).
 */
export function resolveListHorizontalAction({
  activeNode,
  flatRows = [],
  tree = [],
  deltaX = 0,
  config,
} = {}) {
  const step = depthDeltaFromPointerX(deltaX);
  if (!step || !activeNode) return null;
  const cfg = normalizeWorkTypeConfig(config);
  const bands = hierarchyBands(cfg);
  const activeId = rawEntityId(activeNode);
  if (!activeId) return null;

  if (step > 0) {
    if (activeNode.band >= bands.length - 1) return null;
    const target = findIndentTargetNode(flatRows, activeNode.id);
    return withTypePreserving(activeNode, nestActionForTarget(activeNode, target, cfg));
  }

  const parent = findParentListNode(tree, activeNode.id);
  if (parent === undefined || parent === null) return null;

  if (activeNode.kind === 'card') {
    if (activeNode.raw?.parentTaskId) {
      const grand = findParentListNode(tree, parent.id);
      let parentTaskId = null;
      let epicId = activeNode.raw?.epicId ? String(activeNode.raw.epicId) : null;
      if (grand?.kind === 'card') {
        parentTaskId = rawEntityId(grand);
        epicId = grand.raw?.epicId ? String(grand.raw.epicId) : epicId;
      } else if (grand?.workType === 'epic') {
        parentTaskId = null;
        epicId = rawEntityId(grand);
      } else if (parent.workType === 'epic') {
        parentTaskId = null;
        epicId = rawEntityId(parent);
      } else if (parent.kind === 'card') {
        parentTaskId = null;
        epicId = parent.raw?.epicId ? String(parent.raw.epicId) : epicId;
      }
      return withTypePreserving(activeNode, {
        mode: 'align-card-siblings',
        kind: 'card',
        activeId,
        parentTaskId,
        epicId,
      });
    }
    if (parent.workType === 'epic') {
      return withTypePreserving(activeNode, {
        mode: 'detach-card-epic',
        kind: 'card',
        activeId,
        parentTaskId: null,
        epicId: null,
      });
    }
  }

  if (activeNode.workType === 'feature' && parent.workType === 'epic') {
    return withTypePreserving(activeNode, {
      mode: 'align-feature-siblings',
      kind: 'planning',
      activeId,
      parentId: null,
    });
  }

  return null;
}

/** Kéo ngang (indent) chỉ khi |deltaX| đủ ngưỡng và không nhỏ hơn |deltaY|. */
export function preferListHorizontalDrag(deltaX, deltaY) {
  if (!depthDeltaFromPointerX(deltaX)) return false;
  return Math.abs(Number(deltaX) || 0) >= Math.abs(Number(deltaY) || 0);
}

/** Epic chứa node (chính nó, epicId/parentId, hoặc parent trên cây). */
function epicContainerId(node, tree = []) {
  if (!node) return '';
  if (node.workType === 'epic') return rawEntityId(node);
  if (node.kind === 'card' && node.raw?.epicId) return String(node.raw.epicId);
  if (node.workType === 'feature' && node.raw?.parentId) return String(node.raw.parentId);
  const parent = Array.isArray(tree) && tree.length ? findParentListNode(tree, node.id) : undefined;
  if (parent?.workType === 'epic') return rawEntityId(parent);
  return '';
}

function joinEpicGroupAction(activeNode, epicId) {
  const id = String(epicId || '');
  const activeId = rawEntityId(activeNode);
  if (!id || !activeId) return null;
  if (activeNode.kind === 'card') {
    const curEpic = activeNode.raw?.epicId ? String(activeNode.raw.epicId) : '';
    if (curEpic === id && !activeNode.raw?.parentTaskId) {
      return { mode: 'noop', kind: 'card', activeId };
    }
    return {
      mode: 'attach-card-epic',
      kind: 'card',
      activeId,
      epicId: id,
      parentTaskId: null,
    };
  }
  if (activeNode.workType === 'feature') {
    const curParent = activeNode.raw?.parentId ? String(activeNode.raw.parentId) : '';
    if (curParent === id) return { mode: 'noop', kind: 'planning', activeId };
    return {
      mode: 'attach-feature-epic',
      kind: 'planning',
      activeId,
      parentId: id,
    };
  }
  return null;
}

/**
 * Cho phép kéo cùng cấp hoặc thả vào nhóm trên đúng 1 cấp (depthById, không dùng band).
 */
export function canListDragOver(activeNode, overNode, config) {
  if (!activeNode || !overNode) return false;
  if (activeNode.id === overNode.id) return false;
  if (collectDescendantIds(activeNode).has(overNode.id)) return false;
  const ad = nodeTypeDepth(activeNode, config);
  const od = nodeTypeDepth(overNode, config);
  if (!Number.isFinite(ad) || !Number.isFinite(od)) return false;
  if (ad === od) return true;
  if (od === ad - 1) return true;
  return false;
}

/**
 * Suy ra payload cập nhật parent sau drop (FE dùng API hiện có).
 * Cùng depth = sibling; đúng 1 cấp trên = nest (không đổi issueType).
 * @returns {null|{ mode: string, activeId: string, kind: string, epicId?: string|null, parentTaskId?: string|null, parentId?: string|null }}
 */
export function resolveListDropAction(activeNode, overNode, tree = [], config) {
  if (!canListDragOver(activeNode, overNode, config)) return null;
  const activeId = String(activeNode.raw?._id || activeNode.raw?.id || '');
  if (!activeId) return null;
  const overId = String(overNode.raw?._id || overNode.raw?.id || '');
  const ad = nodeTypeDepth(activeNode, config);
  const od = nodeTypeDepth(overNode, config);

  if (od === ad - 1) {
    return withTypePreserving(activeNode, nestActionForTarget(activeNode, overNode, config));
  }

  if (ad === od) {
    const activeIsSubtask = isExistingSubtask(activeNode);
    if (activeNode.kind === 'card' && overNode.kind === 'card' && activeIsSubtask) {
      const parentTaskId = overNode.raw?.parentTaskId ? String(overNode.raw.parentTaskId) : null;
      const epicId = overNode.raw?.epicId ? String(overNode.raw.epicId) : null;
      const curParent = activeNode.raw?.parentTaskId ? String(activeNode.raw.parentTaskId) : null;
      const curEpic = activeNode.raw?.epicId ? String(activeNode.raw.epicId) : null;
      if (curParent === parentTaskId && curEpic === epicId) return { mode: 'noop', kind: 'card', activeId };
      return withTypePreserving(activeNode, {
        mode: 'align-card-siblings',
        kind: 'card',
        activeId,
        parentTaskId,
        epicId,
      });
    }

    if (
      activeNode.kind === 'planning' &&
      overNode.kind === 'planning' &&
      activeNode.workType === overNode.workType &&
      (activeNode.workType === 'epic' || activeNode.workType === 'feature')
    ) {
      const aParent = activeNode.raw?.parentId ? String(activeNode.raw.parentId) : '';
      const oParent = overNode.raw?.parentId ? String(overNode.raw.parentId) : '';
      if (activeNode.workType === 'epic' || aParent === oParent) {
        return withTypePreserving(activeNode, {
          mode: 'reorder-planning',
          kind: 'planning',
          activeId,
          overId,
        });
      }
    }

    if (
      activeNode.kind === 'card' &&
      overNode.kind === 'card' &&
      nodeWorkType(activeNode) !== nodeWorkType(overNode)
    ) {
      return null;
    }

    const groupEpicId = epicContainerId(overNode, tree);
    if (groupEpicId && !activeIsSubtask) {
      const joined = joinEpicGroupAction(activeNode, groupEpicId);
      if (joined) return withTypePreserving(activeNode, joined);
    }

    if (activeNode.kind === 'card' && overNode.kind === 'card') {
      const parentTaskId = overNode.raw?.parentTaskId ? String(overNode.raw.parentTaskId) : null;
      const epicId = overNode.raw?.epicId ? String(overNode.raw.epicId) : null;
      const curParent = activeNode.raw?.parentTaskId ? String(activeNode.raw.parentTaskId) : null;
      const curEpic = activeNode.raw?.epicId ? String(activeNode.raw.epicId) : null;
      if (curParent === parentTaskId && curEpic === epicId) return { mode: 'noop', kind: 'card', activeId };
      return withTypePreserving(activeNode, {
        mode: 'align-card-siblings',
        kind: 'card',
        activeId,
        parentTaskId,
        epicId,
      });
    }
    if (
      activeNode.kind === 'planning' &&
      activeNode.workType === 'feature' &&
      overNode.workType === 'feature'
    ) {
      const parentId = overNode.raw?.parentId ? String(overNode.raw.parentId) : null;
      return withTypePreserving(activeNode, {
        mode: 'align-feature-siblings',
        kind: 'planning',
        activeId,
        parentId,
      });
    }
    return { mode: 'noop', kind: activeNode.kind, activeId };
  }

  return null;
}

/**
 * Action kéo hiện tại (ngang ưu tiên) — cùng rule với onDragEnd.
 */
export function resolveLiveListDragAction({
  activeNode,
  overNode = null,
  deltaX = 0,
  deltaY = 0,
  tree = [],
  flatRows = [],
  config,
} = {}) {
  if (!activeNode) return null;
  if (preferListHorizontalDrag(deltaX, deltaY)) {
    return resolveListHorizontalAction({
      activeNode,
      flatRows,
      tree,
      deltaX,
      config,
    });
  }
  if (!overNode) return null;
  return resolveListDropAction(activeNode, overNode, tree, config);
}

export function isLiveListDragValid(args = {}) {
  const action = resolveLiveListDragAction(args);
  return Boolean(action && action.mode !== 'noop');
}

