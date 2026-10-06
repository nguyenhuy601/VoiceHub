/**
 * Build Gate2 Planning Review rows from HOW planning container (mirror Gate1 sections).
 */

const SECTION_ORDER = [
  'tasks',
  'dependencies',
  'assignments',
  'schedule',
  'risks',
];

const SECTION_LABELS = {
  tasks: 'WBS / Tasks',
  dependencies: 'Dependencies',
  assignments: 'Assignments',
  schedule: 'Schedule',
  risks: 'Risks',
};

function clip(value, max = 160) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function containerOf(pack) {
  if (pack?.aiAnalysis && typeof pack.aiAnalysis === 'object') return pack.aiAnalysis;
  return pack && typeof pack === 'object' ? pack : {};
}

function taskRows(container) {
  const tasks = Array.isArray(container?.planning?.tasks) ? container.planning.tasks : [];
  return tasks
    .filter((t) => t && (t.id || t.taskId))
    .map((t, i) => {
      const id = String(t.id || t.taskId || `task-${i}`);
      const level = String(t.level || 'task').toLowerCase();
      return {
        logicalId: `task:${id}`,
        id,
        section: 'tasks',
        sectionLabel: SECTION_LABELS.tasks,
        title: t.name || t.title || id,
        level,
        suggestedRoleKey: t.suggestedRoleKey || '',
        effortHours: t.effortHours != null ? Number(t.effortHours) : null,
        startDate: t.startDate || null,
        dueDate: t.dueDate || null,
        area: t.area || '',
        status: t.leveled ? 'LEVELED' : 'READY',
        summary: clip(
          [
            level,
            t.suggestedRoleKey,
            t.effortHours != null ? `${t.effortHours}h` : '',
            t.startDate || '',
            t.dueDate || '',
          ]
            .filter(Boolean)
            .join(' · ')
        ),
      };
    });
}

function dependencyRows(container) {
  const edges = Array.isArray(container?.analyses?.dependency?.edges)
    ? container.analyses.dependency.edges
    : Array.isArray(container?.planning?.dependencies)
      ? container.planning.dependencies
      : [];
  return edges.map((e, i) => {
    const from = e.from || e.predecessorId || e.source || '';
    const to = e.to || e.successorId || e.target || '';
    const id = String(e.id || `${from}->${to}` || `dep-${i}`);
    return {
      logicalId: `dep:${id}`,
      id,
      section: 'dependencies',
      sectionLabel: SECTION_LABELS.dependencies,
      title: `${from || '?'} → ${to || '?'}`,
      depType: e.type || e.kind || 'FS',
      critical: Boolean(e.critical || e.blocking),
      source: e.source || '',
      status: e.critical || e.blocking ? 'CRITICAL' : 'READY',
      summary: clip([e.type || e.kind, e.source, e.critical ? 'critical' : ''].filter(Boolean).join(' · ')),
    };
  });
}

function buildTaskById(container) {
  const tasks = Array.isArray(container?.planning?.tasks) ? container.planning.tasks : [];
  const taskById = new Map();
  for (const t of tasks) {
    const id = String(t.id || t.taskId || '');
    if (id) taskById.set(id, t);
  }
  return taskById;
}

/** Story/feature anchor for branch-level Gate2 rows */
function branchAnchorId(taskId, taskById) {
  let cur = taskById.get(taskId);
  let anchor = taskId;
  while (cur) {
    const level = String(cur.level || '').toLowerCase();
    if (level === 'story' || level === 'feature') {
      anchor = String(cur.id || cur.taskId || anchor);
    }
    const pid =
      cur.parentId != null && cur.parentId !== '' ? String(cur.parentId) : null;
    if (!pid) break;
    cur = taskById.get(pid);
  }
  return anchor;
}

function isLeafTaskRow(task) {
  const level = String(task?.level || 'task').toLowerCase();
  return level !== 'epic' && level !== 'feature' && level !== 'story';
}

function makeAssignmentRow({
  logicalId,
  id,
  title,
  assignee,
  score,
  availableHours,
  overload,
  status,
  summary,
}) {
  return {
    logicalId,
    id,
    section: 'assignments',
    sectionLabel: SECTION_LABELS.assignments,
    title,
    assignee,
    score,
    availableHours,
    overload,
    status,
    summary: clip(summary),
  };
}

