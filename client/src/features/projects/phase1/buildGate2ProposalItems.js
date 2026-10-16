/**
 * Build Gate2 Planning Review rows from HOW planning container (mirror Gate1 sections).
 * Synthetic / empty-state copy (no AI proposal yet) follows account UI locale via optional `t`.
 */

const SECTION_ORDER = [
  'scope',
  'tasks',
  'dependencies',
  'architecture',
  'effort_roles',
  'assignments',
  'capacity',
  'schedule',
  'releases',
  'risks',
  'quality',
  'deploy',
];

const SECTION_LABELS = {
  scope: 'Scope & Objectives',
  tasks: 'WBS / Tasks',
  dependencies: 'Dependencies',
  architecture: 'Architecture',
  effort_roles: 'Effort & Roles',
  assignments: 'Assignments',
  capacity: 'Capacity',
  schedule: 'Schedule',
  releases: 'Sprint / Release',
  risks: 'Risks / Assumptions',
  quality: 'Quality / Testing',
  deploy: 'Deploy Plan',
};

function tr(t, key, fallback) {
  const value = typeof t === 'function' ? t(key) : '';
  if (value == null || value === '' || value === key) return fallback;
  return value;
}

/** Section tab / row label — i18n when `t` provided (user locale). */
export function localizeGate2SectionLabel(t, key) {
  const k = String(key || '').trim();
  return tr(t, `requirements.gate2Section_${k}`, SECTION_LABELS[k] || k);
}

function clip(value, max = 160) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

/** Default HOW engine output — column "Nguồn" = AI đề xuất unless overridden. */
const PROVENANCE_AI = Object.freeze({ type: 'AI_SYNTHESIS', producer: 'how_engine' });
/** Deterministic HOW heuristic engines (deps same-area, arch/risk/quality/deploy, …). */
const PROVENANCE_HEURISTIC = Object.freeze({ type: 'HEURISTIC', producer: 'how_heuristic' });
/** Gate1-approved pack sheets rolled into Gate2 (Scope / Assumptions / Constraints). */
const PROVENANCE_GATE1 = Object.freeze({
  type: 'GATE1_APPROVED',
  producer: 'requirement_pack',
});

function isHeuristicHowSource(value) {
  return String(value || '')
    .trim()
    .toLowerCase() === 'heuristic';
}

/**
 * Stamp HOW row provenance for Gate2 "Nguồn".
 * Preserves existing type; heuristic when row/source/meta says so; else AI.
 */
function withAiProvenance(row, extra = null) {
  const merged = extra ? { ...row, ...extra } : { ...row };
  const existing = merged?.provenance || merged?.origin;
  if (existing && typeof existing === 'object' && existing.type) {
    return merged;
  }
  if (
    isHeuristicHowSource(merged.source) ||
    isHeuristicHowSource(merged.dataSource)
  ) {
    return {
      ...merged,
      source: merged.source || 'heuristic',
      provenance: { ...PROVENANCE_HEURISTIC },
      origin: { type: 'HEURISTIC' },
    };
  }
  return {
    ...merged,
    provenance: { ...PROVENANCE_AI },
    origin: { type: 'AI_SYNTHESIS' },
  };
}

function withGate1Provenance(row, extra = null) {
  return {
    ...row,
    ...(extra || {}),
    provenance: { ...(row?.provenance || {}), ...PROVENANCE_GATE1 },
    origin: { type: 'GATE1_APPROVED' },
  };
}

function pickText(...candidates) {
  for (const c of candidates) {
    const t = String(c ?? '').trim();
    if (t) return t;
  }
  return '';
}

/**
 * §1 Scope & Objectives — rollup from Gate1-approved pack sheets (no HOW invent).
 * @param {object|null|undefined} pack
 */
function scopeRows(pack) {
  const rows = [];
  const goals = Array.isArray(pack?.businessGoals) ? pack.businessGoals : [];
  for (let i = 0; i < goals.length; i += 1) {
    const g = goals[i];
    if (!g || typeof g !== 'object') continue;
    const id = String(g.externalId || g.id || g.key || `bg-${i}`);
    const title =
      pickText(g.name, g.title, g.goal, g.text, g.description, id) || id;
    const success = pickText(g.successCriteria, g.acceptanceCriteria, g.metric);
    rows.push(
      withGate1Provenance({
        logicalId: `scope:obj:${id}`,
        id,
        section: 'scope',
        sectionLabel: SECTION_LABELS.scope,
        title,
        level: 'objective',
        scopeType: 'objective',
        status: String(g.status || 'READY').toUpperCase() || 'READY',
        summary: clip(
          [success ? `success: ${success}` : '', g.baNote || g.note || '']
            .filter(Boolean)
            .join(' · ')
        ),
      })
    );
  }

  const scopes = Array.isArray(pack?.scope) ? pack.scope : [];
  for (let i = 0; i < scopes.length; i += 1) {
    const s = scopes[i];
    if (!s || typeof s !== 'object') continue;
    const rawType = String(s.type || s.scopeType || 'in').toLowerCase();
    const isOut = rawType === 'out' || rawType === 'out_of_scope' || rawType === 'oos';
    const level = isOut ? 'out_of_scope' : 'in_scope';
    const id = String(s.externalId || s.id || `scope-${level}-${i}`);
    const title = pickText(s.description, s.text, s.title, id) || id;
    rows.push(
      withGate1Provenance({
        logicalId: `scope:${level}:${id}`,
        id,
        section: 'scope',
        sectionLabel: SECTION_LABELS.scope,
        title,
        level,
        scopeType: isOut ? 'out' : 'in',
        status: String(s.status || 'READY').toUpperCase() || 'READY',
        summary: clip(
          [isOut ? 'out of scope' : 'in scope', s.source || '', s.baNote || '']
            .filter(Boolean)
            .join(' · ')
        ),
      })
    );
  }

  return rows;
}

