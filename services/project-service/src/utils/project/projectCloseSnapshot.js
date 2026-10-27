/**
 * Project close snapshot (7 nhóm P1) — pure, không ghi DB.
 * Field P2 thiếu schema → null + unavailableReason.
 */

const { isDoneFromTask, normalizeEstimateHours } = require('../task/sprintCloseClassify');
const { asStringOid } = require('./projectCloseGate');

const SNAPSHOT_SCHEMA_VERSION = 1;
const MS_PER_HOUR = 3600000;
const MS_PER_DAY = 86400000;

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toIso(value) {
  const d = toDate(value);
  return d ? d.toISOString() : null;
}

function daysBetween(later, earlier) {
  const a = toDate(later);
  const b = toDate(earlier);
  if (!a || !b) return null;
  return Math.round((a.getTime() - b.getTime()) / MS_PER_DAY);
}

function hoursBetween(later, earlier) {
  const a = toDate(later);
  const b = toDate(earlier);
  if (!a || !b) return null;
  const n = (a.getTime() - b.getTime()) / MS_PER_HOUR;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function average(nums) {
  const list = (nums || []).filter((n) => Number.isFinite(n));
  if (!list.length) return null;
  const sum = list.reduce((acc, n) => acc + n, 0);
  return Math.round((sum / list.length) * 100) / 100;
}

function median(nums) {
  const list = (nums || []).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  const v = list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
  return Math.round(v * 100) / 100;
}

function unavailable(reason) {
  return { value: null, unavailableReason: String(reason || 'unavailable') };
}

function isDoneLikeStatus(value) {
  const s = String(value || '')
    .trim()
    .toLowerCase();
  return s === 'done' || s === 'completed' || s.includes('done') || s.includes('complete');
}

function issueTypeOf(task) {
  const t = String(task?.issueType || task?.type || 'task')
    .trim()
    .toLowerCase();
  if (t === 'bug' || t === 'story') return t;
  return 'task';
}

function countByKey(rows, keyFn) {
  const out = {};
  for (const row of rows || []) {
    const key = String(keyFn(row) || '').trim() || 'unknown';
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function listMetaForTask(task, listsById) {
  const listId = asStringOid(task?.listId);
  return listId && listsById ? listsById[listId] || null : null;
}

function isTaskDone(task, listsById) {
  return isDoneFromTask(task, listMetaForTask(task, listsById));
}

function buildSprintRows(sprints = []) {
  return (sprints || []).map((s) => {
    const snap = s?.closureSnapshot && typeof s.closureSnapshot === 'object' ? s.closureSnapshot : {};
    return {
      sprintId: asStringOid(s?._id || s?.id),
      name: String(s?.name || '').trim(),
      status: String(s?.status || '').trim(),
      startDate: toIso(s?.startDate),
      endDate: toIso(s?.endDate),
      closedAt: toIso(s?.closedAt),
      committedHours: Number(snap.committedHours) || 0,
      completedHours: Number(snap.completedHours) || 0,
      velocityHours: Number(snap.completedHours) || 0,
      doneCount: Number(snap.doneCount) || 0,
      incompleteCount: Number(snap.incompleteCount) || 0,
    };
  });
}

function buildProgress({ project, closedAt, tasks, listsById, sprints, planningItems, changeRequests }) {
  const plannedStart = toDate(project?.startDate);
  const plannedEnd = toDate(project?.expectedEndDate || project?.dueDate);
  const actualEnd = toDate(closedAt);
  const scheduleVarianceDays = plannedEnd && actualEnd ? daysBetween(actualEnd, plannedEnd) : null;
  let onTime = null;
  if (plannedEnd && actualEnd) onTime = actualEnd.getTime() <= plannedEnd.getTime();

  const activeTasks = tasks || [];
  let overdueCompletedCount = 0;
  let doneCount = 0;
  for (const task of activeTasks) {
    if (!isTaskDone(task, listsById)) continue;
    doneCount += 1;
    const due = toDate(task?.dueDate);
    const completed = toDate(task?.completedAt);
    if (due && completed && completed.getTime() > due.getTime()) overdueCompletedCount += 1;
  }

  const delayedMilestones = (planningItems || []).filter((item) => {
    const type = String(item?.type || '').toLowerCase();
    if (type !== 'milestone') return false;
    const st = String(item?.status || '').toLowerCase();
    if (st === 'done' || st === 'cancelled') return false;
    const target = toDate(item?.targetDate);
    if (!target || !actualEnd) return false;
    return target.getTime() < actualEnd.getTime();
  }).length;

  return {
    plannedStart: toIso(plannedStart),
    plannedEnd: toIso(plannedEnd),
    actualEnd: toIso(actualEnd),
    estimatedDurationDays:
      project?.estimatedDurationDays == null ? null : Number(project.estimatedDurationDays) || 0,
    scheduleVarianceDays,
    onTime,
    work: {
      total: activeTasks.length,
      doneCount,
      incompleteCount: Math.max(0, activeTasks.length - doneCount),
      overdueCompletedCount,
    },
    sprints: buildSprintRows(sprints),
    planning: {
      byTypeStatus: countByKey(planningItems, (p) => `${p?.type || 'unknown'}:${p?.status || 'unknown'}`),
      delayedMilestoneCount: delayedMilestones,
    },
    changeRequests: {
      byStatus: countByKey(changeRequests, (c) => c?.status || 'unknown'),
      total: (changeRequests || []).length,
    },
  };
}

function buildPerformance({ tasks, listsById, sprints }) {
  const sprintRows = buildSprintRows(sprints);
  const velocityHoursList = sprintRows.map((s) => s.velocityHours);
  const throughputPerSprint = sprintRows.map((s) => s.doneCount);
  const leadHours = [];
  const cycleHours = [];
  const byType = { story: { count: 0, leadHours: [] }, task: { count: 0, leadHours: [] }, bug: { count: 0, leadHours: [] } };

  for (const task of tasks || []) {
    if (!isTaskDone(task, listsById)) continue;
    const type = issueTypeOf(task);
    byType[type].count += 1;
    const lead = hoursBetween(task?.completedAt, task?.createdAt);
    if (lead != null) {
      leadHours.push(lead);
      byType[type].leadHours.push(lead);
    }
    const cycle = hoursBetween(task?.completedAt, task?.firstInProgressAt);
    if (cycle != null) cycleHours.push(cycle);
  }

  return {
    velocityHoursBySprint: sprintRows.map((s) => ({
      sprintId: s.sprintId,
      name: s.name,
      velocityHours: s.velocityHours,
    })),
    velocityHoursAverage: average(velocityHoursList),
    throughput: {
      donePerSprint: throughputPerSprint,
      totalDone: byType.story.count + byType.task.count + byType.bug.count,
    },
    leadTimeHours: {
      average: average(leadHours),
      median: median(leadHours),
      sampleSize: leadHours.length,
    },
    cycleTimeHours:
      cycleHours.length > 0
        ? {
            value: average(cycleHours),
            average: average(cycleHours),
            median: median(cycleHours),
            sampleSize: cycleHours.length,
            unavailableReason: null,
          }
        : unavailable('missing_firstInProgressAt'),
    byIssueType: {
      story: { count: byType.story.count, avgLeadTimeHours: average(byType.story.leadHours) },
      task: { count: byType.task.count, avgLeadTimeHours: average(byType.task.leadHours) },
      bug: { count: byType.bug.count, avgLeadTimeHours: average(byType.bug.leadHours) },
    },
  };
}

/**
 * Chuẩn hoá activity → [{ field, from, to }].
 * Hỗ trợ: payload.changes[], work.field_changed {field,from,to},
 * estimate_updated {before,after}, legacy fromStatus/toStatus.
 */
function fieldChangesFromActivity(ev) {
  const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
  const type = String(ev?.type || '');
  const out = [];
  const push = (field, from, to) => {
    const f = String(field || '').trim();
    if (!f) return;
    if (out.some((c) => c.field === f && c.from === from && c.to === to)) return;
    out.push({ field: f, from, to });
  };

  if (Array.isArray(payload.changes)) {
    for (const c of payload.changes) {
      if (c && c.field) push(c.field, c.from, c.to);
    }
  }

  if (payload.field != null && String(payload.field).trim()) {
    push(payload.field, payload.from, payload.to);
  }

  if (
    type === 'estimate_updated' ||
    (payload.before !== undefined && payload.after !== undefined && !payload.field)
  ) {
    push('estimateHours', payload.before, payload.after);
  }

  if (out.length === 0 && (payload.fromStatus != null || payload.toStatus != null)) {
    push('status', payload.fromStatus ?? payload.from, payload.toStatus ?? payload.to);
  }

  return out;
}

function statusTransitionFromActivity(ev) {
  const changes = fieldChangesFromActivity(ev);
  const statusChange = changes.find((c) => c.field === 'status');
  if (statusChange) return { from: statusChange.from, to: statusChange.to };
  const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
  const from = payload.fromStatus ?? payload.from ?? ev?.from;
  const to = payload.toStatus ?? payload.to ?? ev?.to;
  if (from == null && to == null) return null;
  return { from, to };
}

function countReopenFromActivities(activities) {
  if (!Array.isArray(activities)) {
    return unavailable('activity_not_loaded');
  }
  let scannedTransitions = 0;
  let reopenCount = 0;
  for (const ev of activities) {
    const tr = statusTransitionFromActivity(ev);
    if (!tr) continue;
    scannedTransitions += 1;
    if (isDoneLikeStatus(tr.from) && !isDoneLikeStatus(tr.to)) reopenCount += 1;
  }
  if (scannedTransitions === 0) {
    return unavailable('activity_payload_lacks_status_transition');
  }
  return { value: reopenCount, unavailableReason: null };
}

function buildQuality({ tasks, listsById, activities }) {
  const doneTasks = (tasks || []).filter((t) => isTaskDone(t, listsById));
  const bugCount = doneTasks.filter((t) => issueTypeOf(t) === 'bug').length;
  const totalDone = doneTasks.length;
  const defectRate = totalDone > 0 ? Math.round((bugCount / totalDone) * 1000) / 1000 : null;
  const reopen = countReopenFromActivities(activities);
  return {
    bugCount,
    defectRate,
    reopenCount: reopen.value,
    reopenUnavailableReason: reopen.unavailableReason,
    escapedBugs: unavailable('missing_found_in_environment'),
    severity: unavailable('missing_bug_severity'),
  };
}

function flattenTechStack(project) {
  const stack = project?.technicalSetup?.stack || {};
  const languages = Array.isArray(stack.languages) ? stack.languages : [];
  const frameworks = Array.isArray(stack.frameworks) ? stack.frameworks : [];
  const databases = Array.isArray(stack.databases) ? stack.databases : [];
  return {
    languages: languages.map((s) => String(s || '').trim()).filter(Boolean),
    frameworks: frameworks.map((s) => String(s || '').trim()).filter(Boolean),
    databases: databases.map((s) => String(s || '').trim()).filter(Boolean),
  };
}

function techListFromStack(techStack) {
  return [
    ...(techStack.languages || []),
    ...(techStack.frameworks || []),
    ...(techStack.databases || []),
  ];
}

function tagsForUser(tasks, userId) {
  const tags = new Set();
  for (const task of tasks || []) {
    const uid = asStringOid(task?.assigneeId);
    if (uid !== userId) continue;
    for (const t of task?.tags || []) {
      const s = String(t || '').trim();
      if (s) tags.add(s);
    }
  }
  return [...tags];
}

function countReopenByUser(activities, tasks) {
  const byTaskAssignee = new Map();
  for (const task of tasks || []) {
    const tid = asStringOid(task?._id || task?.id);
    const uid = asStringOid(task?.assigneeId);
    if (tid && uid) byTaskAssignee.set(tid, uid);
  }
  const reopenByUser = {};
  if (!Array.isArray(activities)) return reopenByUser;
  for (const ev of activities) {
    const tr = statusTransitionFromActivity(ev);
    if (!tr || !isDoneLikeStatus(tr.from) || isDoneLikeStatus(tr.to)) continue;
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const tid = asStringOid(ev?.taskId || payload.taskId);
    const uid = byTaskAssignee.get(tid) || asStringOid(payload.assigneeId);
    if (!uid) continue;
    reopenByUser[uid] = (reopenByUser[uid] || 0) + 1;
  }
  return reopenByUser;
}

function countReEstimateByUser(activities, tasks) {
  const byTaskAssignee = new Map();
  for (const task of tasks || []) {
    const tid = asStringOid(task?._id || task?.id);
    const uid = asStringOid(task?.assigneeId);
    if (tid && uid) byTaskAssignee.set(tid, uid);
  }
  const byUser = {};
  if (!Array.isArray(activities)) return byUser;
  for (const ev of activities) {
    const changes = fieldChangesFromActivity(ev);
    const estChange = changes.find((c) => c.field === 'estimateHours');
    if (!estChange) continue;
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const tid = asStringOid(ev?.taskId || payload.taskId);
    const uid = byTaskAssignee.get(tid) || asStringOid(payload.assigneeId);
    if (!uid) continue;
    byUser[uid] = (byUser[uid] || 0) + 1;
  }
  return byUser;
}

function deriveReassignmentHistory(activities) {
  if (!Array.isArray(activities)) return [];
  const out = [];
  for (const ev of activities) {
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const changes = fieldChangesFromActivity(ev);
    const assigneeChange = changes.find((c) => c.field === 'assigneeId');
    if (!assigneeChange) continue;
    const fromUserId = asStringOid(assigneeChange.from);
    const toUserId = asStringOid(assigneeChange.to);
    if (!fromUserId && !toUserId) continue;
    out.push({
      taskId: asStringOid(ev?.taskId || payload.taskId),
      fromUserId: fromUserId || null,
      toUserId: toUserId || null,
      at: toIso(ev?.createdAt),
      reason: String(payload.reason || '').trim() || null,
      source: 'task_activity',
    });
  }
  return out.slice(0, 200);
}

function buildResources({ tasks, worklogs, project, activities }) {
  const plannedHours = (tasks || []).reduce((sum, t) => sum + normalizeEstimateHours(t?.estimateHours), 0);
  const actualHours = (worklogs || []).reduce((sum, w) => sum + normalizeEstimateHours(w?.hours), 0);
  const estimateByUser = {};
  for (const task of tasks || []) {
    const uid = asStringOid(task?.assigneeId);
    if (!uid) continue;
    estimateByUser[uid] = (estimateByUser[uid] || 0) + normalizeEstimateHours(task?.estimateHours);
  }
  const actualByUser = {};
  for (const log of worklogs || []) {
    const uid = asStringOid(log?.userId);
    if (!uid) continue;
    actualByUser[uid] = (actualByUser[uid] || 0) + normalizeEstimateHours(log?.hours);
  }
  const reopenByUser = countReopenByUser(activities, tasks);
  const reEstimateByUser = countReEstimateByUser(activities, tasks);
  const techStack = flattenTechStack(project);
  const projectTechs = techListFromStack(techStack);
  const userIds = new Set([...Object.keys(estimateByUser), ...Object.keys(actualByUser)]);
  const byUser = [...userIds].map((userId) => {
    const planned = estimateByUser[userId] || 0;
    const actual = actualByUser[userId] || 0;
    const tagTechs = tagsForUser(tasks, userId);
    const technologiesHandled = [...new Set([...tagTechs, ...(tagTechs.length ? [] : projectTechs)])].slice(
      0,
      40
    );
    return {
      userId,
      plannedHours: planned,
      actualHours: actual,
      varianceHours: Math.round((actual - planned) * 100) / 100,
      submittedEarlyHours: Math.round(Math.max(0, planned - actual) * 100) / 100,
      overdueHours: Math.round(Math.max(0, actual - planned) * 100) / 100,
      reopenCount: reopenByUser[userId] || 0,
      reEstimateCount: reEstimateByUser[userId] || 0,
      technologiesHandled,
    };
  });
  const budgetStub = project?.budgetStub && typeof project.budgetStub === 'object' ? project.budgetStub : null;
  return {
    plannedHours: Math.round(plannedHours * 100) / 100,
    actualHours: Math.round(actualHours * 100) / 100,
    varianceHours: Math.round((actualHours - plannedHours) * 100) / 100,
    byUser,
    budgetStub,
    actualCost: unavailable('erp_out_of_scope'),
  };
}

function buildPersonnel({ tasks, listsById, worklogs, members }) {
  const hoursByUser = {};
  for (const log of worklogs || []) {
    const uid = asStringOid(log?.userId);
    if (!uid) continue;
    hoursByUser[uid] = (hoursByUser[uid] || 0) + normalizeEstimateHours(log?.hours);
  }
  const doneByUser = {};
  let unassignedDoneCount = 0;
  for (const task of tasks || []) {
    if (!isTaskDone(task, listsById)) continue;
    const uid = asStringOid(task?.assigneeId);
    if (!uid) {
      unassignedDoneCount += 1;
      continue;
    }
    doneByUser[uid] = (doneByUser[uid] || 0) + 1;
  }
  const memberRows = (members || []).map((m) => {
    const userId = asStringOid(m?.userId);
    return {
      userId,
      status: String(m?.status || '').trim() || 'active',
      joinDate: toIso(m?.joinDate),
      leaveDate: toIso(m?.leaveDate),
      billable: Boolean(m?.billable),
      tasksDone: doneByUser[userId] || 0,
      hoursLogged: Math.round((hoursByUser[userId] || 0) * 100) / 100,
    };
  });
  return {
    members: memberRows,
    unassignedDoneCount,
  };
}

function buildProcess({ approvals, sprints, project, activities }) {
  const waitHours = [];
  for (const a of approvals || []) {
    const st = String(a?.status || '').toLowerCase();
    if (st !== 'approved' && st !== 'rejected') continue;
    const wait = hoursBetween(a?.completedAt, a?.createdAt);
    if (wait != null) waitHours.push(wait);
  }
  const historicalSpillover = (sprints || []).reduce((sum, s) => {
    const n = Number(s?.closureSnapshot?.incompleteCount);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  const wipLimit = project?.methodologySettings?.wipLimit;
  const derivedReassignment = deriveReassignmentHistory(activities);
  const opLog = Array.isArray(project?.operationalLog) ? project.operationalLog : [];
  const opReassign = opLog
    .filter((e) => e && (e.type === 'reassignment' || e.source === 'fallback_override'))
    .map((e) => ({
      taskId: asStringOid(e.taskId),
      fromUserId: asStringOid(e.fromUserId) || null,
      toUserId: asStringOid(e.toUserId) || null,
      at: toIso(e.at) || (typeof e.at === 'string' ? e.at : null),
      reason: e.reason || null,
      source: e.source || e.type || 'operational_log',
    }));
  const mergedReassign = [...derivedReassignment, ...opReassign].slice(0, 200);
  const failedRows = opLog
    .filter((e) => e && e.type === 'failed_short_horizon')
    .map((e) => ({
      taskId: asStringOid(e.taskId),
      at: toIso(e.at) || (typeof e.at === 'string' ? e.at : null),
      fromStatus: e.fromStatus || null,
      toStatus: e.toStatus || null,
      reason: e.reason || null,
      remainingCalendarDays:
        e.remainingCalendarDays != null ? Number(e.remainingCalendarDays) : null,
      source: 'operational_log',
    }));
  return {
    approvalWaitHoursAverage: average(waitHours),
    approvalSampleSize: waitHours.length,
    historicalSpilloverCount: historicalSpillover,
    wipLimit: wipLimit == null ? null : Number(wipLimit) || 0,
    blockers: unavailable('missing_blocked_field'),
    dependency: unavailable('missing_issue_links'),
    bottleneck: unavailable('missing_time_in_status'),
    reassignmentHistory:
      mergedReassign.length > 0
        ? { value: mergedReassign, unavailableReason: null }
        : unavailable('not_tracked_on_close'),
    failedShortHorizon:
      failedRows.length > 0
        ? { value: failedRows, unavailableReason: null }
        : unavailable('runtime_fallback_not_wired'),
    risksAndIssuesHandled: unavailable('risk_capture_not_wired'),
  };
}

function buildExperience({ sprints, closeNotes }) {
  const sprintReviewNotes = (sprints || [])
    .map((s) => ({
      sprintId: asStringOid(s?._id || s?.id),
      name: String(s?.name || '').trim(),
      reviewNotes: String(s?.reviewNotes || '').trim(),
    }))
    .filter((row) => row.reviewNotes);
  const notes = String(closeNotes || '').trim().slice(0, 4000);
  return {
    sprintReviewNotes,
    closeNotes: notes,
  };
}

function buildProjectCloseSnapshot({
  project = {},
  closedAt = null,
  closeNotes = '',
  tasks = [],
  listsById = {},
  sprints = [],
  worklogs = [],
  members = [],
  changeRequests = [],
  planningItems = [],
  approvals = [],
  activities,
} = {}) {
  const at = toDate(closedAt) || new Date();
  const techStack = flattenTechStack(project);
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    at: toIso(at),
    techStack,
    progress: buildProgress({
      project,
      closedAt: at,
      tasks,
      listsById,
      sprints,
      planningItems,
      changeRequests,
    }),
    performance: buildPerformance({ tasks, listsById, sprints }),
    quality: buildQuality({ tasks, listsById, activities }),
    resources: buildResources({ tasks, worklogs, project, activities }),
    personnel: buildPersonnel({ tasks, listsById, worklogs, members }),
    process: buildProcess({ approvals, sprints, project, activities }),
    experience: buildExperience({ sprints, closeNotes }),
  };
}

module.exports = {
  SNAPSHOT_SCHEMA_VERSION,
  toIso,
  daysBetween,
  hoursBetween,
  average,
  median,
  unavailable,
  fieldChangesFromActivity,
  countReopenFromActivities,
  buildProjectCloseSnapshot,
};
