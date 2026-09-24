const mongoose = require('../db');
const TestCase = require('../models/TestCase');
const Task = require('../models/Task');
const TaskBoard = require('../models/TaskBoard');
const TaskBoardList = require('../models/TaskBoardList');
const Sprint = require('../models/Sprint');
const {
  assertUserProjectPermission,
  assertUserAnyProjectPermission,
} = require('./projectAccess.service');
const { assertProjectWritable } = require('../utils/project/projectCloseGate');
const {
  normalizeTestCaseStatus,
  assertTestCaseResult,
} = require('../utils/work/testCaseTypes');

const CODE_RETRY_MAX = 5;

function validOid(value) {
  return mongoose.isValidObjectId(String(value || ''));
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function notFound(message) {
  const err = new Error(message);
  err.statusCode = 404;
  return err;
}

function conflict(message, errorCode = 'WORK_ITEM_DONE') {
  const err = new Error(message);
  err.statusCode = 409;
  err.errorCode = errorCode;
  return err;
}

/**
 * Block Pass/Fail / open-bug when linked card is already in Done.
 */
async function assertWorkItemAllowsExecution(projectId, workItemId) {
  const wid = String(workItemId || '').trim();
  if (!wid || !validOid(wid)) return;
  const task = await Task.findOne({ _id: wid, projectId, isActive: true })
    .select('_id listId status')
    .lean();
  if (!task) return;
  const { isDoneListTitle, isReadyForQaListTitle } = require('./boardCapabilities');

  // Board column is SoT — stale task.status=done after drag back to QA must not lock.
  if (task.listId) {
    const list = await TaskBoardList.findById(task.listId).select('title statusKey').lean();
    const listTitle = list?.title || '';
    const statusKey = String(list?.statusKey || '')
      .trim()
      .toLowerCase();
    if (
      statusKey === 'qa' ||
      statusKey === 'review' ||
      isReadyForQaListTitle(listTitle)
    ) {
      return;
    }
    if (statusKey === 'done' || statusKey === 'completed' || isDoneListTitle(listTitle)) {
      throw conflict(
        'Card đã Done — không ghi lại Pass/Fail hay mở bug từ test case. Kéo card khỏi Done nếu cần retest.',
        'WORK_ITEM_DONE'
      );
    }
    return;
  }

  const status = String(task.status || '')
    .trim()
    .toLowerCase();
  if (status === 'done' || status === 'completed') {
    throw conflict(
      'Card đã Done — không ghi lại Pass/Fail hay mở bug từ test case. Kéo card khỏi Done nếu cần retest.',
      'WORK_ITEM_DONE'
    );
  }
}

/**
 * Place open-bug on the project board so it appears in Sprint Board (not orphan backlog).
 * Prefer To Do list + active sprint when available.
 */
async function resolveBoardPlacement(projectId) {
  const board = await TaskBoard.findOne({ projectId, isActive: true }).sort({ createdAt: 1 }).lean();
  if (!board?._id) {
    return { boardId: null, listId: null, sprintId: null, position: 1000 };
  }
  const lists = await TaskBoardList.find({ boardId: board._id, isArchived: false })
    .sort({ order: 1 })
    .lean();
  const todo =
    lists.find((l) => /^to\s*do$/i.test(String(l.title || ''))) ||
    lists.find((l) => /backlog|todo|cần làm|chưa làm/i.test(String(l.title || ''))) ||
    lists[0];
  const listId = todo?._id || null;
  const activeSprint = await Sprint.findOne({
    projectId,
    boardId: board._id,
    status: 'active',
  })
    .sort({ updatedAt: -1 })
    .lean();
  let position = 1000;
  if (listId) {
    const last = await Task.findOne({ boardId: board._id, listId, isActive: true })
      .sort({ position: -1 })
      .select('position')
      .lean();
    position = (Number(last?.position) || 0) + 1000;
  }
  return {
    boardId: board._id,
    listId,
    sprintId: activeSprint?._id || null,
    position,
  };
}

function isTodoList(list) {
  if (!list) return false;
  const statusKey = String(list.statusKey || '')
    .trim()
    .toLowerCase();
  if (statusKey === 'todo' || statusKey === 'backlog') return true;
  const title = String(list.title || '')
    .trim()
    .toLowerCase();
  return /^to\s*do$/i.test(title) || /backlog|cần làm|chua lam|chưa làm/i.test(title);
}

/**
 * Open-bug HITL → kéo card gắn về To Do + ghi chú TC/bug (không qua moveCard RBAC —
 * QA có quyền open-bug nhưng có thể thiếu canMoveCards trên board).
 * @returns {Promise<object|null>} card sau move, hoặc null nếu không move
 */
async function maybeMoveWorkItemToTodoOnFail({
  userId,
  projectId,
  workItemId,
  testCaseCode = '',
  testCaseTitle = '',
  extraNote = '',
  bugTitle = '',
}) {
  const wid = String(workItemId || '').trim();
  if (!wid || !validOid(wid)) return null;

  const task = await Task.findOne({ _id: wid, projectId, isActive: true });
  if (!task?.boardId || !task.listId) return null;

  const lists = await TaskBoardList.find({
    boardId: task.boardId,
    isArchived: false,
  })
    .sort({ order: 1 })
    .lean();
  if (!lists.length) return null;

  const current = lists.find((l) => String(l._id) === String(task.listId));
  const { isDoneListTitle } = require('./boardCapabilities');
  if (
    isDoneListTitle(current?.title) ||
    String(current?.statusKey || '').toLowerCase() === 'done' ||
    String(current?.statusKey || '').toLowerCase() === 'completed'
  ) {
    return null;
  }

  const todo =
    lists.find((l) => isTodoList(l)) ||
    lists.find((l) => /^to\s*do$/i.test(String(l.title || ''))) ||
    lists[0];
  if (!todo?._id) return null;

  const alreadyTodo = String(task.listId) === String(todo._id);
  const before = { listId: task.listId, status: task.status };
  const bugLabel = String(bugTitle || '').trim();
  const tcCode = String(testCaseCode || '').trim();
  const tcTitle = String(testCaseTitle || '').trim();
  // Short face note — avoid duplicate «Bug: … | Đã mở bug: …».
  let note = 'QA Fail — card về To Do để sửa.';
  if (bugLabel) {
    note = `QA mở bug · ${bugLabel}`;
  } else if (tcCode || tcTitle) {
    note = `QA Fail · ${[tcCode, tcTitle].filter(Boolean).join(' — ')}`;
  }
  const extra = String(extraNote || '').trim();
  if (extra && !note.includes(extra) && !bugLabel.includes(extra.replace(/^Đã mở bug:\s*/i, ''))) {
    note = `${note} · ${extra}`.slice(0, 500);
  } else {
    note = note.slice(0, 500);
  }

  if (!alreadyTodo) {
    task.listId = todo._id;
    const todoKey = String(todo.statusKey || '').trim();
    if (todoKey) task.status = todoKey;
    else if (String(task.status || '').toLowerCase() === 'done') task.status = 'todo';
    task.completedAt = null;
  }

  // Visible on board card face (comments alone are easy to miss in Kanban).
  task.qaReworkNote = note;
  if (!Array.isArray(task.comments)) task.comments = [];
  task.comments.push({
    userId: validOid(userId) ? userId : undefined,
    content: note,
    createdAt: new Date(),
  });
  await task.save();

  if (!alreadyTodo && projectId) {
    try {
      const { diffTaskFields } = require('../utils/work/workHistoryDiff');
      const { appendFieldChanges } = require('./workHistory.service');
      void appendFieldChanges({
        organizationId: task.organizationId,
        projectId,
        boardId: task.boardId,
        taskId: wid,
        actorId: userId,
        changes: diffTaskFields(before, { listId: task.listId, status: task.status }),
      });
    } catch {
      /* best-effort history */
    }
  }

  return task.toObject();
}

async function assertTestCasePermission({ userId, projectId, write = false, bugOnly = false }) {
  const resolved = bugOnly
    ? await assertUserProjectPermission({
        userId,
        projectId,
        permission: 'bug:create',
        message: 'Không có quyền tạo bug từ test case',
      })
    : await assertUserAnyProjectPermission({
        userId,
        projectId,
        permissions: write
          ? ['task:create', 'task:update', 'bug:create']
          : ['task:view'],
        message: write
          ? 'Không có quyền cập nhật test case'
          : 'Không có quyền xem test case',
      });
  if (write || bugOnly) assertProjectWritable(resolved.project);
  return resolved.project;
}

async function loadTestCase(projectId, testCaseId) {
  if (!validOid(testCaseId)) throw badRequest('testCaseId không hợp lệ');
  const item = await TestCase.findOne({
    _id: testCaseId,
    projectId,
    isActive: true,
  });
  if (!item) throw notFound('Test case không tồn tại');
  return item;
}

async function listTestCases({ userId, projectId }) {
  await assertTestCasePermission({ userId, projectId });
  const rows = await TestCase.find({ projectId, isActive: true }).sort({ createdAt: -1 }).lean();
  return enrichTestCasesWithBugRetestCue(projectId, rows);
}

async function enrichTestCasesWithBugRetestCue(projectId, rows) {
  const { isDoneListTitle, isReadyForQaListTitle } = require('./boardCapabilities');
  const { resolveTestCaseRetestCue } = require('../utils/work/resolveTestCaseRetestCue');
  const list = Array.isArray(rows) ? rows : [];
  const bugIds = [
    ...new Set(list.map((r) => String(r.linkedBugId || '').trim()).filter((id) => validOid(id))),
  ];
  const parentIds = [
    ...new Set(list.map((r) => String(r.workItemId || '').trim()).filter((id) => validOid(id))),
  ];

  if (!bugIds.length) {
    return list.map((r) => ({
      ...r,
      ...resolveTestCaseRetestCue({ lastResult: r.lastResult, hasLinkedBug: false }),
    }));
  }

  const TaskBoardList = require('../models/TaskBoardList');
  const bugs = await Task.find({ _id: { $in: bugIds }, projectId, isActive: true })
    .select('_id title listId retestStatus')
    .lean();
  const parents = parentIds.length
    ? await Task.find({ _id: { $in: parentIds }, projectId, isActive: true })
        .select('_id listId')
        .lean()
    : [];

  const listIds = [
    ...new Set(
      [...bugs, ...parents]
        .map((b) => String(b.listId || ''))
        .filter(Boolean)
    ),
  ];
  const lists = listIds.length
    ? await TaskBoardList.find({ _id: { $in: listIds } }).select('_id title statusKey').lean()
    : [];
  const listById = new Map(lists.map((l) => [String(l._id), l]));
  const bugById = new Map(bugs.map((b) => [String(b._id), b]));
  const parentById = new Map(parents.map((p) => [String(p._id), p]));

  const isListDone = (bl) => {
    if (!bl) return false;
    const statusKey = String(bl.statusKey || '')
      .trim()
      .toLowerCase();
    return (
      statusKey === 'done' ||
      statusKey === 'completed' ||
      isDoneListTitle(bl.title)
    );
  };
  const isListReadyForQa = (bl) => {
    if (!bl) return false;
    const statusKey = String(bl.statusKey || '')
      .trim()
      .toLowerCase();
    return (
      statusKey === 'qa' ||
      statusKey === 'review' ||
      isReadyForQaListTitle(bl.title)
    );
  };

  return list.map((r) => {
    const bid = String(r.linkedBugId || '');
    const bug = bugById.get(bid);
    if (!bug) {
      return {
        ...r,
        ...resolveTestCaseRetestCue({ lastResult: r.lastResult, hasLinkedBug: false }),
      };
    }
    const bugList = listById.get(String(bug.listId || ''));
    const parent = parentById.get(String(r.workItemId || ''));
    const parentList = parent ? listById.get(String(parent.listId || '')) : null;
    const cue = resolveTestCaseRetestCue({
      lastResult: r.lastResult,
      hasLinkedBug: true,
      linkedBugDone: isListDone(bugList),
      parentReadyForQa: isListReadyForQa(parentList),
    });
    return {
      ...r,
      linkedBugTitle: String(bug.title || '').trim() || undefined,
      linkedBugRetestStatus: bug.retestStatus || null,
      ...cue,
    };
  });
}

async function getTestCase({ userId, projectId, testCaseId }) {
  await assertTestCasePermission({ userId, projectId });
  const item = await loadTestCase(projectId, testCaseId);
  const [enriched] = await enrichTestCasesWithBugRetestCue(projectId, [item.toObject()]);
  return enriched;
}

async function assertWorkItemInProject(projectId, workItemId) {
  // Catalog TCs (from UC) may omit workItemId until linked on QA board.
  if (workItemId == null || workItemId === '') return null;
  if (!validOid(workItemId)) throw badRequest('workItemId không hợp lệ');
  const task = await Task.findOne({ _id: workItemId, projectId, isActive: true })
    .select('_id')
    .lean();
  if (!task) throw badRequest('workItem không thuộc project hoặc không tồn tại');
  return task._id;
}

async function createTestCase({
  userId,
  projectId,
  title,
  externalKey,
  sourceUcKey,
  status,
  workItemId,
}) {
  const project = await assertTestCasePermission({ userId, projectId, write: true });
  const normalizedTitle = String(title || '').trim();
  if (!normalizedTitle) throw badRequest('title là bắt buộc');
  const normalizedStatus = normalizeTestCaseStatus(status, 'draft');
  if (!normalizedStatus) throw badRequest('status không hợp lệ');
  if (!validOid(userId)) throw badRequest('userId không hợp lệ');
  const linkedWorkItemId = await assertWorkItemInProject(projectId, workItemId);
  const ucKey = String(sourceUcKey || externalKey || '')
    .trim()
    .slice(0, 64);

  let lastError;
  for (let attempt = 0; attempt < CODE_RETRY_MAX; attempt += 1) {
    const total = await TestCase.countDocuments({ projectId });
    try {
      return await TestCase.create({
        organizationId: project.organizationId,
        projectId,
        code: `TC-${total + attempt + 1}`,
        title: normalizedTitle,
        externalKey: String(externalKey || '').trim(),
        sourceUcKey: ucKey,
        status: normalizedStatus,
        workItemId: linkedWorkItemId,
        createdBy: userId,
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      lastError = err;
    }
  }
  const err = new Error('Không tạo được mã Test Case');
  err.statusCode = 409;
  err.cause = lastError;
  throw err;
}

async function patchTestCase({ userId, projectId, testCaseId, patch = {} }) {
  await assertTestCasePermission({ userId, projectId, write: true });
  const item = await loadTestCase(projectId, testCaseId);
  if (patch.title !== undefined) {
    const title = String(patch.title || '').trim();
    if (!title) throw badRequest('title là bắt buộc');
    item.title = title;
  }
  if (patch.externalKey !== undefined) {
    item.externalKey = String(patch.externalKey || '').trim();
  }
  if (patch.sourceUcKey !== undefined) {
    item.sourceUcKey = String(patch.sourceUcKey || '').trim().slice(0, 64);
  }
  if (patch.status !== undefined) {
    const status = normalizeTestCaseStatus(patch.status);
    if (!status) throw badRequest('status không hợp lệ');
    item.status = status;
  }
  if (patch.workItemId !== undefined) {
    item.workItemId = await assertWorkItemInProject(projectId, patch.workItemId);
  }
  // Reset Pass/Fail (+ unlink bug) để QA retest — không xóa bug task trên Board.
  if (patch.resetExecution === true) {
    item.lastResult = null;
    item.lastExecutedAt = null;
    item.lastExecutedBy = null;
    item.linkedBugId = null;
  }
  await item.save();
  const out = item.toObject();
  if (
    item.workItemId &&
    (patch.status !== undefined ||
      patch.workItemId !== undefined ||
      patch.resetExecution === true)
  ) {
    const { scheduleDeliveryNotify, maybeNotifyReadyToDoneProposed, maybeNotifyReleaseReadyProposed } =
      require('../utils/work/deliveryNotify');
    const workItemId = String(item.workItemId);
    scheduleDeliveryNotify(async () => {
      await maybeNotifyReadyToDoneProposed({
        actorId: userId,
        projectId,
        organizationId: item.organizationId,
        taskId: workItemId,
      });
      await maybeNotifyReleaseReadyProposed({ actorId: userId, projectId });
    });
  }
  return out;
}

async function executeTestCase({ userId, projectId, testCaseId, result }) {
  await assertTestCasePermission({ userId, projectId, write: true });
  const item = await loadTestCase(projectId, testCaseId);
  await assertWorkItemAllowsExecution(projectId, item.workItemId);
  const normalized = assertTestCaseResult(result);
  item.lastResult = normalized;
  item.lastExecutedAt = new Date();
  item.lastExecutedBy = validOid(userId) ? userId : null;
  await item.save();
  const out = item.toObject();

  // Sync linked bug: retest stamp + auto Done when Pass (unblock Confirm Done / Subtasks).
  if (item.linkedBugId && validOid(item.linkedBugId)) {
    const { isDoneListTitle } = require('./boardCapabilities');
    const bug = await Task.findOne({
      _id: item.linkedBugId,
      projectId,
      isActive: true,
      issueType: 'bug',
    });
    if (bug) {
      bug.retestStatus = normalized === 'pass' ? 'passed' : 'failed';
      if (normalized === 'pass' && bug.boardId) {
        const lists = await TaskBoardList.find({
          boardId: bug.boardId,
          isArchived: false,
        })
          .select('_id title statusKey')
          .lean();
        const doneList = lists.find((l) => {
          const sk = String(l.statusKey || '')
            .trim()
            .toLowerCase();
          return sk === 'done' || sk === 'completed' || isDoneListTitle(l.title);
        });
        if (doneList && String(bug.listId) !== String(doneList._id)) {
          bug.listId = doneList._id;
          bug.status = 'done';
          bug.completedAt = bug.completedAt || new Date();
        }
      }
      await bug.save();
      out.linkedBugRetestStatus = bug.retestStatus;
      out.linkedBugDone = normalized === 'pass';
    }
  }

  // DEC Phase 3: Fail chỉ ghi kết quả HITL. Kéo card + note + tạo bug = nút «Mở bug».
  const workItemMoved = null;

  // Plan C — notify when Ready-to-Done / Release Ready flips (fire-and-forget)
  if (item.workItemId) {
    const { scheduleDeliveryNotify, maybeNotifyReadyToDoneProposed, maybeNotifyReleaseReadyProposed } =
      require('../utils/work/deliveryNotify');
    const workItemId = String(item.workItemId);
    scheduleDeliveryNotify(async () => {
      await maybeNotifyReadyToDoneProposed({
        actorId: userId,
        projectId,
        organizationId: item.organizationId,
        taskId: workItemId,
      });
      await maybeNotifyReleaseReadyProposed({ actorId: userId, projectId });
    });
  }
  return { testCase: (await enrichTestCasesWithBugRetestCue(projectId, [out]))[0], workItemMoved };
}

async function openBugFromTestCase({ userId, projectId, testCaseId }) {
  const project = await assertTestCasePermission({
    userId,
    projectId,
    write: true,
    bugOnly: true,
  });
  const item = await loadTestCase(projectId, testCaseId);
  await assertWorkItemAllowsExecution(projectId, item.workItemId);
  if (item.linkedBugId) {
    const err = new Error('Test case đã liên kết với bug');
    err.statusCode = 409;
    throw err;
  }

  // Bug gắn dưới card FR; tên bug = mã + tiêu đề TC (không copy tên FR).
  let parentTitle = '';
  const workItemId = item.workItemId ? String(item.workItemId) : '';
  if (workItemId && validOid(workItemId)) {
    const parent = await Task.findOne({ _id: workItemId, projectId, isActive: true })
      .select('title')
      .lean();
    parentTitle = String(parent?.title || '').trim();
  }
  const shortParent = parentTitle
    .replace(/\s*[—–-]\s*(Ready for QA|To Do|In Progress|Done)\s*$/i, '')
    .trim()
    .slice(0, 60);
  const tcCode = String(item.code || '').trim() || 'TC';
  const tcTitle = String(item.title || '').trim() || 'Không có tiêu đề';
  const bugTitle = `[Bug] ${tcCode}: ${tcTitle}`.slice(0, 180);
  const bugDescription = [
    `Phát hiện từ test case ${tcCode} — ${tcTitle}.`,
    shortParent ? `Card gốc: ${shortParent}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const placement = await resolveBoardPlacement(projectId);
  const bug = await Task.create({
    organizationId: project.organizationId,
    projectId,
    boardId: placement.boardId,
    listId: placement.listId,
    sprintId: placement.sprintId,
    position: placement.position,
    title: bugTitle,
    description: bugDescription,
    issueType: 'bug',
    sourceTestCaseId: item._id,
    parentTaskId: workItemId && validOid(workItemId) ? workItemId : null,
    retestStatus: 'pending',
    createdBy: userId,
    isActive: true,
  });
  item.linkedBugId = bug._id;
  await item.save();

  // Đảm bảo card gốc cũng về To Do + ghi chú (nếu còn ở QA).
  let workItemMoved = null;
  if (workItemId) {
    workItemMoved = await maybeMoveWorkItemToTodoOnFail({
      userId,
      projectId,
      workItemId,
      testCaseCode: tcCode,
      testCaseTitle: tcTitle,
      bugTitle,
    });
  }

  return {
    testCase: item.toObject(),
    bug: bug.toObject(),
    workItemMoved,
  };
}

/**
 * HITL suggestions: one draft TC per approved UC (externalKey = UC key).
 * Skips UCs that already have an active TC with same externalKey.
 */
async function suggestTestCasesFromUseCases({ userId, projectId }) {
  await assertTestCasePermission({ userId, projectId });
  let AnalysisArtifact;
  try {
    AnalysisArtifact = require('../models/AnalysisArtifact');
  } catch {
    return { suggestions: [], message: 'AnalysisArtifact unavailable' };
  }
  const [ucs, existing] = await Promise.all([
    AnalysisArtifact.find({
      projectId,
      kind: 'UC',
      status: 'approved',
      isActive: true,
    })
      .select('externalKey title summary structured')
      .sort({ externalKey: 1 })
      .limit(80)
      .lean(),
    TestCase.find({ projectId, isActive: true }).select('externalKey').lean(),
  ]);
  const taken = new Set(
    existing.map((r) => String(r.externalKey || '').trim()).filter(Boolean)
  );
  const suggestions = [];
  for (const uc of ucs) {
    const externalKey = String(uc.externalKey || '').trim().slice(0, 64);
    if (!externalKey || taken.has(externalKey)) continue;
    const structured = uc.structured && typeof uc.structured === 'object' ? uc.structured : {};
    const mainFlow = String(structured.mainFlow || structured.basicFlow || '').trim();
    const acceptance = String(
      structured.acceptanceCriteria || structured.postcondition || ''
    ).trim();
    suggestions.push({
      title: `TC: ${String(uc.title || externalKey).trim()}`.slice(0, 240),
      externalKey,
      status: 'draft',
      sourceUcId: String(uc._id),
      sourceUcKey: externalKey,
      summary: String(uc.summary || '').slice(0, 500),
      mainFlow: mainFlow.slice(0, 1000),
      acceptanceCriteria: acceptance.slice(0, 1000),
      reason: 'heuristic_from_uc',
    });
  }
  return {
    suggestions,
    message:
      suggestions.length > 0
        ? `Gợi ý ${suggestions.length} TC từ UC approved — chọn rồi tạo (HITL)`
        : 'Không có UC approved mới để sinh TC (đã có TC cùng externalKey hoặc chưa duyệt UC)',
  };
}

/**
 * Create selected TC suggestions (from UC). Idempotent on externalKey.
 */
async function createTestCasesFromSuggestions({ userId, projectId, suggestions = [] }) {
  await assertTestCasePermission({ userId, projectId, write: true });
  const list = Array.isArray(suggestions) ? suggestions : [];
  const created = [];
  const skipped = [];
  for (const s of list.slice(0, 50)) {
    const externalKey = String(s.externalKey || s.sourceUcKey || '').trim().slice(0, 64);
    const title = String(s.title || '').trim().slice(0, 240);
    if (!title || !externalKey) {
      skipped.push({ externalKey, message: 'title/externalKey bắt buộc' });
      continue;
    }
    const exists = await TestCase.findOne({
      projectId,
      isActive: true,
      externalKey,
    })
      .select('_id')
      .lean();
    if (exists) {
      skipped.push({ externalKey, message: 'TC đã tồn tại', errorCode: 'TC_DUP_KEY' });
      continue;
    }
    try {
      const row = await createTestCase({
        userId,
        projectId,
        title,
        externalKey,
        sourceUcKey: externalKey,
        status: 'draft',
      });
      created.push(row.toObject ? row.toObject() : row);
    } catch (e) {
      skipped.push({
        externalKey,
        message: e.message || 'skip',
        errorCode: e.errorCode || e.code,
      });
    }
  }
  return { created: created.length, skipped, items: created };
}

module.exports = {
  listTestCases,
  getTestCase,
  createTestCase,
  patchTestCase,
  executeTestCase,
  openBugFromTestCase,
  suggestTestCasesFromUseCases,
  createTestCasesFromSuggestions,
};
