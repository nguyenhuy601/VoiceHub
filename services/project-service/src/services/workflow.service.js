const WorkflowDefinition = require('../models/WorkflowDefinition');
const TaskBoard = require('../models/TaskBoard');

const LEGACY_STATUSES = Object.freeze([
  'todo',
  'in_progress',
  'review',
  'done',
  'cancelled',
]);

const DEFAULT_STATES = Object.freeze([
  { key: 'todo', label: 'Todo', order: 1, isInitial: true, isFinal: false },
  { key: 'in_progress', label: 'In progress', order: 2, isInitial: false, isFinal: false },
  { key: 'review', label: 'Review', order: 3, isInitial: false, isFinal: false },
  { key: 'done', label: 'Done', order: 4, isInitial: false, isFinal: true },
  { key: 'cancelled', label: 'Cancelled', order: 5, isInitial: false, isFinal: true },
]);

const DEFAULT_TRANSITIONS = Object.freeze([
  { fromKey: 'todo', toKey: 'in_progress' },
  { fromKey: 'in_progress', toKey: 'review' },
  { fromKey: 'review', toKey: 'done' },
  { fromKey: 'todo', toKey: 'cancelled' },
  { fromKey: 'in_progress', toKey: 'cancelled' },
  { fromKey: 'review', toKey: 'cancelled' },
  { fromKey: 'review', toKey: 'in_progress' },
  { fromKey: 'in_progress', toKey: 'todo' },
]);

async function requireBoardAdmin(boardId, userId) {
  const board = await TaskBoard.findById(boardId).lean();
  if (!board || board.isActive === false) {
    const err = new Error('Board không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  // Lazy require — tránh kéo taskWorkspaceScope (env) khi chỉ unit-test assertTransitionAllowed
  const boardService = require('./taskBoard.service');
  const ok = await boardService.userCanAdminBoard(userId, board);
  if (!ok) {
    const err = new Error('Không có quyền quản trị board này');
    err.statusCode = 403;
    throw err;
  }
  return board;
}

function normalizeStates(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((s, i) => ({
      key: String(s.key || '').trim(),
      label: String(s.label || s.key || '').trim(),
      order: Number(s.order) || i + 1,
      isInitial: Boolean(s.isInitial),
      isFinal: Boolean(s.isFinal),
    }))
    .filter((s) => s.key);
}

function normalizeTransitions(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((t) => ({
      fromKey: String(t.fromKey || '').trim(),
      toKey: String(t.toKey || '').trim(),
    }))
    .filter((t) => t.fromKey && t.toKey);
}

async function getWorkflow(boardId, userId) {
  await requireBoardAdmin(boardId, userId);
  return WorkflowDefinition.findOne({ boardId }).lean();
}

async function upsertWorkflow({ userId, boardId, name, states, transitions }) {
  const board = await requireBoardAdmin(boardId, userId);
  const nextStates = normalizeStates(states);
  const nextTransitions = normalizeTransitions(transitions);
  if (!nextStates.length) throw new Error('states bắt buộc');
  const keys = new Set(nextStates.map((s) => s.key));
  for (const tr of nextTransitions) {
    if (!keys.has(tr.fromKey) || !keys.has(tr.toKey)) {
      throw new Error(`Transition ${tr.fromKey}→${tr.toKey} tham chiếu state không tồn tại`);
    }
  }
  const doc = await WorkflowDefinition.findOneAndUpdate(
    { boardId },
    {
      $set: {
        organizationId: board.organizationId,
        boardId,
        name: String(name || 'Default').trim() || 'Default',
        states: nextStates,
        transitions: nextTransitions,
      },
    },
    { upsert: true, new: true }
  ).lean();

  await TaskBoard.updateOne({ _id: boardId }, { $set: { workflowId: doc._id } });
  return doc;
}

async function seedDefaultWorkflow({ userId, boardId }) {
  return upsertWorkflow({
    userId,
    boardId,
    name: 'Default',
    states: DEFAULT_STATES,
    transitions: DEFAULT_TRANSITIONS,
  });
}

/**
 * Pure helper — dùng cho unit test không cần DB.
 * @returns {{ ok: boolean, message?: string }}
 */
function assertTransitionAllowed(workflow, fromStatus, toStatus) {
  const from = String(fromStatus || '').trim();
  const to = String(toStatus || '').trim();
  if (!to) return { ok: false, message: 'status đích bắt buộc' };
  if (from === to) return { ok: true };

  if (!workflow || !Array.isArray(workflow.states) || !workflow.states.length) {
    if (!LEGACY_STATUSES.includes(to)) {
      return { ok: false, message: `status không hợp lệ: ${to}` };
    }
    return { ok: true };
  }

  const keys = new Set(workflow.states.map((s) => s.key));
  if (!keys.has(to)) {
    return { ok: false, message: `Status “${to}” không có trong workflow của board` };
  }
  if (from && !keys.has(from)) {
    // From ngoài workflow (legacy) — cho phép nhảy vào initial hoặc bất kỳ nếu from rỗng
    const initial = workflow.states.find((s) => s.isInitial);
    if (initial && to === initial.key) return { ok: true };
  }
  const edge = (workflow.transitions || []).some(
    (t) => String(t.fromKey) === from && String(t.toKey) === to
  );
  if (!edge) {
    return {
      ok: false,
      message: `Không có transition ${from || '(empty)'} → ${to} trên workflow`,
    };
  }
  return { ok: true };
}

async function assertCanTransition(board, fromStatus, toStatus) {
  if (!board?.workflowId) {
    return assertTransitionAllowed(null, fromStatus, toStatus);
  }
  const wf = await WorkflowDefinition.findById(board.workflowId).lean();
  return assertTransitionAllowed(wf, fromStatus, toStatus);
}

module.exports = {
  LEGACY_STATUSES,
  DEFAULT_STATES,
  DEFAULT_TRANSITIONS,
  getWorkflow,
  upsertWorkflow,
  seedDefaultWorkflow,
  assertTransitionAllowed,
  assertCanTransition,
  requireBoardAdmin,
};
