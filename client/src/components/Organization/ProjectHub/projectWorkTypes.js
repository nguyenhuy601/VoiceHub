/** Cấu hình Work types theo dự án (FE localStorage — BE chưa có field). */

export const WORK_TYPE_CREATE_IDS = ['story', 'task', 'bug'];
export const WORK_TYPE_ALL_IDS = ['epic', 'feature', 'story', 'task', 'bug', 'subtask'];
export const WORK_TYPE_CHANGE_EVENT = 'voicehub-project-work-types';
export const WORK_TYPE_MAX_DEPTH = 4;
export const WORK_TYPE_INDENT_PX = 24;

export const DEFAULT_WORK_TYPE_DEPTH = {
  epic: 0,
  feature: 1,
  story: 2,
  task: 2,
  bug: 2,
  subtask: 3,
};

export const DEFAULT_WORK_TYPE_TREE = ['epic', 'feature', 'story', 'task', 'bug', 'subtask'];

export function defaultWorkTypeConfig() {
  return {
    treeOrder: [...DEFAULT_WORK_TYPE_TREE],
    depthById: { ...DEFAULT_WORK_TYPE_DEPTH },
    createOrder: [...WORK_TYPE_CREATE_IDS],
    hidden: {
      epic: false,
      feature: false,
      story: false,
      task: false,
      bug: false,
      subtask: false,
    },
  };
}

export function workTypeStorageKey(projectId) {
  const id = String(projectId || '').trim();
  return id ? `vh.hub.workTypes.${id}` : '';
}

