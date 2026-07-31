/**
 * Pure workflow transition graph + validators / conditions (Phase 4).
 */

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

/**
 * @returns {{ ok: boolean, message?: string, transition?: object|null }}
 */
function assertTransitionAllowed(workflow, fromStatus, toStatus) {
  const from = String(fromStatus || '').trim();
  const to = String(toStatus || '').trim();
  if (!to) return { ok: false, message: 'status đích bắt buộc' };
  if (from === to) return { ok: true, transition: null };

  if (!workflow || !Array.isArray(workflow.states) || !workflow.states.length) {
    if (!LEGACY_STATUSES.includes(to)) {
      return { ok: false, message: `status không hợp lệ: ${to}` };
    }
    return { ok: true, transition: null };
  }

  const keys = new Set(workflow.states.map((s) => String(s.key)));
  if (!keys.has(to)) {
    return { ok: false, message: `Status “${to}” không có trong workflow của board` };
  }
  if (from && !keys.has(from)) {
    const initial = workflow.states.find((s) => s.isInitial);
    if (initial && to === initial.key) return { ok: true, transition: null };
  }
  const transition = (workflow.transitions || []).find(
    (t) => String(t.fromKey) === from && String(t.toKey) === to
  );
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
 * @param {string[]} conditions
 * @param {{ card?: object, actorProjectRoleKeys?: string[] }} ctx
 */
function runConditions(conditions = [], ctx = {}) {
  const list = Array.isArray(conditions) ? conditions : [];
  const card = ctx.card || {};
  const roleKeys = new Set((ctx.actorProjectRoleKeys || []).map(String));

  for (const raw of list) {
    const key = typeof raw === 'string' ? raw : String(raw?.type || raw?.key || '').trim();
    if (!key) continue;

    if (key.startsWith('role_in_project:')) {
      const need = key.slice('role_in_project:'.length).trim();
      if (need && !roleKeys.has(need)) {
        return {
          ok: false,
          message: `Cần Project Role “${need}” để chuyển status này`,
        };
      }
    }

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

    // no-op placeholder used in Enterprise seed — always ok
    if (key === 'priority_not_urgent_or_ok') {
      continue;
    }
  }
  return { ok: true };
}

/**
 * Full transition check: graph + optional permission + validators + conditions.
 */
function evaluateTransition({
  workflow,
  fromStatus,
  toStatus,
  card = {},
  actorPermissions = [],
  actorProjectRoleKeys = [],
  isElevated = false,
} = {}) {
  const graph = assertTransitionAllowed(workflow, fromStatus, toStatus);
  if (!graph.ok) return graph;
  if (fromStatus === toStatus) return { ok: true };

  const transition = graph.transition;
  if (!transition) return { ok: true };

  const requiredPermission = String(transition.requiredPermission || '').trim();
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
  if (/doing|in progress|dang lam|đang làm|progress/.test(n)) return 'doing';
  if (/^open$|todo|to do|backlog|viec can lam|việc cần làm/.test(n)) return 'todo';
  return '';
}

function statesToBoardShape(statuses = []) {
  return (statuses || []).map((s, i) => ({
    key: String(s.key || '').trim(),
    label: String(s.label || s.key || '').trim(),
    order: Number(s.sortOrder ?? s.order) || i + 1,
    isInitial: Boolean(s.isInitial),
    isFinal: Boolean(s.isFinal),
    category: String(s.category || '').trim() || undefined,
  }));
}

function transitionsToBoardShape(transitions = []) {
  return (transitions || []).map((t) => ({
    fromKey: String(t.fromKey || '').trim(),
    toKey: String(t.toKey || '').trim(),
    name: String(t.name || '').trim(),
    requiredPermission: String(t.requiredPermission || '').trim() || undefined,
    validators: Array.isArray(t.validators) ? t.validators.map(String) : [],
    conditions: Array.isArray(t.conditions) ? t.conditions.map(String) : [],
    requiresApprovalPolicyKey: String(t.requiresApprovalPolicyKey || '').trim() || undefined,
    requiresApprovalPolicyId: t.requiresApprovalPolicyId
      ? String(t.requiresApprovalPolicyId)
      : undefined,
  }));
}

module.exports = {
  LEGACY_STATUSES,
  assertTransitionAllowed,
  runValidators,
  runConditions,
  evaluateTransition,
  inferStatusKeyFromTitle,
  statesToBoardShape,
  transitionsToBoardShape,
};