function containerOf(pack) {
  if (pack?.aiAnalysis && typeof pack.aiAnalysis === 'object') return pack.aiAnalysis;
  return pack && typeof pack === 'object' ? pack : {};
}

const WBS_LEVEL_ORDER = Object.freeze({
  epic: 0,
  feature: 1,
  story: 2,
  work_package: 3,
  task: 4,
});

const WBS_CONTAINER_LEVELS = new Set(['epic', 'feature', 'story', 'work_package']);

/**
 * Depth-first order under parents so Gate2 WBS table reads as a tree
 * (Epic → Feature → Story → Work package → Task).
 * Also stamps depth, childIds, hasChildren, and rolls up container effortHours.
 */
function sortWbsTreeForGate2(nodes = []) {
  const list = Array.isArray(nodes) ? nodes : [];
  const byId = new Map(list.map((n) => [String(n.id), { ...n }]));
  const childrenOf = new Map();
  const roots = [];

  for (const n of byId.values()) {
    const id = String(n.id);
    const pid =
      n.parentId != null && n.parentId !== '' ? String(n.parentId) : null;
    if (pid && byId.has(pid)) {
      if (!childrenOf.has(pid)) childrenOf.set(pid, []);
      childrenOf.get(pid).push(n);
    } else {
      roots.push(n);
    }
  }

  const sortSiblings = (arr) =>
    arr.sort((a, b) => {
      const la = WBS_LEVEL_ORDER[String(a.level || '').toLowerCase()] ?? 50;
      const lb = WBS_LEVEL_ORDER[String(b.level || '').toLowerCase()] ?? 50;
      if (la !== lb) return la - lb;
      const sa = Number(a.sortOrder);
      const sb = Number(b.sortOrder);
      if (Number.isFinite(sa) && Number.isFinite(sb) && sa !== sb) return sa - sb;
      return String(a.id).localeCompare(String(b.id));
    });

  sortSiblings(roots);
  for (const kids of childrenOf.values()) sortSiblings(kids);

  const out = [];
  const visit = (node, depth) => {
    const kids = childrenOf.get(String(node.id)) || [];
    node.depth = depth;
    node.childIds = kids.map((k) => String(k.id));
    node.hasChildren = kids.length > 0;
    node.isWbsContainer = WBS_CONTAINER_LEVELS.has(String(node.level || '').toLowerCase());
    out.push(node);
    for (const kid of kids) visit(kid, depth + 1);
  };
  for (const root of roots) visit(root, 0);
  if (out.length < list.length) {
    const seen = new Set(out.map((n) => String(n.id)));
    for (const n of list) {
      if (!seen.has(String(n.id))) {
        out.push({
          ...n,
          depth: 0,
          childIds: [],
          hasChildren: false,
          isWbsContainer: WBS_CONTAINER_LEVELS.has(String(n.level || '').toLowerCase()),
        });
      }
    }
  }

  // Bottom-up effort rollup: container effortHours = sum(children)
  const memo = new Map();
  function subtreeEffort(id) {
    if (memo.has(id)) return memo.get(id);
    const node = byId.get(id);
    if (!node) {
      memo.set(id, 0);
      return 0;
    }
    const kids = childrenOf.get(id) || [];
    if (!kids.length) {
      const leaf =
        String(node.level || '') === 'task'
          ? Number(node.effortHours) || 0
          : 0;
      memo.set(id, leaf);
      return leaf;
    }
    let total = 0;
    for (const kid of kids) total += subtreeEffort(String(kid.id));
    if (WBS_CONTAINER_LEVELS.has(String(node.level || '').toLowerCase())) {
      node.effortHours = total;
      node.effortRolledUp = true;
    }
    memo.set(id, total);
    return total;
  }
  for (const root of roots) subtreeEffort(String(root.id));

  return out;
}