function assignmentRows(container) {
  const taskById = buildTaskById(container);
  const finalAssign = new Map();
  for (const a of container?.resource?.assignments || []) {
    const tid = String(a.taskId || '');
    if (tid) finalAssign.set(tid, a);
  }

  const recs = Array.isArray(container?.resource?.recommendations)
    ? container.resource.recommendations
    : [];

  const members = [];
  for (const rec of recs) {
    const taskId = String(rec.taskId || rec.id || '');
    if (!taskId) continue;
    const shortlist = Array.isArray(rec.shortlist) ? rec.shortlist : [];
    const picked = finalAssign.get(taskId);
    const top = shortlist[0] || null;
    const userId = String(picked?.userId || top?.userId || '').trim();
    const displayName =
      String(picked?.displayName || top?.displayName || '').trim() || userId || '—';
    const branchId = branchAnchorId(taskId, taskById);
    const task = taskById.get(taskId);
    members.push({
      taskId,
      branchId,
      branchTitle: taskById.get(branchId)?.name || branchId,
      taskTitle: task?.name || task?.title || taskId,
      shortlistLen: shortlist.length,
      multiAssignee: shortlist.length >= 2,
      userId,
      displayName,
      score: top?.score != null ? Number(top.score) : null,
      availableHours:
        top?.available_capacity != null ? Number(top.available_capacity) : null,
      overload: Boolean(top?.overload),
    });
  }

  const byBranch = new Map();
  for (const m of members) {
    if (!byBranch.has(m.branchId)) byBranch.set(m.branchId, []);
    byBranch.get(m.branchId).push(m);
  }

  const rows = [];
  const coveredTaskIds = new Set();

  for (const [branchId, group] of byBranch) {
    const userIds = new Set(group.map((g) => g.userId).filter(Boolean));
    const allSingleShortlist = group.every((g) => !g.multiAssignee);
    const sameAssignee = userIds.size === 1 && group[0]?.userId;

    if (allSingleShortlist && sameAssignee && group.length > 1) {
      const g0 = group[0];
      rows.push(
        makeAssignmentRow({
          logicalId: `asg:${branchId}`,
          id: branchId,
          title: g0.branchTitle,
          assignee: g0.displayName,
          score: g0.score,
          availableHours: g0.availableHours,
          overload: g0.overload,
          status: g0.overload ? 'OVERLOAD' : g0.userId ? 'READY' : 'UNASSIGNED',
          summary: `${group.length} tasks · ${g0.displayName}${
            g0.score != null ? ` · score ${g0.score}` : ''
          }`,
        })
      );
      group.forEach((g) => coveredTaskIds.add(g.taskId));
      continue;
    }

    for (const g of group) {
      coveredTaskIds.add(g.taskId);
      rows.push(
        makeAssignmentRow({
          logicalId: `asg:${g.taskId}`,
          id: g.taskId,
          title: g.taskTitle,
          assignee: g.displayName,
          score: g.score,
          availableHours: g.availableHours,
          overload: g.overload,
          status: g.overload ? 'OVERLOAD' : g.userId ? 'READY' : 'UNASSIGNED',
          summary: [
            g.displayName,
            g.score != null ? `score ${g.score}` : '',
            g.overload ? 'overload' : '',
            g.multiAssignee ? `${g.shortlistLen} candidates` : '',
          ]
            .filter(Boolean)
            .join(' · '),
        })
      );
    }
  }

  const unassigned = Array.isArray(container?.resource?.matching?.unassigned)
    ? container.resource.matching.unassigned
    : Array.isArray(container?.resource?.unassigned)
      ? container.resource.unassigned
      : [];
  for (const u of unassigned) {
    const taskId = String(u?.taskId || u?.id || u || '');
    if (!taskId || coveredTaskIds.has(taskId)) continue;
    const task = taskById.get(taskId);
    rows.push(
      makeAssignmentRow({
        logicalId: `asg:${taskId}`,
        id: taskId,
        title: task?.name || taskId,
        assignee: '—',
        score: null,
        availableHours: null,
        overload: false,
        status: 'UNASSIGNED',
        summary: 'unassigned',
      })
    );
  }
  return rows;
}

function mergeScheduleEntry(byTask, tid, patch, titleById) {
  const title = titleById.get(tid) || tid;
  if (!byTask.has(tid)) {
    byTask.set(tid, {
      logicalId: `sch:${tid}`,
      id: tid,
      section: 'schedule',
      sectionLabel: SECTION_LABELS.schedule,
      title,
      startDate: patch.startDate || null,
      dueDate: patch.dueDate || null,
      effortHours: patch.effortHours != null ? Number(patch.effortHours) : null,
      status: patch.status || 'SCHEDULED',
      summary: '',
    });
    return;
  }
  const cur = byTask.get(tid);
  if (patch.startDate && (!cur.startDate || patch.startDate < cur.startDate)) {
    cur.startDate = patch.startDate;
  }
  if (patch.dueDate && (!cur.dueDate || patch.dueDate > cur.dueDate)) {
    cur.dueDate = patch.dueDate;
  }
  if (patch.effortHours != null) {
    cur.effortHours = (Number(cur.effortHours) || 0) + Number(patch.effortHours);
  }
  if (patch.status) cur.status = patch.status;
  cur.title = title;
}

