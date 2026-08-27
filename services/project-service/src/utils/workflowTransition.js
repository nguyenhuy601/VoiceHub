/**
 * Pure workflow transition graph + validators / conditions (Phase 4).
 */

const {
  DEFAULT_CHANGE_STATUS_PERMISSION,
} = require('./workflowTemplates.defaults');
const { repairUtf8Mojibake } = require('@enterprise/shared/utils/utf8Mojibake');

let MASTER_PROJECT_ROLE_KEYS_CACHE = null;
function getMasterProjectRoleKeys() {
  if (!MASTER_PROJECT_ROLE_KEYS_CACHE) {
    try {
      ({ MASTER_PROJECT_ROLE_KEYS: MASTER_PROJECT_ROLE_KEYS_CACHE } = require('@enterprise/shared/config/masterData'));
    } catch {
      MASTER_PROJECT_ROLE_KEYS_CACHE = [];
    }
  }
  return MASTER_PROJECT_ROLE_KEYS_CACHE;
}

const LEGACY_STATUSES = Object.freeze([
  'todo',
  'in_progress',
  'review',
  'done',
  'cancelled',
  'doing',
  'open',
  'analysis',
  'dev',
  'code_review',
  'qa',
  'uat',
  'deploy',
]);

/** Seed cột dùng in_progress; template cũ / label “Doing” dùng doing — dual-read. */
const STATUS_KEY_ALIASES = Object.freeze({
  doing: Object.freeze(['doing', 'in_progress']),
  in_progress: Object.freeze(['in_progress', 'doing']),
});

function statusKeyEquivalents(key) {
  const k = String(key || '').trim();
  if (!k) return [];
  return STATUS_KEY_ALIASES[k] || [k];
}

function statusKeysMatch(a, b) {
  const left = statusKeyEquivalents(a);
  const right = new Set(statusKeyEquivalents(b));
  return left.some((k) => right.has(k));
}

function workflowHasStatusKey(workflowKeys, statusKey) {
  const keys = workflowKeys instanceof Set ? workflowKeys : new Set(workflowKeys || []);
  return statusKeyEquivalents(statusKey).some((k) => keys.has(k));
}

function findTransition(workflow, fromStatus, toStatus) {
  const from = String(fromStatus || '').trim();
  const to = String(toStatus || '').trim();
  return (workflow?.transitions || []).find(
    (t) => statusKeysMatch(t.fromKey, from) && statusKeysMatch(t.toKey, to)
  );
}

/**
 * @returns {{ ok: boolean, message?: string, transition?: object|null }}
 */
function assertTransitionAllowed(workflow, fromStatus, toStatus) {
  const from = String(fromStatus || '').trim();
  const to = String(toStatus || '').trim();
  if (!to) return { ok: false, message: 'status đích bắt buộc' };
  if (from === to || statusKeysMatch(from, to)) return { ok: true, transition: null };

  if (!workflow || !Array.isArray(workflow.states) || !workflow.states.length) {
    if (!LEGACY_STATUSES.includes(to) && !statusKeyEquivalents(to).some((k) => LEGACY_STATUSES.includes(k))) {
      return { ok: false, message: `status không hợp lệ: ${to}` };
    }
    return { ok: true, transition: null };
  }

  const keys = new Set(workflow.states.map((s) => String(s.key)));
  if (!workflowHasStatusKey(keys, to)) {
    return { ok: false, message: `Status “${to}” không có trong workflow của board` };
  }
  if (from && !workflowHasStatusKey(keys, from)) {
    const initial = workflow.states.find((s) => s.isInitial);
    if (initial && statusKeysMatch(to, initial.key)) return { ok: true, transition: null };
  }
  const transition = findTransition(workflow, from, to);
  if (!transition) {
    return {
      ok: false,
      message: `Không có transition ${from || '(empty)'} → ${to} trên workflow`,
    };
  }
  return { ok: true, transition };
}

function runValidators(validators = [], card = {}) {
  const list = Array.isArray(validators) ? validators : [];
  for (const raw of list) {
    const key = typeof raw === 'string' ? raw : String(raw?.type || raw?.key || '').trim();
    if (!key) continue;
    if (key === 'assignee_present') {
      const assignee =
        card.assigneeId ||
        (Array.isArray(card.assignments) && card.assignments.some((a) => a?.userId));
      if (!assignee) {
        return { ok: false, message: 'Cần gán assignee trước khi chuyển status này' };
      }
    }
    if (key === 'required_fields' || key === 'required_title') {
      if (!String(card.title || '').trim()) {
        return { ok: false, message: 'Thiếu title bắt buộc' };
      }
    }
    if (key === 'required_description') {
      if (!String(card.description || card.summary || '').trim()) {
        return { ok: false, message: 'Thiếu mô tả bắt buộc' };
      }
    }
  }
  return { ok: true };
}

/**
 * Extract project-role keys from a condition entry (string DSL or object).
 * @returns {string[]}
 */