function taskRows(container) {
  const tasks = Array.isArray(container?.planning?.tasks) ? container.planning.tasks : [];
  const mapped = tasks
    .filter((t) => t && (t.id || t.taskId))
    .map((t, i) => {
      const id = String(t.id || t.taskId || `task-${i}`);
      const level = String(t.level || 'task').toLowerCase();
      return {
        id,
        title: t.name || t.title || id,
        level,
        parentId:
          t.parentId != null && t.parentId !== '' ? String(t.parentId) : null,
        sortOrder: Number.isFinite(Number(t.sortOrder)) ? Number(t.sortOrder) : i,
        suggestedRoleKey: t.suggestedRoleKey || '',
        effortHours: t.effortHours != null ? Number(t.effortHours) : null,
        startDate: t.startDate || null,
        dueDate: t.dueDate || null,
        area: t.area || '',
        leveled: Boolean(t.leveled),
        provenance: t.provenance || undefined,
        origin: t.origin || undefined,
        source: t.source || undefined,
      };
    });

  return sortWbsTreeForGate2(mapped).map((t) =>
    withAiProvenance({
      logicalId: `task:${t.id}`,
      id: t.id,
      section: 'tasks',
      sectionLabel: SECTION_LABELS.tasks,
      title: t.title,
      level: t.level,
      parentId: t.parentId,
      depth: t.depth || 0,
      sortOrder: t.sortOrder,
      childIds: Array.isArray(t.childIds) ? t.childIds : [],
      hasChildren: Boolean(t.hasChildren),
      isWbsContainer: Boolean(t.isWbsContainer),
      effortRolledUp: Boolean(t.effortRolledUp),
      suggestedRoleKey: t.suggestedRoleKey || '',
      effortHours: t.effortHours != null ? Number(t.effortHours) : null,
      startDate: t.startDate || null,
      dueDate: t.dueDate || null,
      area: t.area || '',
      status: t.leveled ? 'LEVELED' : 'READY',
      summary: clip(
        [
          t.level,
          t.area || '',
          t.suggestedRoleKey,
          t.effortHours != null ? `${t.effortHours}h` : '',
          t.startDate || '',
          t.dueDate || '',
        ]
          .filter(Boolean)
          .join(' · ')
      ),
      provenance: t.provenance || undefined,
      origin: t.origin || undefined,
      source: t.source || undefined,
    })
  );
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
    return withAiProvenance({
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
      provenance: e.provenance || undefined,
      origin: e.origin || undefined,
    });
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
    if (level === 'story' || level === 'feature' || level === 'work_package') {
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
  return (
    level !== 'epic' &&
    level !== 'feature' &&
    level !== 'story' &&
    level !== 'work_package'
  );
}

function makeAssignmentRow({
  logicalId,
  id,
  title,
  assignee,
  assigneeUserId,
  score,
  availableHours,
  overload,
  status,
  summary,
  provenance,
  origin,
  source,
}) {
  return withAiProvenance({
    logicalId,
    id,
    section: 'assignments',
    sectionLabel: SECTION_LABELS.assignments,
    title,
    assignee,
    assigneeUserId: assigneeUserId || '',
    score,
    availableHours,
    overload,
    status,
    summary: clip(summary),
    provenance,
    origin,
    source,
  });
}

function resolveAssigneeLabel(userId, picked, top, nameByUserId = {}) {
  const id = String(userId || '').trim();
  const fromMap = id ? String(nameByUserId[id] || '').trim() : '';
  if (fromMap) return fromMap;
  const fromPayload = String(picked?.displayName || top?.displayName || '').trim();
  if (fromPayload) return fromPayload;
  return id || '—';
}

/** Prefer assigned user; else first eligible (!overload && feasible); else shortlist[0]. */
function resolveSuggestedCandidate(shortlist = [], assignment = null) {
  const list = Array.isArray(shortlist) ? shortlist : [];
  const assignedId = String(assignment?.userId || '').trim();
  if (assignedId) {
    const fromList = list.find((c) => String(c?.userId || '') === assignedId);
    if (fromList) return fromList;
    return {
      userId: assignedId,
      displayName: assignment?.displayName,
      score: assignment?.score != null ? Number(assignment.score) : null,
      overload: Boolean(assignment?.overload),
      available_capacity: assignment?.available_capacity,
    };
  }
  const eligible = list.find(
    (c) => c?.feasible !== false && !c?.overload && String(c?.userId || '').trim()
  );
  return eligible || list[0] || null;
}

function assignmentRows(container, { nameByUserId = {}, t } = {}) {
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
    const picked = finalAssign.get(taskId) || null;
    const suggested = resolveSuggestedCandidate(shortlist, picked);
    const userId = String(suggested?.userId || '').trim();
    const displayName = resolveAssigneeLabel(userId, picked, suggested, nameByUserId);
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
      score: suggested?.score != null ? Number(suggested.score) : null,
      availableHours:
        suggested?.available_capacity != null ? Number(suggested.available_capacity) : null,
      overload: Boolean(suggested?.overload),
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
          assigneeUserId: g0.userId || '',
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
          assigneeUserId: g.userId || '',
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
        summary: tr(t, 'requirements.gate2SynthUnassigned', 'unassigned'),
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

  return [...byTask.values()].map((r) =>
    withAiProvenance({
      ...r,
      summary: clip(
        [r.startDate, r.dueDate, r.effortHours != null ? `${r.effortHours}h` : '', r.status]
          .filter(Boolean)
          .join(' · ')
      ),
    })
  );
}

/**
 * §9 Risk + Assumptions + Constraints.
 * HOW risks from container; assumptions/constraints rollup from Gate1 pack.
 * @param {object} container
 * @param {object|null|undefined} pack
 */
function riskRows(container, pack) {
  const riskAnalysis =
    container?.analyses?.risk && typeof container.analyses.risk === 'object'
      ? container.analyses.risk
      : {};
  const sectionSource = riskAnalysis.meta?.source || '';
  const items = Array.isArray(riskAnalysis.items)
    ? riskAnalysis.items
    : Array.isArray(container?.planning?.risks)
      ? container.planning.risks
      : [];
  const rows = items.map((r, i) => {
    const id = String(r.id || r.riskId || `risk-${i}`);
    return withAiProvenance({
      logicalId: `risk:${id}`,
      id,
      section: 'risks',
      sectionLabel: SECTION_LABELS.risks,
      title: r.name || r.title || id,
      level: 'risk',
      band: r.band || r.severity || '',
      status: String(r.band || r.severity || 'READY').toUpperCase(),
      summary: clip(r.description || r.mitigation || r.band || ''),
      provenance: r.provenance || undefined,
      origin: r.origin || undefined,
      source: r.source || sectionSource || undefined,
    });
  });

  const assumptions = Array.isArray(pack?.assumptions) ? pack.assumptions : [];
  for (let i = 0; i < assumptions.length; i += 1) {
    const a = assumptions[i];
    if (!a || typeof a !== 'object') continue;
    const id = String(a.externalId || a.id || `asm-${i}`);
    const title = pickText(a.assumption, a.text, a.description, a.title, id) || id;
    const impact = pickText(a.impactIfInvalid, a.impact);
    rows.push(
      withGate1Provenance({
        logicalId: `risk:assumption:${id}`,
        id,
        section: 'risks',
        sectionLabel: SECTION_LABELS.risks,
        title,
        level: 'assumption',
        band: impact ? 'assumption' : '',
        status: impact ? 'CRITICAL' : String(a.status || 'READY').toUpperCase() || 'READY',
        summary: clip(
          [impact ? `if invalid: ${impact}` : '', a.baNote || ''].filter(Boolean).join(' · ')
        ),
      })
    );
  }

  const constraints = Array.isArray(pack?.constraints) ? pack.constraints : [];
  for (let i = 0; i < constraints.length; i += 1) {
    const c = constraints[i];
    if (!c || typeof c !== 'object') continue;
    const id = String(c.externalId || c.id || `cst-${i}`);
    const title = pickText(c.description, c.text, c.title, c.type, id) || id;
    rows.push(
      withGate1Provenance({
        logicalId: `risk:constraint:${id}`,
        id,
        section: 'risks',
        sectionLabel: SECTION_LABELS.risks,
        title,
        level: 'constraint',
        band: pickText(c.type, 'constraint'),
        status: 'READY',
        summary: clip([c.type || 'constraint', c.baNote || ''].filter(Boolean).join(' · ')),
      })
    );
  }

  return rows;
}

/** Architecture impact items from ArchitectureTool (already in HOW loop). */
function architectureRows(container) {
  const analysis =
    container?.analyses?.architectureImpact &&
    typeof container.analyses.architectureImpact === 'object'
      ? container.analyses.architectureImpact
      : {};
  const sectionSource = analysis.meta?.source || '';
  const items = Array.isArray(analysis.items)
    ? analysis.items
    : Array.isArray(analysis.components)
      ? analysis.components
      : [];
  return items
    .filter((it) => it && (it.impactId || it.id || it.component || it.name))
    .map((it, i) => {
      const id = String(it.impactId || it.id || `arch-${i}`);
      const layer = String(it.layer || '').trim();
      const impactLevel = String(it.impactLevel || it.level || '').trim();
      const title = it.component || it.name || id;
      const status = String(impactLevel || 'READY').toUpperCase();
      return withAiProvenance({
        logicalId: `arch:${id}`,
        id,
        section: 'architecture',
        sectionLabel: SECTION_LABELS.architecture,
        title,
        layer,
        impactLevel,
        status: ['HIGH', 'CRITICAL', 'BLOCKING'].includes(status) ? status : status || 'READY',
        summary: clip(
          [layer, impactLevel, ...(Array.isArray(it.apis) ? it.apis.slice(0, 2) : [])]
            .filter(Boolean)
            .join(' · ')
        ),
        provenance: it.provenance || undefined,
        origin: it.origin || undefined,
        source: it.source || sectionSource || undefined,
      });
    });
}

/**
 * Capacity — conflicts from Schedule + unassigned/overload signals from Matching.
 * Deterministic surface for Gate2 HITL (no new HOW tool in Step 2).
 */
function capacityRows(container, { t } = {}) {
  const resource =
    container?.resource && typeof container.resource === 'object' ? container.resource : {};
  const matching =
    resource.matching && typeof resource.matching === 'object' ? resource.matching : {};
  const taskById = new Map(
    (Array.isArray(container?.planning?.tasks) ? container.planning.tasks : [])
      .filter((t) => t && (t.id || t.taskId))
      .map((t) => [String(t.id || t.taskId), t])
  );

  const rows = [];
  const seen = new Set();

  const pushRow = (row) => {
    const key = String(row.logicalId || row.id || '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    rows.push(withAiProvenance(row));
  };

  const conflicts = Array.isArray(resource.capacityConflicts) ? resource.capacityConflicts : [];
  for (let i = 0; i < conflicts.length; i += 1) {
    const c = conflicts[i];
    if (!c || typeof c !== 'object') continue;
    const type = String(c.type || 'capacity_conflict').trim();
    const taskId = String(c.taskId || '').trim();
    const userId = String(c.userId || '').trim();
    const id = `${type}:${taskId || c.dateKey || c.estimatedEnd || i}`;
    const taskTitle = taskId
      ? taskById.get(taskId)?.name || taskById.get(taskId)?.title || taskId
      : '';
    const status =
      type === 'past_deadline' || c.critical === true
        ? 'CRITICAL'
        : type === 'zero_capacity_day' || type === 'unresolved_effort'
          ? 'OVERLOAD'
          : 'READY';
    pushRow({
      logicalId: `cap:${id}`,
      id,
      section: 'capacity',
      sectionLabel: SECTION_LABELS.capacity,
      title: taskTitle || type.replace(/_/g, ' '),
      conflictType: type,
      taskId: taskId || '',
      userId,
      dateKey: c.dateKey || c.deadline || c.estimatedEnd || '',
      remainingHours:
        c.remainingHours != null && Number.isFinite(Number(c.remainingHours))
          ? Number(c.remainingHours)
          : null,
      status,
      summary: clip(
        [
          type,
          userId ? `user=${userId}` : '',
          c.dateKey || '',
          c.remainingHours != null ? `${c.remainingHours}h left` : '',
          c.deadline ? `deadline ${c.deadline}` : '',
          c.estimatedEnd ? `end ${c.estimatedEnd}` : '',
          c.critical ? 'critical' : '',
        ]
          .filter(Boolean)
          .join(' · ')
      ),
    });
  }

  const unassigned = Array.isArray(matching.unassigned)
    ? matching.unassigned
    : Array.isArray(resource.unassigned)
      ? resource.unassigned
      : [];
  for (const u of unassigned) {
    const taskId = String(u?.taskId || u?.id || u || '').trim();
    if (!taskId) continue;
    const task = taskById.get(taskId);
    pushRow({
      logicalId: `cap:unassigned:${taskId}`,
      id: `unassigned:${taskId}`,
      section: 'capacity',
      sectionLabel: SECTION_LABELS.capacity,
      title: task?.name || task?.title || taskId,
      conflictType: 'unassigned',
      taskId,
      userId: '',
      status: 'UNASSIGNED',
      summary: tr(
        t,
        'requirements.gate2SynthUnassignedNoCandidate',
        'unassigned — no feasible candidate'
      ),
    });
  }

  const overloadList = Array.isArray(matching.overload) ? matching.overload : [];
  for (let i = 0; i < overloadList.length; i += 1) {
    const o = overloadList[i];
    const taskId = String(o?.taskId || '').trim();
    const userId = String(o?.userId || '').trim();
    if (!taskId && !userId) continue;
    const task = taskId ? taskById.get(taskId) : null;
    pushRow({
      logicalId: `cap:overload:${taskId || i}:${userId || 'x'}`,
      id: `overload:${taskId || i}:${userId || 'x'}`,
      section: 'capacity',
      sectionLabel: SECTION_LABELS.capacity,
      title: task?.name || task?.title || taskId || `Overload ${userId}`,
      conflictType: 'overload',
      taskId,
      userId,
      status: 'OVERLOAD',
      summary: clip(
        ['overload', userId ? `user=${userId}` : '', ...(Array.isArray(o?.reasons) ? o.reasons : [])]
          .filter(Boolean)
          .join(' · ')
      ),
    });
  }

  // Shortlist signals not yet folded into matching.overload
  const recommendations = Array.isArray(resource.recommendations) ? resource.recommendations : [];
  for (const rec of recommendations) {
    const taskId = String(rec?.taskId || '').trim();
    if (!taskId) continue;
    const cands = Array.isArray(rec.candidates) && rec.candidates.length
      ? rec.candidates
      : Array.isArray(rec.shortlist)
        ? rec.shortlist
        : [];
    for (const c of cands) {
      if (!c?.overload && c?.feasible !== false) continue;
      if (!c?.overload) continue;
      const userId = String(c.userId || '').trim();
      const task = taskById.get(taskId);
      pushRow({
        logicalId: `cap:overload:${taskId}:${userId || 'x'}`,
        id: `overload:${taskId}:${userId || 'x'}`,
        section: 'capacity',
        sectionLabel: SECTION_LABELS.capacity,
        title: task?.name || task?.title || taskId,
        conflictType: 'overload',
        taskId,
        userId,
        status: 'OVERLOAD',
        summary: clip(
          [
            'shortlist overload',
            userId ? `user=${userId}` : '',
            c.available_capacity != null ? `avail=${c.available_capacity}h` : '',
          ]
            .filter(Boolean)
            .join(' · ')
        ),
      });
    }
  }

  // Demand vs supply gaps from Matching capacityPlan (Step 5)
  const capacityPlan =
    resource.capacityPlan && typeof resource.capacityPlan === 'object'
      ? resource.capacityPlan
      : null;
  const roleGaps = Array.isArray(capacityPlan?.byRole) ? capacityPlan.byRole : [];
  for (const g of roleGaps) {
    const gap = Number(g?.gapHours) || 0;
    if (gap <= 0) continue;
    const roleKey = String(g.roleKey || '').trim() || 'role';
    pushRow({
      logicalId: `cap:gap:${roleKey}`,
      id: `gap:${roleKey}`,
      section: 'capacity',
      sectionLabel: SECTION_LABELS.capacity,
      title: roleKey,
      conflictType: 'demand_gap',
      taskId: '',
      userId: '',
      remainingHours: gap,
      status: 'OVERLOAD',
      summary: clip(
        [
          `gap ${gap}h`,
          g.demandHours != null ? `demand ${g.demandHours}h` : '',
          g.supplyHours != null ? `supply ${g.supplyHours}h` : '',
        ]
          .filter(Boolean)
          .join(' · ')
      ),
    });
  }

  const hasCapacitySignal =
    conflicts.length > 0 ||
    unassigned.length > 0 ||
    overloadList.length > 0 ||
    recommendations.length > 0 ||
    roleGaps.some((g) => Number(g?.gapHours) > 0) ||
    Boolean(resource.schedule) ||
    Boolean(matching && Object.keys(matching).length);

  if (!rows.length && hasCapacitySignal) {
    pushRow({
      logicalId: 'cap:ok',
      id: 'capacity-ok',
      section: 'capacity',
      sectionLabel: SECTION_LABELS.capacity,
      title: tr(t, 'requirements.gate2SynthNoCapacityConflicts', 'No capacity conflicts'),
      conflictType: 'ok',
      status: 'READY',
      summary: tr(
        t,
        'requirements.gate2SynthNoCapacityConflictsSummary',
        'No unassigned / overload / schedule capacity conflicts'
      ),
    });
  }

  return rows;
}

/**
 * Effort & Roles — from EffortTool / RoleSkill (planning.roles + effort.byRole).
 * Prefer role rows; if only byRole hours exist, synthesize role rows.
 */
function effortRolesRows(container, { t } = {}) {
  const roles = Array.isArray(container?.planning?.roles) ? container.planning.roles : [];
  const byRole =
    container?.planning?.effort?.byRole && typeof container.planning.effort.byRole === 'object'
      ? container.planning.effort.byRole
      : {};
  const byPhase =
    container?.planning?.effort?.byPhase && typeof container.planning.effort.byPhase === 'object'
      ? container.planning.effort.byPhase
      : null;
  const totalHours = container?.planning?.effort?.estimatedHoursTotal;
  const confidence = container?.planning?.effort?.confidence;
  const qualityDerived = container?.planning?.effort?.qualityPlanDerivedHours;

  const rows = [];
  const roleKeys = new Set();
  for (const r of roles) {
    const key = String(r?.roleKey || r?.role || '').trim();
    if (key) roleKeys.add(key);
  }
  for (const key of Object.keys(byRole)) {
    if (key) roleKeys.add(String(key).trim());
  }

  if (byPhase && typeof byPhase === 'object') {
    for (const phase of ['dev', 'qa', 'deploy', 'mgmt']) {
      const hours = Number(byPhase[phase]);
      if (!Number.isFinite(hours) || hours <= 0) continue;
      rows.push(
        withAiProvenance({
          logicalId: `effort_phase:${phase}`,
          id: `phase:${phase}`,
          section: 'effort_roles',
          sectionLabel: SECTION_LABELS.effort_roles,
          title: `Phase: ${phase}`,
          suggestedRoleKey: phase,
          effortHours: hours,
          roleSource: 'byPhase',
          status: 'READY',
          summary: clip(
            [
              `${hours}h`,
              phase === 'qa' && qualityDerived > 0 ? `incl. qualityPlan +${qualityDerived}h` : '',
            ]
              .filter(Boolean)
              .join(' · ')
          ),
        })
      );
    }
  }

  for (const [i, roleKey] of [...roleKeys].sort().entries()) {
    const meta = roles.find((r) => String(r?.roleKey || r?.role || '').trim() === roleKey) || {};
    const hours = byRole[roleKey] != null ? Number(byRole[roleKey]) : null;
    rows.push(
      withAiProvenance({
        logicalId: `effort_role:${roleKey}`,
        id: roleKey || `role-${i}`,
        section: 'effort_roles',
        sectionLabel: SECTION_LABELS.effort_roles,
        title: roleKey,
        suggestedRoleKey: roleKey,
        effortHours: Number.isFinite(hours) ? hours : null,
        roleSource: meta.source || '',
        status: 'READY',
        summary: clip(
          [
            meta.source ? `src=${meta.source}` : '',
            hours != null && Number.isFinite(hours) ? `${hours}h` : '',
            confidence != null ? `conf=${Number(confidence).toFixed(2)}` : '',
          ]
            .filter(Boolean)
            .join(' · ')
        ),
      })
    );
  }

  if (!rows.length && totalHours != null && Number.isFinite(Number(totalHours))) {
    rows.push(
      withAiProvenance({
        logicalId: 'effort_role:total',
        id: 'total',
        section: 'effort_roles',
        sectionLabel: SECTION_LABELS.effort_roles,
        title: tr(t, 'requirements.gate2SynthTotalEffort', 'Total effort'),
        effortHours: Number(totalHours),
        status: 'READY',
        summary: clip(
          [
            `${Number(totalHours)}h`,
            confidence != null ? `conf=${Number(confidence).toFixed(2)}` : '',
          ]
            .filter(Boolean)
            .join(' · ')
        ),
      })
    );
  }

  return rows;
}

/**
 * Sprint / Release — rows from planning.schedulePlan (ScheduleTool Step 6).
 */
function releaseRows(container, { t } = {}) {
  const plan =
    container?.planning?.schedulePlan && typeof container.planning.schedulePlan === 'object'
      ? container.planning.schedulePlan
      : null;
  if (!plan) return [];

  const rows = [];
  const deadlineConflict = Boolean(plan.meta?.deadlineConflict);
  const sprints = Array.isArray(plan.sprints) ? plan.sprints : [];
  const releases = Array.isArray(plan.releases) ? plan.releases : [];
  const milestones = Array.isArray(plan.milestones)
    ? plan.milestones
    : Array.isArray(container?.planning?.milestones)
      ? container.planning.milestones
      : [];

  if (deadlineConflict) {
    rows.push(
      withAiProvenance({
        logicalId: 'rel:deadline_conflict',
        id: 'deadline_conflict',
        section: 'releases',
        sectionLabel: SECTION_LABELS.releases,
        title: tr(t, 'requirements.gate2SynthDeadlineConflict', 'Deadline conflict'),
        kind: 'warning',
        startDate: plan.meta?.projectStart || null,
        estimatedEnd: plan.meta?.estimatedEnd || null,
        status: 'BLOCKING',
        summary: clip(
          [
            plan.meta?.deadline ? `deadline ${plan.meta.deadline}` : '',
            plan.meta?.estimatedEnd ? `est. end ${plan.meta.estimatedEnd}` : '',
          ]
            .filter(Boolean)
            .join(' · ')
        ),
      })
    );
  }

  for (const r of releases) {
    if (!r || typeof r !== 'object') continue;
    const id = String(r.id || '').trim();
    if (!id) continue;
    const sprintIds = Array.isArray(r.sprintIds) ? r.sprintIds : [];
    rows.push(
      withAiProvenance({
        logicalId: `rel:release:${id}`,
        id,
        section: 'releases',
        sectionLabel: SECTION_LABELS.releases,
        title: r.name || id,
        kind: 'release',
        startDate: null,
        estimatedEnd: r.estimatedEnd || null,
        effortHours: r.effortHours != null ? Number(r.effortHours) : null,
        taskCount: r.taskCount != null ? Number(r.taskCount) : null,
        status: r.estimatedEnd ? 'READY' : 'DRAFT',
        summary: clip(
          [
            r.estimatedEnd ? `end ${r.estimatedEnd}` : '',
            sprintIds.length ? `${sprintIds.length} sprints` : '',
            r.taskCount != null ? `${r.taskCount} tasks` : '',
            r.effortHours != null ? `${r.effortHours}h` : '',
          ]
            .filter(Boolean)
            .join(' · ')
        ),
      })
    );
  }

  for (const s of sprints) {
    if (!s || typeof s !== 'object') continue;
    const id = String(s.id || '').trim();
    if (!id) continue;
    const taskIds = Array.isArray(s.taskIds) ? s.taskIds : [];
    rows.push(
      withAiProvenance({
        logicalId: `rel:sprint:${id}`,
        id,
        section: 'releases',
        sectionLabel: SECTION_LABELS.releases,
        title: s.name || id,
        kind: 'sprint',
        startDate: s.startDate || null,
        estimatedEnd: s.endDate || null,
        effortHours: s.effortHours != null ? Number(s.effortHours) : null,
        taskCount: taskIds.length,
        status: 'READY',
        summary: clip(
          [
            s.startDate && s.endDate ? `${s.startDate} → ${s.endDate}` : '',
            `${taskIds.length} tasks`,
            s.effortHours != null ? `${s.effortHours}h` : '',
          ]
            .filter(Boolean)
            .join(' · ')
        ),
      })
    );
  }

  for (const m of milestones) {
    if (!m || typeof m !== 'object') continue;
    const id = String(m.id || m.taskId || '').trim();
    if (!id) continue;
    const end = m.estimatedEnd || m.dateKey || null;
    rows.push(
      withAiProvenance({
        logicalId: `rel:ms:${id}`,
        id,
        section: 'releases',
        sectionLabel: SECTION_LABELS.releases,
        title: m.name || id,
        kind: 'milestone',
        startDate: null,
        estimatedEnd: end,
        status: end ? 'READY' : 'DRAFT',
        summary: clip(
          [end ? `date ${end}` : '', m.taskId ? `task ${m.taskId}` : '']
            .filter(Boolean)
            .join(' · ')
        ),
      })
    );
  }

  return rows;
}

/**
 * Deploy Plan — rows from planning.deployPlan (DeployPlanTool Step 7).
 */
function deployRows(container, { t } = {}) {
  const dp =
    container?.planning?.deployPlan && typeof container.planning.deployPlan === 'object'
      ? container.planning.deployPlan
      : null;
  if (!dp) return [];

  const rows = [];
  const sectionSource = dp.meta?.source || '';
  const stamp = (row) =>
    withAiProvenance({
      ...row,
      source: row.source || sectionSource || undefined,
    });
  const mode = dp.releaseStrategy?.mode || '';
  const goLive = dp.goLive?.estimatedEnd || null;

  rows.push(
    stamp({
      logicalId: 'deploy:strategy',
      id: 'strategy',
      section: 'deploy',
      sectionLabel: SECTION_LABELS.deploy,
      title: tr(t, 'requirements.gate2SynthReleaseStrategy', 'Release strategy'),
      kind: 'strategy',
      level: mode || '—',
      status: mode ? 'READY' : 'DRAFT',
      summary: clip(
        [
          mode ? `mode ${mode}` : '',
          goLive ? `go-live ${goLive}` : '',
          dp.releaseStrategy?.target ? `target ${dp.releaseStrategy.target}` : '',
          tr(t, 'requirements.gate2SynthPlanOnlyNoCi', 'plan-only (no in-app CI)'),
        ]
          .filter(Boolean)
          .join(' · ')
      ),
    })
  );

  for (const env of Array.isArray(dp.envMatrix) ? dp.envMatrix : []) {
    if (!env || typeof env !== 'object') continue;
    const id = String(env.key || env.name || '').trim();
    if (!id) continue;
    rows.push(
      stamp({
        logicalId: `deploy:env:${id}`,
        id,
        section: 'deploy',
        sectionLabel: SECTION_LABELS.deploy,
        title: env.name || id,
        kind: 'env',
        level: id,
        status: env.urlTbd ? 'TBD' : 'READY',
        summary: clip(
          [
            env.purpose || '',
            env.url || (env.tbdReason ? `TBD: ${env.tbdReason}` : 'URL TBD'),
          ]
            .filter(Boolean)
            .join(' · ')
        ),
      })
    );
  }

  const rollbackSteps = Array.isArray(dp.rollbackPlan?.steps) ? dp.rollbackPlan.steps : [];
  if (rollbackSteps.length) {
    rows.push(
      stamp({
        logicalId: 'deploy:rollback',
        id: 'rollback',
        section: 'deploy',
        sectionLabel: SECTION_LABELS.deploy,
        title: tr(t, 'requirements.gate2SynthRollbackPlan', 'Rollback plan'),
        kind: 'rollback',
        level: dp.rollbackPlan?.ownerRole || 'devops_engineer',
        status: 'READY',
        summary: clip(
          `${rollbackSteps.length} steps · ${rollbackSteps.slice(0, 2).join('; ')}`,
          200
        ),
      })
    );
  }

  const oos = Array.isArray(dp.outOfScopeInApp) ? dp.outOfScopeInApp : [];
  if (oos.length) {
    rows.push(
      stamp({
        logicalId: 'deploy:oos',
        id: 'out_of_scope',
        section: 'deploy',
        sectionLabel: SECTION_LABELS.deploy,
        title: tr(t, 'requirements.gate2SynthOutOfScopeInApp', 'Out of scope in-app'),
        kind: 'constraint',
        level: 'oos',
        status: 'READY',
        summary: clip(oos.join(', '), 200),
      })
    );
  }

  for (const chk of Array.isArray(dp.phase4Checklist) ? dp.phase4Checklist : []) {
    if (!chk || typeof chk !== 'object') continue;
    const id = String(chk.id || '').trim();
    if (!id) continue;
    rows.push(
      stamp({
        logicalId: `deploy:chk:${id}`,
        id,
        section: 'deploy',
        sectionLabel: SECTION_LABELS.deploy,
        title: chk.title || id,
        kind: 'checklist',
        level: chk.env || '—',
        status: 'READY',
        summary: clip(
          [
            chk.env ? `env ${chk.env}` : '',
            tr(t, 'requirements.gate2SynthPhase4Checklist', 'Phase 4 checklist'),
          ]
            .filter(Boolean)
            .join(' · ')
        ),
      })
    );
  }

  return rows;
}

/**
 * Quality / Testing — rows from planning.qualityPlan (QualityPlanTool).
 * Prefer catalogPlan + nfrCoverage; strategy/levels as summary rows when present.
 */
function qualityRows(container, { t } = {}) {
  const qp =
    container?.planning?.qualityPlan && typeof container.planning.qualityPlan === 'object'
      ? container.planning.qualityPlan
      : null;
  if (!qp) return [];

  const rows = [];
  const sectionSource = qp.meta?.source || '';
  const stamp = (row) =>
    withAiProvenance({
      ...row,
      source: row.source || sectionSource || undefined,
    });
  const levels = Array.isArray(qp.levels) ? qp.levels : [];
  if (levels.length) {
    const levelNames = levels.map((l) => l.level).filter(Boolean).join(', ');
    const pyramid = qp.strategy?.pyramid || {};
    rows.push(
      stamp({
        logicalId: 'quality:strategy',
        id: 'strategy',
        section: 'quality',
        sectionLabel: SECTION_LABELS.quality,
        title: tr(t, 'requirements.gate2SynthTestStrategy', 'Test strategy'),
        level: 'strategy',
        sourceUcKey: '',
        status: 'READY',
        summary: clip(
          [
            levelNames,
            pyramid.unitPct != null ? `unit ${Math.round(Number(pyramid.unitPct) * 100)}%` : '',
            qp.strategy?.automationTargetPct != null
              ? `auto ${Math.round(Number(qp.strategy.automationTargetPct) * 100)}%`
              : '',
          ]
            .filter(Boolean)
            .join(' · ')
        ),
      })
    );
  }

  const catalog = Array.isArray(qp.catalogPlan) ? qp.catalogPlan : [];
  for (let i = 0; i < catalog.length; i += 1) {
    const tc = catalog[i];
    if (!tc || typeof tc !== 'object') continue;
    const id = String(tc.tcKey || `tc-${i}`);
    rows.push(
      stamp({
        logicalId: `quality:tc:${id}`,
        id,
        section: 'quality',
        sectionLabel: SECTION_LABELS.quality,
        title: tc.title || id,
        level: tc.level || '',
        sourceUcKey: tc.sourceUcKey || '',
        linkedWbsTaskId: tc.linkedWbsTaskId || '',
        status: tc.sourceUcKey ? 'READY' : 'CRITICAL',
        summary: clip(
          [
            tc.level,
            tc.sourceUcKey ? `UC ${tc.sourceUcKey}` : 'no sourceUcKey',
            tc.linkedWbsTaskId ? `task ${tc.linkedWbsTaskId}` : '',
            tc.automate === false ? 'manual' : 'automate',
          ]
            .filter(Boolean)
            .join(' · ')
        ),
      })
    );
  }

  const nfrCov = Array.isArray(qp.nfrCoverage) ? qp.nfrCoverage : [];
  for (let i = 0; i < nfrCov.length; i += 1) {
    const n = nfrCov[i];
    if (!n || typeof n !== 'object') continue;
    const id = String(n.nfrId || `nfr-${i}`);
    rows.push(
      stamp({
        logicalId: `quality:nfr:${id}`,
        id,
        section: 'quality',
        sectionLabel: SECTION_LABELS.quality,
        title: n.requirement || id,
        level: n.testLevel || 'nfr',
        sourceUcKey: '',
        status: String(n.priority || '').toLowerCase() === 'high' ? 'HIGH' : 'READY',
        summary: clip(
          [n.category, n.technique, n.passCriteria ? `pass: ${n.passCriteria}` : '']
            .filter(Boolean)
            .join(' · ')
        ),
      })
    );
  }

  const openQs = Array.isArray(qp.openQuestions) ? qp.openQuestions : [];
  for (let i = 0; i < openQs.length; i += 1) {
    const q = openQs[i];
    if (!q) continue;
    const id = String(q.id || `oq-${i}`);
    rows.push(
      stamp({
        logicalId: `quality:oq:${id}`,
        id,
        section: 'quality',
        sectionLabel: SECTION_LABELS.quality,
        title: q.topic || id,
        level: 'open_question',
        status: 'CRITICAL',
        summary: clip(q.message || ''),
      })
    );
  }

  return rows;
}

/**
 * @param {{ pack?: object, container?: object, nameByUserId?: Record<string, string>, t?: function }} input
 */
export function buildGate2ProposalItems({
  pack,
  container: containerIn,
  nameByUserId = {},
  t,
} = {}) {
  const container = containerIn || containerOf(pack);
  const bySection = {};
  const items = [];
  const loc = { t };
  const builders = {
    scope: (_c, p) => scopeRows(p),
    tasks: taskRows,
    dependencies: dependencyRows,
    architecture: architectureRows,
    effort_roles: (c) => effortRolesRows(c, loc),
    assignments: (c) => assignmentRows(c, { nameByUserId, t }),
    capacity: (c) => capacityRows(c, loc),
    schedule: scheduleRows,
    releases: (c) => releaseRows(c, loc),
    risks: (c, p) => riskRows(c, p),
    quality: (c) => qualityRows(c, loc),
    deploy: (c) => deployRows(c, loc),
  };
  for (const key of SECTION_ORDER) {
    const rows = builders[key](container, pack);
    const label = localizeGate2SectionLabel(t, key);
    for (const row of rows) {
      if (row && typeof row === 'object') row.sectionLabel = label;
    }
    bySection[key] = rows;
    items.push(...rows);
  }
  const proposalSections = SECTION_ORDER.map((key) => {
    const rows = bySection[key] || [];
    const conflictCount = rows.filter((r) =>
      ['BLOCKING', 'OVERLOAD', 'CRITICAL', 'UNASSIGNED', 'HIGH'].includes(
        String(r.status || '').toUpperCase()
      )
    ).length;
    return {
      key,
      label: localizeGate2SectionLabel(t, key),
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

export { SECTION_ORDER, SECTION_LABELS, sortWbsTreeForGate2, WBS_LEVEL_ORDER };

export default buildGate2ProposalItems;