function scheduleRows(container) {
  const tasks = Array.isArray(container?.planning?.tasks) ? container.planning.tasks : [];
  const titleById = new Map();
  for (const t of tasks) {
    const id = String(t.id || t.taskId || '');
    if (id) titleById.set(id, t.name || t.title || id);
  }

  const byTask = new Map();
  const schedule = Array.isArray(container?.resource?.schedule)
    ? container.resource.schedule
    : [];
  for (const row of schedule) {
    const tid = String(row.taskId || '');
    if (!tid) continue;
    mergeScheduleEntry(
      byTask,
      tid,
      {
        startDate: row.dateKey || null,
        dueDate: row.dateKey || null,
        effortHours: Number(row.hours) || 0,
        status: 'SCHEDULED',
      },
      titleById
    );
  }

  for (const t of tasks) {
    const id = String(t.id || t.taskId || '');
    if (!id || (!t.startDate && !t.dueDate)) continue;
    mergeScheduleEntry(
      byTask,
      id,
      {
        startDate: t.startDate || null,
        dueDate: t.dueDate || null,
        effortHours: t.effortHours != null ? Number(t.effortHours) : null,
        status: t.leveled ? 'LEVELED' : 'SCHEDULED',
      },
      titleById
    );
  }

  const recs = Array.isArray(container?.resource?.recommendations)
    ? container.resource.recommendations
    : [];
  for (const rec of recs) {
    const tid = String(rec.taskId || '');
    if (!tid || byTask.has(tid)) continue;
    const task = tasks.find((x) => String(x.id || x.taskId) === tid);
    if (task && !isLeafTaskRow(task)) continue;
    mergeScheduleEntry(
      byTask,
      tid,
      { status: 'UNSCHEDULED', startDate: null, dueDate: null, effortHours: null },
      titleById
    );
  }

  return [...byTask.values()].map((r) => ({
    ...r,
    summary: clip(
      [r.startDate, r.dueDate, r.effortHours != null ? `${r.effortHours}h` : '', r.status]
        .filter(Boolean)
        .join(' · ')
    ),
  }));
}

function riskRows(container) {
  const items = Array.isArray(container?.analyses?.risk?.items)
    ? container.analyses.risk.items
    : Array.isArray(container?.planning?.risks)
      ? container.planning.risks
      : [];
  return items.map((r, i) => {
    const id = String(r.id || r.riskId || `risk-${i}`);
    return {
      logicalId: `risk:${id}`,
      id,
      section: 'risks',
      sectionLabel: SECTION_LABELS.risks,
      title: r.name || r.title || id,
      band: r.band || r.severity || '',
      status: String(r.band || r.severity || 'READY').toUpperCase(),
      summary: clip(r.description || r.mitigation || r.band || ''),
    };
  });
}

const BUILDERS = {
  tasks: taskRows,
  dependencies: dependencyRows,
  assignments: assignmentRows,
  schedule: scheduleRows,
  risks: riskRows,
};

/**
 * @param {{ pack?: object, container?: object }} input
 */
export function buildGate2ProposalItems({ pack, container: containerIn } = {}) {
  const container = containerIn || containerOf(pack);
  const bySection = {};
  const items = [];
  for (const key of SECTION_ORDER) {
    const rows = BUILDERS[key](container);
    bySection[key] = rows;
    items.push(...rows);
  }
  const proposalSections = SECTION_ORDER.map((key) => {
    const rows = bySection[key] || [];
    const conflictCount = rows.filter((r) =>
      ['BLOCKING', 'OVERLOAD', 'CRITICAL', 'UNASSIGNED'].includes(String(r.status || '').toUpperCase())
    ).length;
    return {
      key,
      label: SECTION_LABELS[key] || key,
      count: rows.length,
      missing: rows.length === 0,
      hasConflict: conflictCount > 0,
      conflictCount,
    };
  });

  const gate2 = container?.gate2 || {};
  const how = container?.phaseRuns?.phase_how || {};

  return {
    items,
    proposalBySection: bySection,
    proposalSections,
    reviewDecisions:
      gate2.reviewDecisions && typeof gate2.reviewDecisions === 'object'
        ? gate2.reviewDecisions
        : {},
    reviewVersion: Number(gate2.reviewVersion) || 0,
    reviewComplete: Boolean(gate2.reviewComplete),
    readyForGate2: String(how.status || '').toLowerCase() === 'ready' || String(how.status || '').toLowerCase() === 'confirmed',
    activeSubmissionId: gate2.submittedBy ? String(gate2.submittedAt || gate2.submittedBy) : null,
  };
}

export { SECTION_ORDER, SECTION_LABELS };

export default buildGate2ProposalItems;