function extractRoleKeysFromCondition(raw) {
  if (raw == null) return [];
  if (typeof raw === 'string') {
    const key = raw.trim();
    if (key.startsWith('role_in_project:')) {
      const need = key.slice('role_in_project:'.length).trim();
      return need
        ? need
            .split('|')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    }
    return [];
  }
  if (typeof raw === 'object') {
    const type = String(raw.type || raw.key || '').trim();
    if (type === 'project_role' || type === 'role_in_project') {
      const keys = Array.isArray(raw.roleKeys)
        ? raw.roleKeys
        : raw.roleKey
          ? [raw.roleKey]
          : [];
      return keys.map((k) => String(k || '').trim()).filter(Boolean);
    }
  }
  return [];
}

/**
 * Normalize condition for storage — keep string DSL or canonical object.
 */
function normalizeCondition(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const s = raw.trim();
    return s || null;
  }
  if (typeof raw === 'object') {
    const type = String(raw.type || raw.key || '').trim();
    if (type === 'project_role' || type === 'role_in_project') {
      const roleKeys = extractRoleKeysFromCondition(raw);
      if (!roleKeys.length) return null;
      // Persist as string DSL for board shape compatibility + one object form accepted at save
      return { type: 'project_role', roleKeys };
    }
    if (type === 'priority_in' || type.startsWith('priority')) {
      const allowed = Array.isArray(raw.values)
        ? raw.values
        : String(raw.value || '')
            .split('|')
            .map((s) => s.trim())
            .filter(Boolean);
      if (!allowed.length) return null;
      return `priority_in:${allowed.join('|')}`;
    }
  }
  return null;
}

/**
 * @param {Array<string|object>} conditions
 * @param {{ card?: object, actorProjectRoleKeys?: string[] }} ctx
 */
function runConditions(conditions = [], ctx = {}) {
  const list = Array.isArray(conditions) ? conditions : [];
  const card = ctx.card || {};
  const roleKeys = new Set((ctx.actorProjectRoleKeys || []).map(String));

  for (const raw of list) {
    const projectRoles = extractRoleKeysFromCondition(raw);
    if (projectRoles.length) {
      const hasAny = projectRoles.some((k) => roleKeys.has(k));
      if (!hasAny) {
        return {
          ok: false,
          message: `Cần Project Role “${projectRoles.join('|')}” để chuyển status này`,
        };
      }
      continue;
    }

    const key = typeof raw === 'string' ? raw.trim() : String(raw?.type || raw?.key || '').trim();
    if (!key) continue;

    if (key.startsWith('priority_in:')) {
      const allowed = key
        .slice('priority_in:'.length)
        .split('|')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const p = String(card.priority || 'medium').toLowerCase();
      if (allowed.length && !allowed.includes(p)) {
        return {
          ok: false,
          message: `Priority phải thuộc [${allowed.join(', ')}]`,
        };
      }
    }

    // no-op placeholder — always ok
    if (key === 'priority_not_urgent_or_ok') {
      continue;
    }
  }
  return { ok: true };
}

/**
 * Save-time: reject condition roleKeys outside master project role catalog (T3).
 * @param {Array} transitions
 * @param {string[]|Set} [allowedKeys] — default MASTER_PROJECT_ROLE_KEYS
 * @returns {{ ok: boolean, message?: string, invalidKeys?: string[] }}
 */
function validateTransitionRoleKeys(transitions = [], allowedKeys = null) {
  const allowed = new Set(
    (allowedKeys ? [...allowedKeys] : getMasterProjectRoleKeys()).map(String)
  );
  const invalid = new Set();
  for (const tr of transitions || []) {
    for (const cond of tr.conditions || []) {
      for (const rk of extractRoleKeysFromCondition(cond)) {
        if (!allowed.has(rk)) invalid.add(rk);
      }
    }
  }
  if (invalid.size) {
    return {
      ok: false,
      message: `Condition roleKeys không thuộc master Project Roles: ${[...invalid].join(', ')}`,
      invalidKeys: [...invalid],
      statusCode: 400,
    };
  }
  return { ok: true };
}

/**
 * Full transition check: graph + P2.1 permission (default task:change_status) + validators + conditions.
 */
function evaluateTransition({
  workflow,
  fromStatus,
  toStatus,
  card = {},
  actorPermissions = [],
  actorProjectRoleKeys = [],
  isElevated = false,
  defaultRequiredPermission = DEFAULT_CHANGE_STATUS_PERMISSION,
} = {}) {
  const graph = assertTransitionAllowed(workflow, fromStatus, toStatus);
  if (!graph.ok) return graph;
  if (fromStatus === toStatus || statusKeysMatch(fromStatus, toStatus)) return { ok: true };

  const transition = graph.transition;
  if (!transition) return { ok: true };

  const requiredPermission =
    String(transition.requiredPermission || '').trim() ||
    String(defaultRequiredPermission || '').trim();

  if (requiredPermission && !isElevated) {
    const perms = new Set((actorPermissions || []).map(String));
    const has =
      perms.has(requiredPermission) ||
      (requiredPermission === 'task:change_status' &&
        (perms.has('task:change_status') || perms.has('task:update')));
    if (!has) {
      return {
        ok: false,
        message: `Thiếu quyền ${requiredPermission}`,
        statusCode: 403,
      };
    }
  }

  const v = runValidators(transition.validators, card);
  if (!v.ok) return { ...v, statusCode: 400 };

  const c = runConditions(transition.conditions, { card, actorProjectRoleKeys });
  if (!c.ok) return { ...c, statusCode: 400 };

  return { ok: true, transition };
}

