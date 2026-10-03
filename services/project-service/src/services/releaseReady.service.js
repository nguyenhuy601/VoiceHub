const mongoose = require('../db');
const Project = require('../models/Project');
const TestCase = require('../models/TestCase');
const Task = require('../models/Task');
const Sprint = require('../models/Sprint');
const TaskBoardList = require('../models/TaskBoardList');
const ChangeRequest = require('../models/ChangeRequest');
const { assertUserProjectPermission } = require('./projectAccess.service');
const { assertProjectWritable } = require('../utils/project/projectCloseGate');
const { evaluateReleaseReady } = require('../utils/work/evaluateReleaseReady');
const { evaluateReadyToDone } = require('../utils/work/evaluateReadyToDone');
const { isDoneListTitle } = require('./boardCapabilities');
const { appendFieldChanges } = require('./workHistory.service');
const { coerceDeliveryPhase } = require('../constants/projectDeliveryPhase');

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

function conflict(message, errorCode = 'RELEASE_READY_NOT_READY') {
  const err = new Error(message);
  err.statusCode = 409;
  err.errorCode = errorCode;
  return err;
}

async function loadOpenBugCount(projectId) {
  const bugs = await Task.find({
    projectId,
    issueType: 'bug',
    isActive: true,
  })
    .select('_id listId')
    .lean();
  if (!bugs.length) return 0;
  const listIds = [...new Set(bugs.map((b) => String(b.listId || '')).filter(Boolean))];
  const lists = listIds.length
    ? await TaskBoardList.find({ _id: { $in: listIds } }).select('_id title').lean()
    : [];
  const doneListIds = new Set(
    lists.filter((l) => isDoneListTitle(l.title)).map((l) => String(l._id))
  );
  return bugs.filter((b) => !doneListIds.has(String(b.listId || ''))).length;
}

async function loadSprintCardsWithTc(projectId, linkedTestCases) {
  const byWork = new Map();
  for (const tc of linkedTestCases || []) {
    const wid = String(tc.workItemId || '');
    if (!wid) continue;
    if (!byWork.has(wid)) byWork.set(wid, []);
    byWork.get(wid).push(tc);
  }
  if (!byWork.size) return [];

  const activeSprint = await Sprint.findOne({ projectId, status: 'active' })
    .select('_id')
    .lean();
  if (!activeSprint) return [];

  const workIds = [...byWork.keys()].filter((id) => validOid(id));
  const cards = await Task.find({
    projectId,
    _id: { $in: workIds },
    sprintId: activeSprint._id,
    isActive: true,
  })
    .select('_id listId')
    .lean();

  const listIds = [...new Set(cards.map((c) => String(c.listId || '')).filter(Boolean))];
  const lists = listIds.length
    ? await TaskBoardList.find({ _id: { $in: listIds } }).select('_id title').lean()
    : [];
  const doneListIds = new Set(
    lists.filter((l) => isDoneListTitle(l.title)).map((l) => String(l._id))
  );

  // Open bugs for ready-to-done per card (sourceTestCaseId in that card's TCs)
  const allTcIds = linkedTestCases.map((tc) => tc._id).filter((id) => validOid(id));
  const bugs = allTcIds.length
    ? await Task.find({
        projectId,
        issueType: 'bug',
        isActive: true,
        sourceTestCaseId: { $in: allTcIds },
      })
        .select('_id listId sourceTestCaseId')
        .lean()
    : [];
  const bugListIds = [...new Set(bugs.map((b) => String(b.listId || '')).filter(Boolean))];
  const bugLists = bugListIds.length
    ? await TaskBoardList.find({ _id: { $in: bugListIds } }).select('_id title').lean()
    : [];
  const bugDoneLists = new Set(
    bugLists.filter((l) => isDoneListTitle(l.title)).map((l) => String(l._id))
  );
  const passedTcIds = new Set(
    linkedTestCases
      .filter((tc) => String(tc.lastResult || '').trim().toLowerCase() === 'pass')
      .map((tc) => String(tc._id))
  );
  const openBugs = bugs.filter((b) => {
    if (bugDoneLists.has(String(b.listId || ''))) return false;
    if (passedTcIds.has(String(b.sourceTestCaseId || ''))) return false;
    return true;
  });

  return cards.map((card) => {
    const id = String(card._id);
    const tcs = byWork.get(id) || [];
    const tcIdSet = new Set(tcs.map((t) => String(t._id)));
    const cardOpenBugs = openBugs.filter((b) => tcIdSet.has(String(b.sourceTestCaseId)));
    const evalCard = evaluateReadyToDone({ testCases: tcs, openBugs: cardOpenBugs });
    return {
      id,
      isDone: doneListIds.has(String(card.listId || '')),
      readyToDone: Boolean(evalCard.ready),
    };
  });
}

