/**
 * Project close snapshot (7 nhóm P1) — pure, không ghi DB.
 * Field P2 thiếu schema → null + unavailableReason.
 */

const { isDoneFromTask, normalizeEstimateHours } = require('./sprintCloseClassify');
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
    cycleTimeHours: unavailable('missing_firstInProgressAt'),
    byIssueType: {
      story: { count: byType.story.count, avgLeadTimeHours: average(byType.story.leadHours) },
      task: { count: byType.task.count, avgLeadTimeHours: average(byType.task.leadHours) },
      bug: { count: byType.bug.count, avgLeadTimeHours: average(byType.bug.leadHours) },
    },
  };
}

function countReopenFromActivities(activities) {
  if (!Array.isArray(activities)) {
    return unavailable('activity_not_loaded');
  }
  let scannedTransitions = 0;
  let reopenCount = 0;
  for (const ev of activities) {
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const changes = Array.isArray(payload.changes) ? payload.changes : [];
    const statusChange = changes.find((c) => String(c?.field || '') === 'status');
    const from = statusChange?.from ?? payload.fromStatus ?? payload.from ?? ev?.from;
    const to = statusChange?.to ?? payload.toStatus ?? payload.to ?? ev?.to;
    if (from == null && to == null) continue;
    scannedTransitions += 1;
    if (isDoneLikeStatus(from) && !isDoneLikeStatus(to)) reopenCount += 1;
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

function buildResources({ tasks, worklogs, project }) {
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
  const userIds = new Set([...Object.keys(estimateByUser), ...Object.keys(actualByUser)]);
  const byUser = [...userIds].map((userId) => ({
    userId,
    plannedHours: estimateByUser[userId] || 0,
    actualHours: actualByUser[userId] || 0,
    varianceHours: Math.round(((actualByUser[userId] || 0) - (estimateByUser[userId] || 0)) * 100) / 100,
  }));
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

function buildProcess({ approvals, sprints, project }) {
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
  return {
    approvalWaitHoursAverage: average(waitHours),
    approvalSampleSize: waitHours.length,
    historicalSpilloverCount: historicalSpillover,
    wipLimit: wipLimit == null ? null : Number(wipLimit) || 0,
    blockers: unavailable('missing_blocked_field'),
    dependency: unavailable('missing_issue_links'),
    bottleneck: unavailable('missing_time_in_status'),
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
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    at: toIso(at),
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
    resources: buildResources({ tasks, worklogs, project }),
    personnel: buildPersonnel({ tasks, listsById, worklogs, members }),
    process: buildProcess({ approvals, sprints, project }),
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
  countReopenFromActivities,
  buildProjectCloseSnapshot,
};
