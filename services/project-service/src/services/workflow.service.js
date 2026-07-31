const WorkflowDefinition = require('../models/WorkflowDefinition');
const WorkflowTemplate = require('../models/WorkflowTemplate');
const TaskBoard = require('../models/TaskBoard');
const TaskBoardList = require('../models/TaskBoardList');
const Task = require('../models/Task');
const Project = require('../models/Project');
const {
  BUILTIN_TEMPLATES,
  DEFAULT_BOARD_TEMPLATE,
  isWorkflowEngineV2Enabled,
} = require('../utils/workflowTemplates.defaults');
const {
  LEGACY_STATUSES,
  assertTransitionAllowed,
  evaluateTransition,
  inferStatusKeyFromTitle,
  statesToBoardShape,
  transitionsToBoardShape,
} = require('../utils/workflowTransition');

const DEFAULT_STATES = Object.freeze(statesToBoardShape(DEFAULT_BOARD_TEMPLATE.statuses));
const DEFAULT_TRANSITIONS = Object.freeze(
  transitionsToBoardShape(DEFAULT_BOARD_TEMPLATE.transitions)
);

async function requireBoardAdmin(boardId, userId) {
  const board = await TaskBoard.findById(boardId).lean();
  if (!board || board.isActive === false) {
    const err = new Error('Board không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const boardService = require('./taskBoard.service');
  const ok = await boardService.userCanAdminBoard(userId, board);
  if (!ok) {
    const err = new Error('Không có quyền quản trị board này');
    err.statusCode = 403;
    throw err;
  }
  return board;
}

async function requireOrgAdmin(organizationId, userId) {
  const { fetchTaskWorkspaceScope } = require('./taskWorkspaceScope');
  const scope = await fetchTaskWorkspaceScope(userId, organizationId);
  const role = String(scope?.membershipRole || '').toLowerCase();
  if (role !== 'owner' && role !== 'admin') {
    const err = new Error('Chỉ org admin được quản lý Workflow Template');
    err.statusCode = 403;
    throw err;
  }
  return scope;
}

function normalizeStates(raw) {
  return statesToBoardShape(Array.isArray(raw) ? raw : []);
}

function normalizeTransitions(raw) {
  return transitionsToBoardShape(Array.isArray(raw) ? raw : []);
}

async function ensureOrgWorkflowTemplates(organizationId) {
  const orgId = String(organizationId || '').trim();
  if (!orgId) return [];
  const existing = await WorkflowTemplate.find({ organizationId: orgId }).lean();
  const byKey = new Map(existing.map((t) => [String(t.key), t]));
  const out = [...existing];
  for (const seed of BUILTIN_TEMPLATES) {
    if (byKey.has(seed.key)) continue;
    const doc = await WorkflowTemplate.create({
      organizationId: orgId,
      key: seed.key,
      name: seed.name,
      description: seed.description || '',
      isBuiltin: true,
      isActive: true,
      statuses: seed.statuses,
      transitions: seed.transitions,
    });
    out.push(doc.toObject());
  }
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
}

async function listWorkflowTemplates(organizationId, userId, { projectId } = {}) {
  const { assertCanReadOrgCatalog } = require('./orgCatalogAccess.service');
  await assertCanReadOrgCatalog({ organizationId, userId, projectId });
  return ensureOrgWorkflowTemplates(organizationId);
}

async function getWorkflowTemplate(organizationId, templateId, userId, { projectId } = {}) {
  const { assertCanReadOrgCatalog } = require('./orgCatalogAccess.service');
  await assertCanReadOrgCatalog({ organizationId, userId, projectId });
  await ensureOrgWorkflowTemplates(organizationId);
  const doc = await WorkflowTemplate.findOne({
    _id: templateId,
    organizationId,
    isActive: { $ne: false },
  }).lean();
  if (!doc) {
    const err = new Error('Workflow template không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  return doc;
}

async function upsertWorkflowTemplate({
  userId,
  organizationId,
  templateId,
  key,
  name,
  description,
  statuses,
  transitions,
}) {
  await requireOrgAdmin(organizationId, userId);
  await ensureOrgWorkflowTemplates(organizationId);

  const nextStatuses = Array.isArray(statuses) ? statuses : [];
  const nextTransitions = Array.isArray(transitions) ? transitions : [];
  if (!nextStatuses.length) {
    const err = new Error('statuses bắt buộc');
    err.statusCode = 400;
    throw err;
  }
  const keys = new Set(nextStatuses.map((s) => String(s.key || '').trim()).filter(Boolean));
  for (const tr of nextTransitions) {
    if (!keys.has(String(tr.fromKey)) || !keys.has(String(tr.toKey))) {
      const err = new Error(`Transition ${tr.fromKey}→${tr.toKey} tham chiếu status không tồn tại`);
      err.statusCode = 400;
      throw err;
    }
  }

  if (templateId) {
    const existing = await WorkflowTemplate.findOne({ _id: templateId, organizationId });
    if (!existing) {
      const err = new Error('Workflow template không tồn tại');
      err.statusCode = 404;
      throw err;
    }
    if (existing.isBuiltin) {
      // Builtin: cho phép sửa statuses/transitions nhưng giữ key
      existing.name = String(name || existing.name).trim() || existing.name;
      existing.description = String(description ?? existing.description ?? '').trim();
      existing.statuses = nextStatuses;
      existing.transitions = nextTransitions;
      await existing.save();
      return existing.toObject();
    }
    if (key) existing.key = String(key).trim().toLowerCase();
    existing.name = String(name || existing.name).trim() || existing.name;
    existing.description = String(description ?? existing.description ?? '').trim();
    existing.statuses = nextStatuses;
    existing.transitions = nextTransitions;
    await existing.save();
    return existing.toObject();
  }

  const k = String(key || name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!k) {
    const err = new Error('key bắt buộc');
    err.statusCode = 400;
    throw err;
  }
  const doc = await WorkflowTemplate.create({
    organizationId,
    key: k,
    name: String(name || k).trim(),
    description: String(description || '').trim(),
    isBuiltin: false,
    statuses: nextStatuses,
    transitions: nextTransitions,
  });
  return doc.toObject();
}

async function getWorkflow(boardId, userId) {
  await requireBoardAdmin(boardId, userId);
  return WorkflowDefinition.findOne({ boardId }).lean();
}

async function upsertWorkflow({ userId, boardId, name, states, transitions, templateId, templateKey }) {
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
        templateId: templateId || null,
        templateKey: String(templateKey || '').trim(),
      },
    },
    { upsert: true, new: true }
  ).lean();

  await TaskBoard.updateOne({ _id: boardId }, { $set: { workflowId: doc._id } });
  if (isWorkflowEngineV2Enabled()) {
    await syncBoardListsFromWorkflow(boardId, doc);
  }
  return doc;
}

async function seedDefaultWorkflow({ userId, boardId }) {
  return upsertWorkflow({
    userId,
    boardId,
    name: DEFAULT_BOARD_TEMPLATE.name,
    states: DEFAULT_STATES,
    transitions: DEFAULT_TRANSITIONS,
    templateKey: DEFAULT_BOARD_TEMPLATE.key,
  });
}

/**
 * Map / create lists 1:1 với workflow states. Không xóa list còn card (T5).
 */
async function syncBoardListsFromWorkflow(boardId, workflow) {
  const states = [...(workflow?.states || [])].sort(
    (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)
  );
  if (!states.length) return { lists: [], migrated: 0 };

  const lists = await TaskBoardList.find({ boardId, isArchived: false }).sort({ order: 1 }).lean();
  const byStatusKey = new Map(
    lists.filter((l) => l.statusKey).map((l) => [String(l.statusKey), l])
  );
  const unmatched = lists.filter((l) => !l.statusKey);

  let migrated = 0;
  const usedListIds = new Set();
  const result = [];

  for (let i = 0; i < states.length; i += 1) {
    const st = states[i];
    let list = byStatusKey.get(st.key) || null;
    if (!list) {
      const inferred = unmatched.find((l) => {
        if (usedListIds.has(String(l._id))) return false;
        const guess = inferStatusKeyFromTitle(l.title);
        return guess === st.key || String(l.title).toLowerCase() === String(st.label).toLowerCase();
      });
      if (inferred) list = inferred;
    }
    if (list) {
      usedListIds.add(String(list._id));
      await TaskBoardList.updateOne(
        { _id: list._id },
        {
          $set: {
            title: st.label,
            statusKey: st.key,
            order: (i + 1) * 1000,
            isDefault: Boolean(st.isInitial),
          },
        }
      );
      migrated += 1;
      result.push({ listId: String(list._id), statusKey: st.key, created: false });
    } else {
      const created = await TaskBoardList.create({
        boardId,
        title: st.label,
        statusKey: st.key,
        order: (i + 1) * 1000,
        isDefault: Boolean(st.isInitial),
        isArchived: false,
      });
      result.push({ listId: String(created._id), statusKey: st.key, created: true });
    }
  }

  // Lists không map: giữ nguyên (không archive) để không mất card — dual-read
  return { lists: result, migrated };
}

async function applyTemplateToBoard({ userId, boardId, templateId, templateKey }) {
  const board = await requireBoardAdmin(boardId, userId);
  await ensureOrgWorkflowTemplates(board.organizationId);

  let template = null;
  if (templateId) {
    template = await WorkflowTemplate.findOne({
      _id: templateId,
      organizationId: board.organizationId,
      isActive: { $ne: false },
    }).lean();
  } else if (templateKey) {
    template = await WorkflowTemplate.findOne({
      organizationId: board.organizationId,
      key: String(templateKey).trim(),
      isActive: { $ne: false },
    }).lean();
  }
  if (!template) {
    const err = new Error('Workflow template không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  const wf = await upsertWorkflow({
    userId,
    boardId,
    name: template.name,
    states: statesToBoardShape(template.statuses),
    transitions: transitionsToBoardShape(template.transitions),
    templateId: template._id,
    templateKey: template.key,
  });

  if (board.projectId) {
    await Project.updateOne(
      { _id: board.projectId },
      { $set: { workflowTemplateId: template._id } }
    );
  }

  return { workflow: wf, template };
}

async function applyTemplateToProject({ userId, projectId, templateId, templateKey }) {
  const project = await Project.findById(projectId).lean();
  if (!project || project.isActive === false) {
    const err = new Error('Project không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const { isProjectRbacV2Enabled, hasPermission } = require('../utils/projectPermissionMatrix');
  if (isProjectRbacV2Enabled()) {
    const { resolveUserProjectPermissions } = require('./projectAccess.service');
    const resolved = await resolveUserProjectPermissions({ userId, projectId });
    const can =
      hasPermission(resolved.permissions, 'settings:update') ||
      hasPermission(resolved.permissions, 'project:edit') ||
      resolved.isOrgAdmin ||
      resolved.isCreator;
    if (!can) {
      const err = new Error('Không có quyền apply workflow (settings:update)');
      err.statusCode = 403;
      throw err;
    }
  } else {
    const { userCanAdminProject } = require('./project.service');
    const can = await userCanAdminProject(userId, project);
    if (!can) {
      const err = new Error('Không có quyền apply workflow');
      err.statusCode = 403;
      throw err;
    }
  }

  await ensureOrgWorkflowTemplates(project.organizationId);
  let template = null;
  if (templateId) {
    template = await WorkflowTemplate.findOne({
      _id: templateId,
      organizationId: project.organizationId,
    }).lean();
  } else if (templateKey) {
    template = await WorkflowTemplate.findOne({
      organizationId: project.organizationId,
      key: String(templateKey).trim(),
    }).lean();
  }
  if (!template) {
    const err = new Error('Workflow template không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  await Project.updateOne({ _id: projectId }, { $set: { workflowTemplateId: template._id } });

  const boards = await TaskBoard.find({ projectId, isActive: true }).select('_id').lean();
  const applied = [];
  for (const b of boards) {
    const res = await applyTemplateToBoard({
      userId,
      boardId: b._id,
      templateId: template._id,
    });
    applied.push({ boardId: String(b._id), workflowId: String(res.workflow._id) });
  }
  return { template, applied };
}

async function assertCanTransition(board, fromStatus, toStatus, opts = {}) {
  if (!board?.workflowId) {
    return assertTransitionAllowed(null, fromStatus, toStatus);
  }
  const wf = await WorkflowDefinition.findById(board.workflowId).lean();
  if (!isWorkflowEngineV2Enabled()) {
    return assertTransitionAllowed(wf, fromStatus, toStatus);
  }
  return evaluateTransition({
    workflow: wf,
    fromStatus,
    toStatus,
    card: opts.card || {},
    actorPermissions: opts.actorPermissions || [],
    actorProjectRoleKeys: opts.actorProjectRoleKeys || [],
    isElevated: Boolean(opts.isElevated),
  });
}

/**
 * Resolve statusKey for a list (statusKey field or infer from title).
 */
function resolveListStatusKey(list) {
  if (!list) return '';
  const keyed = String(list.statusKey || '').trim();
  if (keyed) return keyed;
  return inferStatusKeyFromTitle(list.title);
}

/**
 * Allowed toKeys from a status for FE drag hints.
 */
function allowedTransitionsFrom(workflow, fromStatus) {
  const from = String(fromStatus || '').trim();
  if (!workflow?.transitions?.length) return [];
  return (workflow.transitions || [])
    .filter((t) => String(t.fromKey) === from)
    .map((t) => ({
      toKey: t.toKey,
      name: t.name || `${from}→${t.toKey}`,
      requiredPermission: t.requiredPermission || '',
    }));
}

async function loadBoardWorkflowLean(board) {
  if (!board?.workflowId) return null;
  return WorkflowDefinition.findById(board.workflowId).lean();
}

module.exports = {
  LEGACY_STATUSES,
  DEFAULT_STATES,
  DEFAULT_TRANSITIONS,
  isWorkflowEngineV2Enabled,
  getWorkflow,
  upsertWorkflow,
  seedDefaultWorkflow,
  assertTransitionAllowed,
  assertCanTransition,
  evaluateTransition,
  requireBoardAdmin,
  ensureOrgWorkflowTemplates,
  listWorkflowTemplates,
  getWorkflowTemplate,
  upsertWorkflowTemplate,
  applyTemplateToBoard,
  applyTemplateToProject,
  syncBoardListsFromWorkflow,
  resolveListStatusKey,
  allowedTransitionsFrom,
  loadBoardWorkflowLean,
  inferStatusKeyFromTitle,
};