/** Guess statusKey from list title (migrate / dual-read). */
function inferStatusKeyFromTitle(title = '') {
  const n = String(title || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!n) return '';
  if (/(^| )(xong|done|completed|hoan thanh|hoàn thành)($| )/.test(n) || n === 'done') return 'done';
  if (/cancel|huy|huỷ/.test(n)) return 'cancelled';
  if (/review|code review/.test(n)) return 'code_review';
  if (/^qa$|quality/.test(n)) return 'qa';
  if (/uat/.test(n)) return 'uat';
  if (/deploy/.test(n)) return 'deploy';
  if (/analys/.test(n)) return 'analysis';
  if (/^dev$|develop/.test(n)) return 'dev';
  if (/doing|in progress|dang lam|đang làm|progress/.test(n)) return 'in_progress';
  if (/^open$|todo|to do|backlog|viec can lam|việc cần làm/.test(n)) return 'todo';
  return '';
}

const { repairUtf8Mojibake } = require('@enterprise/shared/utils/utf8Mojibake');

function statesToBoardShape(statuses = []) {
  return (statuses || []).map((s, i) => ({
    key: String(s.key || '').trim(),
    label: repairUtf8Mojibake(String(s.label || s.key || '').trim()),
    order: Number(s.sortOrder ?? s.order) || i + 1,
    isInitial: Boolean(s.isInitial),
    isFinal: Boolean(s.isFinal),
    category: String(s.category || '').trim() || undefined,
  }));
}

function transitionsToBoardShape(transitions = [], { defaultPermission = true } = {}) {
  return (transitions || []).map((t) => {
    const conditions = (Array.isArray(t.conditions) ? t.conditions : [])
      .map(normalizeCondition)
      .filter(Boolean)
      .map((c) => {
        if (typeof c === 'object' && c.type === 'project_role') {
          return `role_in_project:${(c.roleKeys || []).join('|')}`;
        }
        return c;
      });
    const required =
      String(t.requiredPermission || '').trim() ||
      (defaultPermission ? DEFAULT_CHANGE_STATUS_PERMISSION : undefined);
    return {
      fromKey: String(t.fromKey || '').trim(),
      toKey: String(t.toKey || '').trim(),
      name: String(t.name || '').trim(),
      requiredPermission: required || undefined,
      validators: Array.isArray(t.validators) ? t.validators.map(String) : [],
      conditions,
      requiresApprovalPolicyKey: String(t.requiresApprovalPolicyKey || '').trim() || undefined,
      requiresApprovalPolicyId: t.requiresApprovalPolicyId
        ? String(t.requiresApprovalPolicyId)
        : undefined,
    };
  });
}

/**
 * Pure migrate plan for T5/T6 — map existing lists → workflow states without dropping unmatched.
 */
function planListMigration(existingLists = [], states = []) {
  const sorted = [...(states || [])].sort(
    (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)
  );
  const byStatusKey = new Map(
    existingLists.filter((l) => l.statusKey).map((l) => [String(l.statusKey), l])
  );
  const unmatched = existingLists.filter((l) => !l.statusKey);
  const used = new Set();
  const mapped = [];
  const createdKeys = [];

  for (const st of sorted) {
    let list = byStatusKey.get(st.key) || null;
    if (!list) {
      const inferred = unmatched.find((l) => {
        if (used.has(String(l._id || l.id))) return false;
        const guess = inferStatusKeyFromTitle(l.title);
        return guess === st.key || String(l.title).toLowerCase() === String(st.label).toLowerCase();
      });
      if (inferred) list = inferred;
    }
    if (list) {
      used.add(String(list._id || list.id));
      mapped.push({ statusKey: st.key, listId: String(list._id || list.id), created: false });
    } else {
      createdKeys.push(st.key);
      mapped.push({ statusKey: st.key, listId: null, created: true });
    }
  }

  const preservedUnmatched = existingLists.filter((l) => !used.has(String(l._id || l.id)) && !l.statusKey);
  return {
    columns: sorted.map((s) => s.key),
    mapped,
    createdKeys,
    preservedUnmatchedIds: preservedUnmatched.map((l) => String(l._id || l.id)),
  };
}

module.exports = {
  LEGACY_STATUSES,
  STATUS_KEY_ALIASES,
  statusKeyEquivalents,
  statusKeysMatch,
  workflowHasStatusKey,
  findTransition,
  assertTransitionAllowed,
  runValidators,
  runConditions,
  evaluateTransition,
  inferStatusKeyFromTitle,
  statesToBoardShape,
  transitionsToBoardShape,
  validateTransitionRoleKeys,
  extractRoleKeysFromCondition,
  normalizeCondition,
  planListMigration,
  DEFAULT_CHANGE_STATUS_PERMISSION,
};
