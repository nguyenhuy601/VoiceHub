/** Work type tree — mirror FE Hub (không đưa vào shared). */

const WORK_TYPE_CREATE_IDS = Object.freeze(['story', 'task', 'bug']);
const WORK_TYPE_ALL_IDS = Object.freeze(['epic', 'feature', 'story', 'task', 'bug', 'subtask']);
const WORK_TYPE_MAX_DEPTH = 4;

const DEFAULT_WORK_TYPE_DEPTH = Object.freeze({
  epic: 0,
  feature: 1,
  story: 2,
  task: 2,
  bug: 2,
  subtask: 3,
});

const DEFAULT_WORK_TYPE_TREE = Object.freeze(['epic', 'feature', 'story', 'task', 'bug', 'subtask']);

function defaultWorkTypeConfig() {
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

function deriveCreateOrder(treeOrder) {
  return (Array.isArray(treeOrder) ? treeOrder : []).filter((id) => WORK_TYPE_CREATE_IDS.includes(id));
}

function clampTreeDepths(treeOrder, depthById) {
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

function normalizeWorkTypeConfig(raw) {
  const defaults = defaultWorkTypeConfig();
  if (!raw || typeof raw !== 'object') return defaults;
  const hidden = { ...defaults.hidden };
  const srcHidden = raw.hidden && typeof raw.hidden === 'object' ? raw.hidden : {};
  for (const id of WORK_TYPE_ALL_IDS) {
    hidden[id] = Boolean(srcHidden[id]);
  }
  const treeOrder = resolveTreeOrder(raw);
  const depthById = clampTreeDepths(treeOrder, raw.depthById);
  return {
    treeOrder,
    depthById,
    createOrder: deriveCreateOrder(treeOrder),
    hidden,
  };
}

function configTypeDepth(typeId, config) {
  const cfg = normalizeWorkTypeConfig(config);
  const id = String(typeId || '').toLowerCase();
  const d = Number(cfg.depthById[id]);
  return Number.isFinite(d) ? d : 0;
}

/**
 * Nest khi parent đúng 1 cấp trên child. Sibling (cùng depth) không nest.
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
function assertNestByDepth(childType, parentType, config) {
  const child = String(childType || '').toLowerCase();
  const parent = String(parentType || '').toLowerCase();
  if (!WORK_TYPE_ALL_IDS.includes(child) || !WORK_TYPE_ALL_IDS.includes(parent)) {
    return { ok: false, message: 'Work type không hợp lệ' };
  }
  const ad = configTypeDepth(child, config);
  const od = configTypeDepth(parent, config);
  if (od === ad - 1) return { ok: true };
  return {
    ok: false,
    message: 'Chỉ gắn vào nhóm trên đúng 1 cấp theo cấu hình Work types',
  };
}

function canNestByDepth(childType, parentType, config) {
  return assertNestByDepth(childType, parentType, config).ok;
}

/** GET additive: null khi project chưa lưu config (FE fallback localStorage/default). */
function serializeWorkTypeConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return normalizeWorkTypeConfig(raw);
}

module.exports = {
  WORK_TYPE_ALL_IDS,
  WORK_TYPE_CREATE_IDS,
  DEFAULT_WORK_TYPE_DEPTH,
  defaultWorkTypeConfig,
  normalizeWorkTypeConfig,
  serializeWorkTypeConfig,
  configTypeDepth,
  assertNestByDepth,
  canNestByDepth,
};