function projectGateSnapshot(project) {
  return {
    releaseReadyStatus: String(project.releaseReadyStatus || 'none'),
    releaseReadyAt: project.releaseReadyAt || null,
    releaseReadyBy: project.releaseReadyBy ? String(project.releaseReadyBy) : null,
    uatStatus: String(project.uatStatus || 'none'),
    uatSignedAt: project.uatSignedAt || null,
    uatSignedBy: project.uatSignedBy ? String(project.uatSignedBy) : null,
    uatNote: project.uatNote || null,
  };
}

async function buildEvaluation(project) {
  const projectId = project._id;
  const linkedTestCases = await TestCase.find({
    projectId,
    isActive: true,
    workItemId: { $ne: null },
  }).lean();

  const openBugCount = await loadOpenBugCount(projectId);
  const pendingCrCount = await ChangeRequest.countDocuments({
    projectId,
    status: 'approved',
  });
  const sprintCardsWithTc = await loadSprintCardsWithTc(projectId, linkedTestCases);

  const evaluation = evaluateReleaseReady({
    deliveryPhase: coerceDeliveryPhase(project.deliveryPhase),
    openBugCount,
    linkedTestCases,
    sprintCardsWithTc,
    pendingCrCount,
  });

  return {
    ...evaluation,
    ...projectGateSnapshot(project),
  };
}

async function getReleaseReady({ userId, projectId }) {
  await assertUserProjectPermission({
    userId,
    projectId,
    permission: 'project:view',
    message: 'Không có quyền xem project',
  });
  const project = await Project.findById(projectId);
  if (!project) throw notFound('Project không tồn tại');
  return buildEvaluation(project);
}

async function confirmReleaseReady({ userId, projectId }) {
  const resolved = await assertUserProjectPermission({
    userId,
    projectId,
    permission: 'delivery_phase:change',
    message: 'Không có quyền xác nhận Release Ready (delivery_phase:change)',
  });
  assertProjectWritable(resolved.project);

  const project = await Project.findById(projectId);
  if (!project) throw notFound('Project không tồn tại');

  if (String(project.releaseReadyStatus || 'none') === 'confirmed') {
    throw conflict('Release Ready đã được xác nhận', 'RELEASE_READY_ALREADY_CONFIRMED');
  }

  const evaluation = await buildEvaluation(project);
  if (!evaluation.ready) {
    throw conflict(
      `Chưa sẵn sàng Release (${evaluation.reason || 'not_ready'})`,
      'RELEASE_READY_NOT_READY'
    );
  }

  project.releaseReadyStatus = 'confirmed';
  project.releaseReadyAt = new Date();
  project.releaseReadyBy = userId;
  // Reset UAT when re-confirming path first time only — first confirm
  if (String(project.uatStatus || 'none') === 'none') {
    /* keep */
  }
  project.releaseReadyNotifiedAt = null;
  await project.save();

  try {
    await appendFieldChanges({
      organizationId: project.organizationId,
      projectId,
      actorId: userId,
      changes: [
        {
          field: 'release_ready_confirmed',
          from: 'none',
          to: 'confirmed',
        },
      ],
    });
  } catch {
    /* best-effort */
  }

  // Plan C — UAT request notify (non-blocking)
  try {
    const { notifyUatRequested } = require('../utils/work/deliveryNotify');
    await notifyUatRequested({ actorId: userId, project });
  } catch {
    /* never fail Confirm */
  }

  return {
    ...evaluation,
    ...projectGateSnapshot(project),
    ready: true,
  };
}

async function signOffUat({ userId, projectId, result, note }) {
  const resolved = await assertUserProjectPermission({
    userId,
    projectId,
    permission: 'uat:sign_off',
    message: 'Không có quyền UAT sign-off (uat:sign_off)',
  });
  assertProjectWritable(resolved.project);

  const project = await Project.findById(projectId);
  if (!project) throw notFound('Project không tồn tại');

  if (String(project.releaseReadyStatus || 'none') !== 'confirmed') {
    throw conflict('Cần Confirm Release Ready trước khi UAT', 'UAT_REQUIRES_RELEASE_READY');
  }

  const normalized = String(result || '')
    .trim()
    .toLowerCase();
  if (normalized !== 'pass' && normalized !== 'fail') {
    throw badRequest('result phải là pass hoặc fail');
  }

  if (String(project.uatStatus || 'none') === 'pass') {
    throw conflict('UAT đã Pass — không ký lại', 'UAT_ALREADY_PASSED');
  }

  const prev = String(project.uatStatus || 'none');
  project.uatStatus = normalized;
  project.uatSignedAt = new Date();
  project.uatSignedBy = userId;
  project.uatNote = String(note || '').trim().slice(0, 2000);
  await project.save();

  try {
    await appendFieldChanges({
      organizationId: project.organizationId,
      projectId,
      actorId: userId,
      changes: [
        {
          field: 'uat_signed_off',
          from: prev,
          to: normalized,
        },
      ],
    });
  } catch {
    /* best-effort */
  }

  const evaluation = await buildEvaluation(project);
  return evaluation;
}

module.exports = {
  getReleaseReady,
  confirmReleaseReady,
  signOffUat,
  buildEvaluation,
};