function uniqueValidIds(ids) {
  const seen = new Set();
  const out = [];
  for (const raw of ids || []) {
    const key = String(raw || '').toLowerCase();
    if (!WORK_TYPE_ALL_IDS.includes(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function deriveCreateOrder(treeOrder) {
  return (Array.isArray(treeOrder) ? treeOrder : []).filter((id) => WORK_TYPE_CREATE_IDS.includes(id));
}

export function clampTreeDepths(treeOrder, depthById) {
  const order = Array.isArray(treeOrder) ? treeOrder : [];
  const src = depthById && typeof depthById === 'object' ? depthById : {};
  const out = { ...DEFAULT_WORK_TYPE_DEPTH };
  for (let i = 0; i < order.length; i += 1) {
    const id = order[i];
    const raw = Number(src[id]);
    let depth = Number.isFinite(raw) ? Math.round(raw) : DEFAULT_WORK_TYPE_DEPTH[id] ?? 0;
    if (i === 0) depth = 0;
    else depth = Math.min(depth, (out[order[i - 1]] ?? 0) + 1);
    depth = Math.max(0, Math.min(WORK_TYPE_MAX_DEPTH, depth));
    out[id] = depth;
  }
  return out;
}

function resolveTreeOrder(raw) {
  if (Array.isArray(raw?.treeOrder) && raw.treeOrder.length) {
    const order = uniqueValidIds(raw.treeOrder);
    for (const id of DEFAULT_WORK_TYPE_TREE) {
      if (!order.includes(id)) order.push(id);
    }
    return order;
  }
  const createOrder = uniqueValidIds(raw?.createOrder).filter((id) => WORK_TYPE_CREATE_IDS.includes(id));
  for (const id of WORK_TYPE_CREATE_IDS) {
    if (!createOrder.includes(id)) createOrder.push(id);
  }
  const order = ['epic', 'feature'];
  for (const id of createOrder) {
    order.push(id);
    if (id === 'task' && !order.includes('subtask')) order.push('subtask');
  }
  if (!order.includes('subtask')) order.push('subtask');
  return uniqueValidIds(order);
}

export function normalizeWorkTypeConfig(raw) {
  const defaults = defaultWorkTypeConfig();
  const hidden = { ...defaults.hidden };
  const srcHidden = raw && typeof raw.hidden === 'object' && raw.hidden ? raw.hidden : {};
  for (const id of WORK_TYPE_ALL_IDS) {
    hidden[id] = Boolean(srcHidden[id]);
  }
  const treeOrder = resolveTreeOrder(raw);
  const depthById = clampTreeDepths(treeOrder, raw?.depthById);
  return {
    treeOrder,
    depthById,
    createOrder: deriveCreateOrder(treeOrder),
    hidden,
  };
}

export function loadWorkTypeConfig(projectId) {
  const key = workTypeStorageKey(projectId);
  if (!key || typeof localStorage === 'undefined') return defaultWorkTypeConfig();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultWorkTypeConfig();
    return normalizeWorkTypeConfig(JSON.parse(raw));
  } catch {
    return defaultWorkTypeConfig();
  }
}

export function saveWorkTypeConfig(projectId, config) {
  const next = normalizeWorkTypeConfig(config);
  const key = workTypeStorageKey(projectId);
  if (key && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* quota / private mode */
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(WORK_TYPE_CHANGE_EVENT, {
        detail: { projectId: String(projectId || '').trim(), config: next },
      })
    );
  }
  return next;
}

/** Story / Task / Bug hiển thị trên board create: thứ tự cây ∩ quyền ∩ không ẩn. */
export function visibleCreateTypes(config, capsAllowed = WORK_TYPE_CREATE_IDS) {
  const cfg = normalizeWorkTypeConfig(config);
  const allowed = new Set(
    (Array.isArray(capsAllowed) ? capsAllowed : [])
      .map((x) => String(x || '').toLowerCase())
      .filter((id) => WORK_TYPE_CREATE_IDS.includes(id))
  );
  return cfg.createOrder.filter((id) => !cfg.hidden[id] && allowed.has(id));
}

/**
 * Menu tạo backlog theo cây Work types (Epic/Feature/Story/Task/Bug/Sub-task).
 * @param {object} config
 * @param {Partial<Record<'epic'|'feature'|'story'|'task'|'bug'|'subtask', boolean>>} caps
 */
export function visibleCreateMenuTypes(config, caps = {}) {
  const cfg = normalizeWorkTypeConfig(config);
  const allowed = {
    epic: Boolean(caps.epic),
    feature: Boolean(caps.feature),
    story: Boolean(caps.story),
    task: Boolean(caps.task),
    bug: Boolean(caps.bug),
    subtask: Boolean(caps.subtask),
  };
  return cfg.treeOrder.filter((id) => WORK_TYPE_ALL_IDS.includes(id) && !cfg.hidden[id] && allowed[id]);
}

export function isBoardCreateType(typeId) {
  return WORK_TYPE_CREATE_IDS.includes(String(typeId || '').toLowerCase());
}

export function isPlanningCreateType(typeId) {
  const id = String(typeId || '').toLowerCase();
  return id === 'epic' || id === 'feature';
}

export function reorderCreateTypes(config, activeId, overId) {
  const cfg = normalizeWorkTypeConfig(config);
  const active = String(activeId || '').toLowerCase();
  const over = String(overId || '').toLowerCase();
  const from = cfg.createOrder.indexOf(active);
  const to = cfg.createOrder.indexOf(over);
  if (from < 0 || to < 0 || from === to) return cfg;
  const nextCreate = [...cfg.createOrder];
  const [item] = nextCreate.splice(from, 1);
  nextCreate.splice(to, 0, item);
  let createIdx = 0;
  const treeOrder = cfg.treeOrder.map((id) => {
    if (!WORK_TYPE_CREATE_IDS.includes(id)) return id;
    const nextId = nextCreate[createIdx];
    createIdx += 1;
    return nextId || id;
  });
  return normalizeWorkTypeConfig({ ...cfg, treeOrder });
}

export function toggleWorkTypeHidden(config, typeId) {
  const cfg = normalizeWorkTypeConfig(config);
  const id = String(typeId || '').toLowerCase();
  if (!WORK_TYPE_ALL_IDS.includes(id)) return cfg;
  return { ...cfg, hidden: { ...cfg.hidden, [id]: !cfg.hidden[id] } };
}

export function workTypeHasChildren(treeOrder, depthById, id) {
  const order = Array.isArray(treeOrder) ? treeOrder : [];
  const idx = order.indexOf(id);
  if (idx < 0 || idx >= order.length - 1) return false;
  const depth = depthById?.[id] ?? 0;
  return (depthById?.[order[idx + 1]] ?? 0) > depth;
}

export function visibleWorkTypeIds(treeOrder, depthById, collapsed = {}) {
  const order = Array.isArray(treeOrder) ? treeOrder : [];
  const hidden = new Set();
  let skipDeeperThan = null;
  for (const id of order) {
    const depth = depthById?.[id] ?? 0;
    if (skipDeeperThan != null && depth > skipDeeperThan) {
      hidden.add(id);
      continue;
    }
    skipDeeperThan = null;
    if (collapsed[id] && workTypeHasChildren(order, depthById, id)) skipDeeperThan = depth;
  }
  return order.filter((id) => !hidden.has(id));
}

export function peerWorkTypeIds(treeOrder, depthById, typeId) {
  const id = String(typeId || '').toLowerCase();
  const depth = depthById?.[id];
  if (depth == null) return [];
  return (Array.isArray(treeOrder) ? treeOrder : []).filter(
    (other) => other !== id && depthById?.[other] === depth
  );
}

/** Mỗi lần kéo ngang chỉ ±1 bậc (cùng cấp khi cùng depth). */
export function depthDeltaFromPointerX(deltaX) {
  const x = Number(deltaX) || 0;
  if (Math.abs(x) < WORK_TYPE_INDENT_PX / 2) return 0;
  return x > 0 ? 1 : -1;
}

/** Kéo dọc đổi thứ tự cây; kéo ngang ±1 bậc (cùng depth = cùng cấp). */
export function applyWorkTypeDrag(config, { activeId, overId, deltaX } = {}) {
  const cfg = normalizeWorkTypeConfig(config);
  const active = String(activeId || '').toLowerCase();
  if (!cfg.treeOrder.includes(active)) return cfg;
  let treeOrder = [...cfg.treeOrder];
  const over = String(overId || '').toLowerCase();
  if (over && over !== active && treeOrder.includes(over)) {
    const from = treeOrder.indexOf(active);
    const to = treeOrder.indexOf(over);
    const [item] = treeOrder.splice(from, 1);
    treeOrder.splice(to, 0, item);
  }
  const depthById = { ...cfg.depthById };
  const step = depthDeltaFromPointerX(deltaX);
  if (step) depthById[active] = (depthById[active] ?? 0) + step;
  return normalizeWorkTypeConfig({ ...cfg, treeOrder, depthById });
}
