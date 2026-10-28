/**
 * Build Gate2 Planning Review rows from HOW planning container (mirror Gate1 sections).
 * Synthetic / empty-state copy (no AI proposal yet) follows account UI locale via optional `t`.
 */

import { listDependencyDisplayItems } from './gate2/dependencyDisplay.js';
import { pickHighestReadyCandidate } from './gate2/assignmentCatalogEdit.js';
import { enrichAssignmentRowsWithSchedule } from './gate2/assignmentScheduleTrust.js';
import {
  readSprintPlanningMeta,
  gate2StatusFromSprintExecution,
} from './gate2/gate2SprintPlanningStatus.js';

/** Gate2 / Monitor tabs — Lịch folded into assignments (RULE-01). */
const SECTION_ORDER = [
  'scope',
  'tasks',
  'dependencies',
  'assignments',
  'releases',
  'risks',
  'quality',
];

const SECTION_LABELS = {
  scope: 'Scope & Objectives',
  tasks: 'WBS / Tasks',
  dependencies: 'Dependencies',
  assignments: 'Assignments',
  schedule: 'Schedule',
  releases: 'Sprint / Release',
  risks: 'Risks / Assumptions',
  quality: 'Quality / Testing',
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

/** generateJson text — column "Nguồn" = AI đề xuất. */
const PROVENANCE_AI = Object.freeze({ type: 'AI_SYNTHESIS', producer: 'how_engine' });
/** Deterministic HOW calculation — column "Nguồn" = Heuristic. */
const PROVENANCE_HEURISTIC = Object.freeze({ type: 'HEURISTIC', producer: 'how_heuristic' });
/** Gate1-approved pack sheets rolled into Gate2 (Scope / Assumptions / Constraints). */
const PROVENANCE_GATE1 = Object.freeze({
  type: 'GATE1_APPROVED',
  producer: 'requirement_pack',
});

const PRESERVED_PROVENANCE_TYPES = new Set([
  'GATE1_APPROVED',
  'EMPLOYEE',
  'HUMAN',
  'MANUAL',
  'PM',
  'PM_ADDED',
  'STAFF',
]);

/** True when the displayed text was produced by generateJson, not a numeric/rule engine. */
function isLlmGeneratedTextSource(value) {
  const source = String(value || '').trim().toLowerCase();
  if (!source) return false;
  if (
    source.includes('failed') ||
    source.includes('invalid') ||
    source.includes('error') ||
    source.includes('skipped')
  ) {
    return false;
  }
  if (source === 'llm' || source === 'fact_llm' || source === 'sprint_how') return true;
  return source.startsWith('llm') || source.endsWith('_llm') || source.includes('_llm_');
}

const SPRINT_HOW_KINDS = new Set(['sprint', 'release', 'sprint_planning_status']);

/**
 * Stamp Gate2 "Nguồn".
 * AI đề xuất only when generateJson wrote the text. Heuristic otherwise.
 * Sprint/Release rows never Heuristic — Sprint HOW (LLM) owns allocation.
 * Gate1 / nhân viên stamps are left as-is.
 */
function withAiProvenance(row, extra = null) {
  const merged = extra ? { ...row, ...extra } : { ...row };
  const existing = merged?.provenance || merged?.origin;
  const existingType = String(existing?.type || '').trim().toUpperCase();
  if (PRESERVED_PROVENANCE_TYPES.has(existingType)) return merged;

  const kind = String(merged.kind || '').trim();
  const textSource = String(merged.textSource || '').trim().toLowerCase();
  const explicit = String(merged.source || merged.dataSource || '').trim();
  const sprintHow =
    SPRINT_HOW_KINDS.has(kind) || textSource === 'sprint_how' || textSource === 'llm';
  const llm = sprintHow
    ? true
    : textSource === 'cpm'
      ? false
      : explicit
        ? isLlmGeneratedTextSource(explicit)
        : isLlmGeneratedTextSource(existing?.source) ||
          isLlmGeneratedTextSource(existing?.producer);

  if (llm) {
    return {
      ...merged,
      provenance: {
        ...PROVENANCE_AI,
        ...(sprintHow && textSource !== 'llm' ? { producer: 'sprint_how' } : {}),
      },
      origin: { type: 'AI_SYNTHESIS' },
    };
  }
  return {
    ...merged,
    source: merged.source || 'heuristic',
    provenance: { ...PROVENANCE_HEURISTIC },
    origin: { type: 'HEURISTIC' },
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

/**
 * Merge planning.backlog containers with planning.tasks leaves (Gate2 WBS tree).
 * Backlog is SoT for Epic/Feature/Story; tasks hold LLM leaves (+ optional materialize).
 */
function mergeBacklogAndTasks(container) {
  const backlog = container?.planning?.backlog || null;
  const tasks = Array.isArray(container?.planning?.tasks)
    ? container.planning.tasks
    : [];
  if (!backlog || typeof backlog !== 'object') return tasks;

  const byId = new Map();
  const pushNode = (n, level) => {
    if (!n || !(n.id || n.taskId)) return;
    const id = String(n.id || n.taskId);
    if (byId.has(id)) return;
    byId.set(id, {
      ...n,
      id,
      level: String(n.level || level || 'task').toLowerCase(),
      name: n.name || n.title || id,
      parentId:
        n.parentId != null && n.parentId !== '' ? String(n.parentId) : null,
    });
  };

  for (const e of backlog.epics || []) pushNode(e, 'epic');
  for (const f of backlog.features || []) pushNode(f, 'feature');
  for (const s of backlog.stories || []) pushNode(s, 'story');
  for (const t of tasks) {
    const id = String(t?.id || t?.taskId || '');
    if (!id) continue;
    // Prefer task row when already materialize (same id); keep leaf fields
    byId.set(id, {
      ...byId.get(id),
      ...t,
      id,
      level: String(t.level || byId.get(id)?.level || 'task').toLowerCase(),
      name: t.name || t.title || byId.get(id)?.name || id,
      parentId:
        t.parentId != null && t.parentId !== ''
          ? String(t.parentId)
          : byId.get(id)?.parentId || null,
    });
  }
  return [...byId.values()];
}

function readWbsMeta(container) {
  const meta =
    container?.planning?.wbs?.meta && typeof container.planning.wbs.meta === 'object'
      ? container.planning.wbs.meta
      : {};
  const unresolvedStoryIds = Array.isArray(meta.unresolvedStoryIds)
    ? meta.unresolvedStoryIds.map((x) => String(x)).filter(Boolean)
    : [];
  const uncoveredFrIds = Array.isArray(meta.uncoveredFrIds)
    ? meta.uncoveredFrIds.map((x) => String(x)).filter(Boolean)
    : [];
  const uncoveredAcKeys = Array.isArray(meta.uncoveredAcKeys)
    ? meta.uncoveredAcKeys.map((x) => String(x)).filter(Boolean)
    : [];
  const duplicateLeafIds = Array.isArray(meta.duplicateLeafIds)
    ? meta.duplicateLeafIds.map((x) => String(x)).filter(Boolean)
    : [];
  const epicsWithoutStories = Array.isArray(meta.epicsWithoutStories)
    ? meta.epicsWithoutStories.map((x) => String(x)).filter(Boolean)
    : [];
  return {
    decompositionOutcome: String(meta.decompositionOutcome || '').toLowerCase() || null,
    unresolvedStoryIds,
    uncoveredFrIds,
    uncoveredAcKeys,
    duplicateLeafIds,
    epicsWithoutStories,
    uniqueLeafCount:
      meta.uniqueLeafCount != null ? Number(meta.uniqueLeafCount) : null,
    leafCount: meta.leafCount != null ? Number(meta.leafCount) : null,
    source: String(meta.source || '').trim(),
    fallbackReason: String(meta.fallbackReason || '').trim(),
  };
}

/** Epic có trong SoT nhưng chưa có Story — không phân rã được; phải bổ sung ở WHAT. */
function epicMissingStoriesStubRows(container, wbsMeta) {
  const ids = wbsMeta?.epicsWithoutStories || [];
  const epicOnly =
    String(wbsMeta?.fallbackReason || '') === 'epic_only_backlog_needs_what';
  const epics = Array.isArray(container?.planning?.backlog?.epics)
    ? container.planning.backlog.epics
    : Array.isArray(container?.analyses?.approvedBacklogStructure?.epics)
      ? container.analyses.approvedBacklogStructure.epics
      : [];
  const byId = new Map(epics.filter((e) => e?.id).map((e) => [String(e.id), e]));
  const list = ids.length
    ? ids
    : epicOnly
      ? epics.map((e) => String(e.id)).filter(Boolean)
      : [];
  return list.map((eid, i) => {
    const epic = byId.get(String(eid)) || {};
    return withGate1Provenance({
      logicalId: `task:epic-needs-stories:${eid}`,
      id: `epic-needs-stories:${eid}`,
      section: 'tasks',
      sectionLabel: SECTION_LABELS.tasks,
      title: (() => {
        const id = String(eid || '');
        const raw = String(epic.name || epic.title || '').trim();
        const cleanId = id.replace(/^c\d+-/i, '') || id;
        if (!raw || raw === id || raw === cleanId) return cleanId;
        if (/^c\d+-/i.test(raw)) return raw.replace(/^c\d+-/i, '') || raw;
        return raw;
      })(),
      level: 'epic',
      parentId: null,
      depth: 0,
      sortOrder: 9_000 + i,
      childIds: [],
      hasChildren: false,
      isWbsContainer: true,
      effortRolledUp: false,
      suggestedRoleKey: 'business_analyst',
      effortHours: 0,
      startDate: null,
      dueDate: null,
      area: '',
      deliverable: '',
      duplicateOf: null,
      missingStories: true,
      wbsUnresolved: true,
      status: 'NEEDS_STORIES',
      summary: clip(['epic_missing_stories', 'fix_at_WHAT', eid].join(' · ')),
    });
  });
}

function taskRows(container) {
  const wbsMeta = readWbsMeta(container);
  const tasks = mergeBacklogAndTasks(container);
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
        deliverable: t.deliverable || '',
        duplicateOf: t.duplicateOf ? String(t.duplicateOf) : null,
        leveled: Boolean(t.leveled),
        provenance: t.provenance || undefined,
        origin: t.origin || undefined,
        source: t.source || undefined,
      };
    });

  const treeRows = sortWbsTreeForGate2(mapped).map((t) => {
    const ownSource = String(t.source || '').trim();
    const leaf = isLeafTaskRow(t);
    const base = {
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
      deliverable: t.deliverable || '',
      duplicateOf: t.duplicateOf || null,
      status: t.duplicateOf
        ? 'DUPLICATE'
        : t.leveled
          ? 'LEVELED'
          : 'READY',
      summary: clip(
        [
          t.level,
          t.area || '',
          t.suggestedRoleKey,
          t.effortHours != null ? `${t.effortHours}h` : '',
          t.deliverable || '',
          t.duplicateOf ? `dup→${t.duplicateOf}` : '',
          t.startDate || '',
          t.dueDate || '',
        ]
          .filter(Boolean)
          .join(' · ')
      ),
      provenance: t.provenance || undefined,
      origin: t.origin || undefined,
      source: ownSource || (leaf ? wbsMeta.source || '' : ''),
    };
    if (!leaf && !isLlmGeneratedTextSource(ownSource)) return withGate1Provenance(base);
    return withAiProvenance(base);
  });

  // Do not invent Heuristic/UNRESOLVED stub rows for unresolvedStoryIds —
  // that was a FE fallback fake WBS. Gaps stay in wbs.meta (informational only).
  return [...treeRows, ...epicMissingStoriesStubRows(container, wbsMeta)];
}

function dependencyRows(container) {
  const { items } = listDependencyDisplayItems(container);
  return items.map((d) =>
    withAiProvenance({
      logicalId: `dep:${d.id}`,
      id: d.id,
      section: 'dependencies',
      sectionLabel: SECTION_LABELS.dependencies,
      title: d.title,
      summary: d.reason || d.summary,
      reason: d.reason,
      relationLabel: d.relationLabel,
      predecessorTaskId: d.predecessorTaskId,
      successorTaskId: d.successorTaskId,
      predecessorName: d.predecessorName,
      successorName: d.successorName,
      depType: d.depType || d.relationship || 'FS',
      relationship: d.relationship,
      blockingScope: d.blockingScope,
      canWorkInParallel: d.canWorkInParallel,
      parallelCondition: d.parallelCondition,
      parallelLabel: d.parallelLabel,
      requiredInputLabel: d.requiredInputLabel,
      requiredOutput: d.requiredOutput,
      requiredOutputLabel: d.requiredOutputLabel,
      requiredAt: d.requiredAt,
      basis: d.basis,
      assumptions: d.assumptions,
      schedulable: Boolean(d.schedulable),
      scheduleLabel: d.scheduleLabel,
      decisionStatus: d.decisionStatus,
      critical: Boolean(d.critical),
      source: d.source || '',
      status: d.decisionStatus || 'PROPOSED',
      provenance: undefined,
      origin: undefined,
    })
  );
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

function candidateOptionsFromShortlist(shortlist, nameByUserId) {
  const out = [];
  const seen = new Set();
  for (const candidate of shortlist || []) {
    if (!candidate?.userId || candidate.feasible === false) continue;
    const userId = String(candidate.userId).trim();
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    const label = resolveAssigneeLabel(userId, null, candidate, nameByUserId);
    const available = candidate.availableHours ?? candidate.available_capacity;
    out.push({
      userId,
      displayName: label === '—' ? '' : label,
      score: candidate.score != null && Number.isFinite(Number(candidate.score)) ? Number(candidate.score) : null,
      availableHours: available != null && Number.isFinite(Number(available)) ? Number(available) : null,
    });
  }
  return out;
}

function makeAssignmentRow({
  logicalId,
  id,
  title,
  assignee,
  assigneeUserId,
  suggestedRoleKey,
  effortHours,
  score,
  availableHours,
  overload,
  status,
  summary,
  taskIds,
  candidateOptions,
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
    suggestedRoleKey: suggestedRoleKey || '',
    taskIds: Array.isArray(taskIds) ? taskIds.map(String) : [],
    candidateOptions: Array.isArray(candidateOptions) ? candidateOptions : [],
    effortHours: effortHours != null ? effortHours : null,
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

function isRawUserIdLabel(label, userId) {
  const text = String(label || '').trim();
  if (!text) return false;
  const id = String(userId || '').trim();
  if (id && text === id) return true;
  return /^[a-f0-9]{24}$/i.test(text);
}

function resolveAssigneeLabel(userId, picked, top, nameByUserId = {}) {
  const id = String(userId || '').trim();
  const fromMap = id ? String(nameByUserId[id] || '').trim() : '';
  if (fromMap && !isRawUserIdLabel(fromMap, id)) return fromMap;
  const fromPayload = String(picked?.displayName || top?.displayName || '').trim();
  if (fromPayload && !isRawUserIdLabel(fromPayload, id)) return fromPayload;
  return '—';
}

/** Prefer the person already assigned. Otherwise the highest score who can take the effort. */
function resolveSuggestedCandidate(shortlist = [], assignment = null, effortHours = null) {
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
  return pickHighestReadyCandidate(list, effortHours);
}

function assignmentRows(container, { nameByUserId = {}, t, pack = null } = {}) {
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
    const task = taskById.get(taskId);
    // Skip stale matching rows (old WBS ids) — otherwise Gate2 shows bare taskId as title.
    if (!task) continue;
    const shortlist = Array.isArray(rec.shortlist) ? rec.shortlist : [];
    const picked = finalAssign.get(taskId) || null;
    const effortValue =
      task?.effortHours != null && Number.isFinite(Number(task.effortHours))
        ? Number(task.effortHours)
        : null;
    const suggested = resolveSuggestedCandidate(shortlist, picked, effortValue);
    const userId = String(suggested?.userId || '').trim();
    const displayName = resolveAssigneeLabel(userId, picked, suggested, nameByUserId);
    const availableRaw =
      picked?.available_capacity ?? suggested?.available_capacity ?? suggested?.availableHours;
    const availableValue =
      availableRaw != null && Number.isFinite(Number(availableRaw)) ? Number(availableRaw) : null;
    const overload =
      availableValue != null && effortValue != null && effortValue > 0
        ? effortValue > availableValue
        : Boolean(suggested?.overload);
    const branchId = branchAnchorId(taskId, taskById);
    members.push({
      taskId,
      branchId,
      branchTitle: taskById.get(branchId)?.name || branchId,
      taskTitle: task.name || task.title || taskId,
      suggestedRoleKey: task?.suggestedRoleKey || '',
      effortHours: effortValue,
      shortlistLen: shortlist.length,
      multiAssignee: shortlist.length >= 2,
      userId,
      displayName,
      candidateOptions: candidateOptionsFromShortlist(shortlist, nameByUserId),
      score:
        suggested?.score != null && Number.isFinite(Number(suggested.score))
          ? Number(suggested.score)
          : picked?.score != null && Number.isFinite(Number(picked.score))
            ? Number(picked.score)
            : null,
      availableHours: availableValue,
      overload,
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
          suggestedRoleKey: g0.suggestedRoleKey || '',
          taskIds: group.map((g) => g.taskId),
          candidateOptions: group.flatMap((g) => g.candidateOptions || []),
          effortHours: group.reduce((n, g) => n + (Number(g.effortHours) || 0), 0) || null,
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
          suggestedRoleKey: g.suggestedRoleKey || '',
          taskIds: [g.taskId],
          candidateOptions: g.candidateOptions || [],
          effortHours: g.effortHours,
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

  for (const g of members) {
    if (g.userId) continue;
    const row = rows.find((item) => item.id === g.taskId || item.logicalId === `asg:${g.taskId}`);
    if (!row || row.assigneeUserId) continue;
    row.summary = tr(t, 'requirements.gate2SynthUnassigned', 'unassigned');
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
    if (!task) continue; // skip stale matching ids
    const picked = finalAssign.get(taskId) || null;
    const pickedId = String(picked?.userId || '').trim();
    if (pickedId) {
      const effort = Number(task?.effortHours);
      const available =
        picked.available_capacity != null ? Number(picked.available_capacity) : null;
      const overload =
        picked.overload === true ||
        (Number.isFinite(available) && Number.isFinite(effort) && effort > 0 && effort > available);
      rows.push(
        makeAssignmentRow({
          logicalId: `asg:${taskId}`,
          id: taskId,
          title: task.name || task.title || taskId,
          assignee: resolveAssigneeLabel(pickedId, picked, null, nameByUserId),
          assigneeUserId: pickedId,
          suggestedRoleKey: task?.suggestedRoleKey || '',
          taskIds: [taskId],
          effortHours: Number.isFinite(effort) ? effort : null,
          score: picked.score != null && Number.isFinite(Number(picked.score)) ? Number(picked.score) : null,
          availableHours: Number.isFinite(available) ? available : null,
          overload,
          status: overload ? 'OVERLOAD' : 'READY',
          summary: resolveAssigneeLabel(pickedId, picked, null, nameByUserId),
        })
      );
      coveredTaskIds.add(taskId);
      continue;
    }
    rows.push(
      makeAssignmentRow({
        logicalId: `asg:${taskId}`,
        id: taskId,
        title: task.name || task.title || taskId,
        assignee: '—',
        taskIds: [taskId],
        suggestedRoleKey: task?.suggestedRoleKey || '',
        score: null,
        availableHours: null,
        overload: false,
        status: 'UNASSIGNED',
        summary: tr(t, 'requirements.gate2SynthUnassigned', 'unassigned'),
      })
    );
    coveredTaskIds.add(taskId);
  }

  // Current WBS leaves with no matching row (stale recs filtered) → show UNASSIGNED, not silent.
  for (const [taskId, task] of taskById) {
    if (!isLeafTaskRow(task) || coveredTaskIds.has(taskId)) continue;
    const picked = finalAssign.get(taskId) || null;
    const pickedId = String(picked?.userId || '').trim();
    // Only accept assignment if it maps to a real current leaf (already in taskById).
    if (pickedId && taskById.has(taskId)) {
      rows.push(
        makeAssignmentRow({
          logicalId: `asg:${taskId}`,
          id: taskId,
          title: task.name || task.title || taskId,
          assignee: resolveAssigneeLabel(pickedId, picked, null, nameByUserId),
          assigneeUserId: pickedId,
          suggestedRoleKey: task.suggestedRoleKey || '',
          taskIds: [taskId],
          effortHours: task.effortHours != null ? Number(task.effortHours) : null,
          score: picked.score != null && Number.isFinite(Number(picked.score)) ? Number(picked.score) : null,
          status: 'READY',
          summary: resolveAssigneeLabel(pickedId, picked, null, nameByUserId),
        })
      );
      continue;
    }
    rows.push(
      makeAssignmentRow({
        logicalId: `asg:${taskId}`,
        id: taskId,
        title: task.name || task.title || taskId,
        assignee: '—',
        taskIds: [taskId],
        suggestedRoleKey: task.suggestedRoleKey || '',
        effortHours: task.effortHours != null ? Number(task.effortHours) : null,
        score: null,
        status: 'UNASSIGNED',
        summary: tr(t, 'requirements.gate2SynthUnassigned', 'unassigned'),
      })
    );
  }
  const projectStart =
    pack?.overview?.startDate ||
    pack?.calendar?.startDate ||
    container?.planning?.completion?.projectStart ||
    null;
  return enrichAssignmentRowsWithSchedule(rows, container, { projectStart });
}

function isoDay(value) {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function dateSpanByTask(schedule) {
  const map = new Map();
  for (const row of Array.isArray(schedule) ? schedule : []) {
    const id = String(row?.taskId || '').trim();
    const day = isoDay(row?.dateKey);
    if (!id || !day) continue;
    const current = map.get(id);
    if (!current) {
      map.set(id, { startDate: day, dueDate: day });
      continue;
    }
    if (day < current.startDate) current.startDate = day;
    if (day > current.dueDate) current.dueDate = day;
  }
  return map;
}

function scheduleRows(container) {
  const tasks = Array.isArray(container?.planning?.tasks) ? container.planning.tasks : [];
  const scheduleList = Array.isArray(container?.resource?.schedule)
    ? container.resource.schedule
    : [];
  const spans = dateSpanByTask(scheduleList);
  const scheduleUserByTask = new Map();
  for (const row of scheduleList) {
    const tid = String(row?.taskId || '').trim();
    if (!tid || scheduleUserByTask.has(tid)) continue;
    scheduleUserByTask.set(tid, String(row?.userId || '').trim());
  }
  const rows = [];
  for (const task of tasks) {
    const id = String(task?.id || task?.taskId || '').trim();
    if (!id || !isLeafTaskRow(task)) continue;
    const span = spans.get(id);
    const startDate = isoDay(task.startDate) || span?.startDate || '';
    const dueDate = isoDay(task.dueDate) || span?.dueDate || '';
    if (!startDate && !dueDate) continue;
    const effortHours =
      task.effortHours != null && Number.isFinite(Number(task.effortHours))
        ? Number(task.effortHours)
        : null;
    const unassignedSlot = scheduleUserByTask.get(id) === 'UNASSIGNED';
    rows.push(
      withAiProvenance({
        logicalId: `sch:${id}`,
        id,
        section: 'schedule',
        sectionLabel: SECTION_LABELS.schedule,
        title: task.name || task.title || id,
        startDate: startDate || null,
        dueDate: dueDate || null,
        effortHours,
        status: unassignedSlot ? 'UNASSIGNED' : task.leveled ? 'LEVELED' : 'SCHEDULED',
        summary: [startDate, dueDate].filter(Boolean).join(' – '),
      })
    );
  }
  return rows;
}

/**
 * Diagnose why Gate2 Lịch is empty — drives coverageReason (not generic NO_DATA).
 * @param {object} container
 * @returns {string|null}
 */
function diagnoseScheduleEmptyReason(container) {
  const meta =
    container?.resource?.assignmentsMeta && typeof container.resource.assignmentsMeta === 'object'
      ? container.resource.assignmentsMeta
      : {};
  const conflicts = Array.isArray(container?.resource?.capacityConflicts)
    ? container.resource.capacityConflicts
    : [];
  if (conflicts.some((c) => String(c?.type || '') === 'missing_project_start')) {
    return 'MISSING_PROJECT_START';
  }
  const reason = String(meta.reason || '').toLowerCase();
  if (reason === 'missing_project_start') return 'MISSING_PROJECT_START';
  if (reason === 'no_leaf_tasks') return 'NO_LEAF_TASKS';
  const tasks = Array.isArray(container?.planning?.tasks) ? container.planning.tasks : [];
  const leaves = tasks.filter((t) => isLeafTaskRow(t));
  if (!leaves.length) return 'NO_LEAF_TASKS';
  const assignments = Array.isArray(container?.resource?.assignments)
    ? container.resource.assignments
    : [];
  const realAssign = assignments.filter(
    (a) => String(a?.userId || '').trim() && String(a.userId).trim() !== 'UNASSIGNED'
  );
  if (!realAssign.length) return 'NO_ASSIGNMENTS';
  const schedule = Array.isArray(container?.resource?.schedule) ? container.resource.schedule : [];
  if (!schedule.length) return 'SCHEDULE_EMPTY';
  return 'SCHEDULE_EMPTY';
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
    const summary = clip(
      r.summary || r.mitigation || [r.probability != null ? `P${r.probability}` : '', r.impact != null ? `I${r.impact}` : '']
        .filter(Boolean)
        .join(' · '),
      200
    );
    return withAiProvenance({
      logicalId: `risk:${id}`,
      id,
      section: 'risks',
      sectionLabel: SECTION_LABELS.risks,
      title: r.name || r.title || id,
      summary: summary || undefined,
      level: 'risk',
      band: r.band || r.severity || '',
      status: 'READY',
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
        summary: impact || undefined,
        level: 'assumption',
        band: '',
        status: 'READY',
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
      })
    );
  }

  return rows;
}

/** Release start is the first sprint window already stored. Do not invent a date. */
function releaseWindowStart(release, sprintById) {
  const stored = release?.startDate;
  if (stored) return stored;
  const ids = Array.isArray(release?.sprintIds) ? release.sprintIds : [];
  for (const id of ids) {
    const start = sprintById.get(String(id))?.startDate;
    if (start) return start;
  }
  return null;
}

function indexTasksByParent(taskById) {
  const byParent = new Map();
  for (const task of taskById.values()) {
    const parentId =
      task?.parentId != null && task.parentId !== '' ? String(task.parentId) : '';
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId).push(task);
  }
  return byParent;
}

/**
 * Collapse chunk prefix doubled by LLM echo + `${prefix}-${id}`
 * e.g. c0r2-c0r2-TASK-FR-1-01 → c0r2-TASK-FR-1-01
 */
function collapseDuplicateIdPrefix(rawId) {
  let id = String(rawId || '').trim();
  if (!id) return '';
  let prev = '';
  while (id !== prev) {
    prev = id;
    id = id.replace(/^([^-]+)-\1(?=-|$)/, '$1');
  }
  return id;
}

function wbsIdLookupKeys(rawId) {
  const id = String(rawId || '').trim();
  if (!id) return [];
  const collapsed = collapseDuplicateIdPrefix(id);
  const keys = [id];
  if (collapsed && collapsed !== id) keys.push(collapsed);
  return keys;
}

/**
 * Human WBS title only (same fields as Phân công). Empty if missing — never use id.
 */
function wbsHumanTitle(task, rawId = '') {
  if (!task) return '';
  const id = String(rawId || task.id || task.taskId || '').trim();
  const collapsed = collapseDuplicateIdPrefix(id);
  const name = String(task.name || '').trim();
  const title = String(task.title || '').trim();
  for (const label of [name, title]) {
    if (!label) continue;
    if (label === id || label === collapsed) continue;
    return label;
  }
  return '';
}

function lookupWbsTask(taskById, tid) {
  for (const key of wbsIdLookupKeys(tid)) {
    if (taskById.has(key)) return taskById.get(key);
    const lower = key.toLowerCase();
    for (const [mapKey, row] of taskById.entries()) {
      if (String(mapKey).toLowerCase() === lower) return row;
      if (String(row?.taskId || '').toLowerCase() === lower) return row;
    }
  }
  return null;
}

/**
 * Same SoT as Phân công: planning.tasks via buildTaskById.
 * Alias collapsed ids so schedulePlan taskIds with doubled chunk prefix still resolve.
 * Overlay assignee/effort only — never touch name/title.
 */
function buildScheduleTaskById(container) {
  const taskById = buildTaskById(container);
  for (const story of Array.isArray(container?.planning?.backlog?.stories)
    ? container.planning.backlog.stories
    : []) {
    const sid = String(story?.id || '').trim();
    if (sid && !taskById.has(sid)) taskById.set(sid, story);
  }
  // Register collapsed-prefix aliases → same WBS row (fix schedule vs tasks id skew)
  for (const [id, task] of [...taskById.entries()]) {
    for (const key of wbsIdLookupKeys(id)) {
      if (!taskById.has(key)) taskById.set(key, task);
    }
  }
  const overlayMeta = (tid, meta) => {
    if (!tid || !meta) return;
    const prev = lookupWbsTask(taskById, tid);
    if (!prev) return;
    const key = String(prev.id || prev.taskId || tid);
    taskById.set(key, {
      ...prev,
      effortHours:
        prev.effortHours != null
          ? prev.effortHours
          : meta.effortHours != null
            ? meta.effortHours
            : prev.effortSeedHours,
      suggestedRoleKey: prev.suggestedRoleKey || meta.suggestedRoleKey || '',
      assigneeName:
        prev.assigneeName ||
        prev.displayName ||
        meta.assigneeName ||
        meta.displayName ||
        '',
    });
  };
  for (const row of Array.isArray(container?.resource?.assignments)
    ? container.resource.assignments
    : []) {
    overlayMeta(String(row?.taskId || '').trim(), {
      effortHours: row.effortHours,
      suggestedRoleKey: row.suggestedRoleKey,
      assigneeName: row.displayName || row.assigneeName,
    });
  }
  for (const row of Array.isArray(container?.resource?.recommendations)
    ? container.resource.recommendations
    : []) {
    const picked = Array.isArray(row?.shortlist)
      ? row.shortlist.find((c) => c && c.feasible !== false)
      : null;
    overlayMeta(String(row?.taskId || row?.id || '').trim(), {
      effortHours: row.effortHours || row.hours,
      suggestedRoleKey: row.suggestedRoleKey || row.roleKey,
      assigneeName: picked?.displayName || row.displayName || row.assigneeName,
    });
  }
  return taskById;
}

function leafTasksUnderStory(storyId, byParent, taskById) {
  const leaves = [];
  const stack = [String(storyId)];
  const seen = new Set();
  while (stack.length) {
    const parentId = stack.pop();
    for (const child of byParent.get(parentId) || []) {
      const childId = String(child?.id || child?.taskId || '').trim();
      if (!childId || seen.has(childId)) continue;
      seen.add(childId);
      const level = String(child?.level || taskById.get(childId)?.level || 'task').toLowerCase();
      if (level === 'task' || level === 'subtask') leaves.push(taskById.get(childId) || child);
      else stack.push(childId);
    }
  }
  return leaves;
}

function mapScopeTaskRow(task, tid) {
  const id = String(task?.id || task?.taskId || tid || '').trim();
  const title = wbsHumanTitle(task, tid);
  if (!title) return null;
  const hours = Number(task?.effortHours ?? task?.effortSeedHours);
  return {
    id,
    title,
    effortHours: Number.isFinite(hours) && hours > 0 ? hours : null,
    suggestedRoleKey: task?.suggestedRoleKey || '',
    assignee: task?.assigneeName || task?.assignee || task?.displayName || '',
    dueDate: task?.dueDate || null,
  };
}

function claimTaskId(claimed, tid) {
  const id = String(tid || '').trim();
  if (!id) return;
  claimed.add(id);
  claimed.add(id.toLowerCase());
  for (const key of wbsIdLookupKeys(id)) {
    claimed.add(key);
    claimed.add(key.toLowerCase());
  }
}

function isClaimed(claimed, tid) {
  const id = String(tid || '').trim();
  if (!id) return true;
  if (claimed.has(id) || claimed.has(id.toLowerCase())) return true;
  return wbsIdLookupKeys(id).some((key) => claimed.has(key) || claimed.has(key.toLowerCase()));
}

function buildStoryGroups({ pbiIds, taskIds, taskById, byParent }) {
  const groups = [];
  const claimed = new Set();
  const pbis = Array.isArray(pbiIds) ? pbiIds.map(String).filter(Boolean) : [];
  for (const pbiId of pbis) {
    const story = lookupWbsTask(taskById, pbiId);
    const leaves = leafTasksUnderStory(pbiId, byParent, taskById);
    const tasks = (leaves.length
      ? leaves
      : (Array.isArray(taskIds) ? taskIds : [])
          .map((tid) => lookupWbsTask(taskById, tid))
          .filter((task) => task && String(task.parentId || '') === String(story?.id || pbiId))
    )
      .map((task) => {
        const tid = String(task.id || task.taskId || '');
        const row = mapScopeTaskRow(task, tid);
        if (row) claimTaskId(claimed, tid);
        return row;
      })
      .filter(Boolean);
    const storyTitle = wbsHumanTitle(story, pbiId);
    if (!storyTitle && !tasks.length) continue;
    groups.push({
      id: pbiId,
      title: storyTitle || 'Story',
      tasks,
    });
  }
  // Strict like Phân công: only leaves that resolve to a real WBS human title — never id fallback.
  const orphanTasks = (Array.isArray(taskIds) ? taskIds : [])
    .map(String)
    .filter((tid) => tid && !isClaimed(claimed, tid))
    .map((tid) => {
      const row = mapScopeTaskRow(lookupWbsTask(taskById, tid), tid);
      if (row) claimTaskId(claimed, tid);
      return row;
    })
    .filter(Boolean);
  if (orphanTasks.length) {
    groups.push({
      id: '_ungrouped',
      title: 'Tasks',
      tasks: orphanTasks,
    });
  }
  return groups;
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
  const planningMeta = readSprintPlanningMeta(plan.meta || {});
  const sprints = Array.isArray(plan.sprints) ? plan.sprints : [];
  const releases = Array.isArray(plan.releases) ? plan.releases : [];
  const sprintById = new Map(
    sprints
      .filter((sprint) => sprint && sprint.id)
      .map((sprint) => [String(sprint.id), sprint])
  );
  const milestones = Array.isArray(plan.milestones)
    ? plan.milestones
    : Array.isArray(container?.planning?.milestones)
      ? container.planning.milestones
      : [];

  const taskById = buildScheduleTaskById(container);
  const byParent = indexTasksByParent(taskById);

  // Sprint HOW owns allocation — never stamp Heuristic for sprint/release rows.
  const sprintTextSource = planningMeta.fromLlm ? 'llm' : 'sprint_how';

  const sprintAgg = (() => {
    let startDate = null;
    let estimatedEnd = null;
    let effortHours = 0;
    let capacityHours = 0;
    let taskCount = 0;
    const goals = [];
    for (const sprint of sprints) {
      if (!sprint || typeof sprint !== 'object') continue;
      const sd = sprint.startDate || null;
      const ed = sprint.endDate || null;
      if (sd && (!startDate || String(sd) < String(startDate))) startDate = sd;
      if (ed && (!estimatedEnd || String(ed) > String(estimatedEnd))) estimatedEnd = ed;
      const eh = Number(sprint.effortHours);
      if (Number.isFinite(eh) && eh > 0) effortHours += eh;
      const ch =
        sprint.capacityHours != null
          ? Number(sprint.capacityHours)
          : plan.meta?.teamCapacityHoursPerSprint != null
            ? Number(plan.meta.teamCapacityHoursPerSprint)
            : null;
      if (Number.isFinite(ch) && ch > 0) capacityHours += ch;
      taskCount += Array.isArray(sprint.taskIds) ? sprint.taskIds.length : 0;
      const g = String(sprint.goal || '').trim();
      if (g) goals.push(g);
    }
    const utilizationPct =
      capacityHours > 0 && effortHours > 0
        ? Math.round((effortHours / capacityHours) * 10000) / 100
        : null;
    return {
      startDate,
      estimatedEnd,
      effortHours: effortHours > 0 ? Math.round(effortHours * 100) / 100 : null,
      capacityHours: capacityHours > 0 ? Math.round(capacityHours * 100) / 100 : null,
      utilizationPct,
      taskCount: taskCount || null,
      goal: clip(goals.join(' · '), 200) || undefined,
    };
  })();

  if (planningMeta.executionStatus) {
    const issuePreview = planningMeta.validationIssues
      .slice(0, 4)
      .map((issue) => String(issue.message || issue.code || '').trim())
      .filter(Boolean)
      .join(' · ');
    const gateStatus =
      gate2StatusFromSprintExecution(planningMeta.executionStatus) || 'DRAFT';
    rows.push(
      withAiProvenance({
        logicalId: 'rel:sprint_planning_status',
        id: 'sprint_planning_status',
        section: 'releases',
        sectionLabel: SECTION_LABELS.releases,
        title: tr(
          t,
          'requirements.gate2SprintPlanningStatusTitle',
          'Trạng thái phân bổ Sprint (AI)'
        ),
        summary:
          clip(
            [
              planningMeta.executionStatus,
              planningMeta.validationStatus
                ? `validate:${planningMeta.validationStatus}`
                : '',
              planningMeta.goalSource ? `goal:${planningMeta.goalSource}` : '',
              planningMeta.sprintPlanningReady ? 'ready' : 'not-ready',
              issuePreview,
            ]
              .filter(Boolean)
              .join(' · '),
            400
          ) || undefined,
        kind: 'sprint_planning_status',
        goal: sprintAgg.goal,
        startDate: sprintAgg.startDate,
        estimatedEnd: sprintAgg.estimatedEnd,
        effortHours: sprintAgg.effortHours,
        capacityHours: sprintAgg.capacityHours,
        utilizationPct: sprintAgg.utilizationPct,
        textSource: sprintTextSource || 'llm',
        source: sprintTextSource || 'llm',
        executionStatus: planningMeta.executionStatus,
        validationStatus: planningMeta.validationStatus,
        goalSource: planningMeta.goalSource,
        sprintPlanningReady: planningMeta.sprintPlanningReady,
        validationIssues: planningMeta.validationIssues,
        allocationValidation: {
          status: planningMeta.validationStatus,
          checks: planningMeta.validationChecks,
          issues: planningMeta.validationIssues,
        },
        status: gateStatus,
        taskCount:
          sprintAgg.taskCount != null
            ? sprintAgg.taskCount
            : planningMeta.validationIssues.length || null,
      })
    );
  }

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
      })
    );
  }

  for (const r of releases) {
    if (!r || typeof r !== 'object') continue;
    const id = String(r.id || '').trim();
    if (!id) continue;
    const sprintIds = Array.isArray(r.sprintIds) ? r.sprintIds.map(String) : [];
    const nestedSprints = sprintIds
      .map((sid) => sprintById.get(sid))
      .filter(Boolean)
      .map((sprint) => {
        const taskIds = Array.isArray(sprint.taskIds) ? sprint.taskIds.map(String) : [];
        const pbiIds = Array.isArray(sprint.pbiIds) ? sprint.pbiIds.map(String) : [];
        return {
          id: String(sprint.id),
          title: sprint.name || sprint.id,
          goal: sprint.goal || '',
          startDate: sprint.startDate || null,
          endDate: sprint.endDate || null,
          effortHours: sprint.effortHours != null ? Number(sprint.effortHours) : null,
          taskCount: taskIds.length,
          storyGroups: buildStoryGroups({ pbiIds, taskIds, taskById, byParent }),
        };
      });
    const dedupedTaskIds = Array.isArray(r.taskIds)
      ? r.taskIds.map(String)
      : [...new Set(nestedSprints.flatMap((s) => s.storyGroups.flatMap((g) => g.tasks.map((x) => x.id))))];
    const nestedGoals = nestedSprints
      .map((s) => String(s.goal || '').trim())
      .filter(Boolean);
    const nestedEffort = nestedSprints.reduce((sum, s) => {
      const n = Number(s.effortHours);
      return Number.isFinite(n) && n > 0 ? sum + n : sum;
    }, 0);
    const nestedCapacity = sprintIds.reduce((sum, sid) => {
      const sprint = sprintById.get(sid);
      if (!sprint) return sum;
      const ch =
        sprint.capacityHours != null
          ? Number(sprint.capacityHours)
          : plan.meta?.teamCapacityHoursPerSprint != null
            ? Number(plan.meta.teamCapacityHoursPerSprint)
            : null;
      return Number.isFinite(ch) && ch > 0 ? sum + ch : sum;
    }, 0);
    const releaseEffort =
      r.effortHours != null && Number.isFinite(Number(r.effortHours))
        ? Number(r.effortHours)
        : nestedEffort > 0
          ? Math.round(nestedEffort * 100) / 100
          : null;
    const releaseCapacity = nestedCapacity > 0 ? Math.round(nestedCapacity * 100) / 100 : null;
    const releaseUtil =
      releaseCapacity != null && releaseEffort != null && releaseCapacity > 0
        ? Math.round((releaseEffort / releaseCapacity) * 10000) / 100
        : null;
    rows.push(
      withAiProvenance({
        logicalId: `rel:release:${id}`,
        id,
        section: 'releases',
        sectionLabel: SECTION_LABELS.releases,
        title: r.name || id,
        summary: clip(r.summary || nestedGoals.join(' · ') || '', 200) || undefined,
        kind: 'release',
        goal: clip(nestedGoals.join(' · '), 200) || undefined,
        startDate: releaseWindowStart(r, sprintById),
        estimatedEnd: r.estimatedEnd || null,
        effortHours: releaseEffort,
        capacityHours: releaseCapacity,
        utilizationPct: releaseUtil,
        taskCount: r.taskCount != null ? Number(r.taskCount) : dedupedTaskIds.length,
        taskIds: dedupedTaskIds,
        sprintIds,
        nestedSprints,
        storyCount: nestedSprints.reduce((n, s) => n + (s.storyGroups?.length || 0), 0),
        textSource: sprintTextSource,
        source: sprintTextSource || undefined,
        executionStatus: planningMeta.executionStatus || undefined,
        validationStatus: planningMeta.validationStatus || undefined,
        sprintPlanningReady: planningMeta.sprintPlanningReady,
        validationIssues: planningMeta.validationIssues,
        status: planningMeta.executionStatus
          ? gate2StatusFromSprintExecution(planningMeta.executionStatus) ||
            (r.estimatedEnd ? 'READY' : 'DRAFT')
          : r.estimatedEnd
            ? 'READY'
            : 'DRAFT',
      })
    );
  }

  for (const s of sprints) {
    if (!s || typeof s !== 'object') continue;
    const id = String(s.id || '').trim();
    if (!id) continue;
    const taskIds = Array.isArray(s.taskIds) ? s.taskIds.map(String) : [];
    const pbiIds = Array.isArray(s.pbiIds) ? s.pbiIds.map(String) : [];
    const storyGroups = buildStoryGroups({ pbiIds, taskIds, taskById, byParent });
    const taskBits = [];
    let summedHours = 0;
    for (const tid of taskIds) {
      const task = taskById.get(String(tid));
      const name = task?.name || task?.title || tid;
      const hours = Number(task?.effortHours ?? task?.effortSeedHours);
      if (Number.isFinite(hours) && hours > 0) {
        summedHours += hours;
        taskBits.push(`${name} (${hours}h)`);
      } else {
        taskBits.push(String(name));
      }
    }
    const pbiNames = pbiIds
      .map((pbiId) => {
        const story = taskById.get(String(pbiId));
        return story?.name || story?.title || pbiId;
      })
      .filter(Boolean);
    const goal = clip(s.goal || '', 200);
    const storedHours = s.effortHours != null ? Number(s.effortHours) : null;
    const effortHours =
      Number.isFinite(storedHours) && storedHours > 0
        ? storedHours
        : summedHours > 0
          ? Math.round(summedHours * 100) / 100
          : storedHours;
    const capacityHours =
      s.capacityHours != null
        ? Number(s.capacityHours)
        : plan.meta?.teamCapacityHoursPerSprint != null
          ? Number(plan.meta.teamCapacityHoursPerSprint)
          : null;
    const utilizationPct =
      s.utilizationPct != null
        ? Number(s.utilizationPct)
        : capacityHours != null && Number.isFinite(effortHours) && capacityHours > 0
          ? Math.round((effortHours / capacityHours) * 10000) / 100
          : null;
    rows.push(
      withAiProvenance({
        logicalId: `rel:sprint:${id}`,
        id,
        section: 'releases',
        sectionLabel: SECTION_LABELS.releases,
        title: s.name || id,
        summary:
          clip([goal, pbiNames.join(' · '), taskBits.join(' · '), s.summary || ''].filter(Boolean).join(' — '), 400) ||
          undefined,
        kind: 'sprint',
        goal: goal || undefined,
        startDate: s.startDate || null,
        estimatedEnd: s.endDate || null,
        effortHours: Number.isFinite(effortHours) ? effortHours : null,
        capacityHours: Number.isFinite(capacityHours) ? capacityHours : null,
        utilizationPct: Number.isFinite(utilizationPct) ? utilizationPct : null,
        taskCount: taskIds.length,
        storyCount: pbiIds.length || storyGroups.filter((g) => g.id !== '_ungrouped').length,
        taskIds,
        pbiIds,
        storyGroups,
        textSource: sprintTextSource,
        source: sprintTextSource || undefined,
        executionStatus: planningMeta.executionStatus || undefined,
        validationStatus: planningMeta.validationStatus || undefined,
        goalSource: planningMeta.goalSource || undefined,
        sprintPlanningReady: planningMeta.sprintPlanningReady,
        validationIssues: planningMeta.validationIssues.filter(
          (issue) => !issue.sprintId || String(issue.sprintId) === id
        ),
        status: planningMeta.executionStatus
          ? gate2StatusFromSprintExecution(planningMeta.executionStatus) ||
            (taskIds.length ? 'READY' : 'DRAFT')
          : taskIds.length
            ? 'READY'
            : 'DRAFT',
      })
    );
  }

  const unallocated = Array.isArray(plan.unallocated) ? plan.unallocated : [];
  const deferred = Array.isArray(plan.deferred) ? plan.deferred : [];
  if (unallocated.length || deferred.length) {
    const items = [
      ...unallocated.map((row) => {
        const id = String(row.taskId || row.pbiId || '');
        const task = lookupWbsTask(taskById, id);
        const title = wbsHumanTitle(task, id);
        if (!title) return null;
        return {
          id,
          kind: row.taskId ? 'task' : 'pbi',
          title,
          reasonCode: row.reasonCode || '',
          reason: row.reason || '',
        };
      }),
      ...deferred.map((row) => {
        const id = String(row.pbiId || '');
        const title = wbsHumanTitle(lookupWbsTask(taskById, id), id);
        if (!title) return null;
        return {
          id,
          kind: 'pbi',
          title,
          reasonCode: row.reasonCode || '',
          reason: row.reason || '',
        };
      }),
    ].filter(Boolean);
    rows.push(
      withAiProvenance({
        logicalId: 'rel:unallocated',
        id: 'unallocated',
        section: 'releases',
        sectionLabel: SECTION_LABELS.releases,
        title: tr(t, 'requirements.gate2UnallocatedTitle', 'Chưa phân bổ'),
        summary: clip(
          items
            .slice(0, 8)
            .map((item) => `${item.title}${item.reasonCode ? ` (${item.reasonCode})` : ''}`)
            .join(' · '),
          400
        ),
        kind: 'unallocated',
        taskCount: items.length,
        unallocatedItems: items,
        storyGroups: [
          {
            id: '_unallocated',
            title: tr(t, 'requirements.gate2UnallocatedTitle', 'Chưa phân bổ'),
            tasks: items.map((item) => ({
              id: item.id,
              title: item.title,
              effortHours: null,
              suggestedRoleKey: '',
              assignee: '',
              dueDate: null,
              reasonCode: item.reasonCode,
              reason: item.reason,
            })),
          },
        ],
        executionStatus: planningMeta.executionStatus || undefined,
        validationIssues: planningMeta.validationIssues,
        status:
          planningMeta.executionStatus === 'draft_ready' && !items.length
            ? 'READY'
            : items.length
              ? 'AT_RISK'
              : gate2StatusFromSprintExecution(planningMeta.executionStatus) || 'READY',
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
      })
    );
  }

  return rows;
}

/**
 * Quality / Testing — one row per authored Test Case.
 * Heuristic catalog stubs (title only, no steps) are not review rows.
 */
function isAuthoredTestCase(tc, steps) {
  if (tc?.provenance && typeof tc.provenance === 'object' && tc.provenance.type) return true;
  return steps.some(
    (step) => step && String(step.action || '').trim() && String(step.expectedResult || '').trim()
  );
}

function qualityRows(container) {
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
  const catalog = Array.isArray(qp.catalogPlan) ? qp.catalogPlan : [];
  for (let i = 0; i < catalog.length; i += 1) {
    const tc = catalog[i];
    if (!tc || typeof tc !== 'object' || !tc.title) continue;
    const id = String(tc.tcKey || tc.id || `tc-${i}`);
    const sourceRefs = qualitySourceRefs(tc);
    const steps = Array.isArray(tc.steps) ? tc.steps : [];
    if (!isAuthoredTestCase(tc, steps)) continue;
    const preconditions = Array.isArray(tc.preconditions) ? tc.preconditions : [];
    const testData = Array.isArray(tc.testData) ? tc.testData : [];
    const incomplete =
      tc.completeness === 'incomplete' ||
      tc.reviewStatus === 'needs_confirmation' ||
      !steps.length;
    rows.push(
      stamp({
        logicalId: `quality:tc:${id}`,
        id,
        section: 'quality',
        sectionLabel: SECTION_LABELS.quality,
        recordKind: 'test_case',
        title: tc.title || id,
        objective: tc.objective || '',
        summary: clip(tc.objective || tc.summary || '', 200) || undefined,
        level: tc.testLevel || tc.level || '',
        testLevel: tc.testLevel || tc.level || '',
        testType: tc.testType || '',
        scenarioType: tc.scenarioType || tc.type || '',
        priority: tc.priority || '',
        sourceUcKey: tc.sourceUcKey || sourceRefs.find((ref) => ref.type === 'UC')?.id || '',
        sourceFrIds: Array.isArray(tc.sourceFrIds) ? tc.sourceFrIds : [],
        sourceRefs,
        preconditions,
        testData,
        steps,
        reviewStatus: tc.reviewStatus || (incomplete ? 'needs_confirmation' : 'proposed'),
        executionStatus: tc.executionStatus || 'not_run',
        completeness: incomplete ? 'incomplete' : 'executable',
        missingInformation: tc.missingInformation || '',
        confirmationGaps: Array.isArray(tc.confirmationGaps) ? tc.confirmationGaps : [],
        linkedWbsTaskId: tc.linkedWbsTaskId || '',
        provenance: tc.provenance,
        status: incomplete ? 'NEEDS_SUPPLEMENT' : 'PROPOSED',
      })
    );
  }

  return rows;
}

function qualitySourceRefs(tc) {
  if (Array.isArray(tc?.sourceRefs) && tc.sourceRefs.length) {
    return tc.sourceRefs
      .map((ref) => ({
        type: String(ref?.type || '').trim().toUpperCase(),
        id: String(ref?.id || '').trim(),
      }))
      .filter((ref) => ref.type && ref.id);
  }
  const refs = [];
  if (tc?.sourceUcKey) refs.push({ type: 'UC', id: String(tc.sourceUcKey) });
  const frIds = Array.isArray(tc?.sourceFrIds) ? tc.sourceFrIds : tc?.sourceFrId ? [tc.sourceFrId] : [];
  for (const id of frIds) {
    if (id) refs.push({ type: 'FR', id: String(id) });
  }
  return refs;
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
    assignments: (c, p) => assignmentRows(c, { nameByUserId, t, pack: p }),
    releases: (c) => releaseRows(c, loc),
    risks: (c, p) => riskRows(c, p),
    quality: (c) => qualityRows(c),
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
  const wbsMeta = readWbsMeta(container);
  const proposalSections = SECTION_ORDER.map((key) => {
    const rows = bySection[key] || [];
    // WBS gaps (NEEDS_STORIES / wbs.meta) and Quality NEEDS_SUPPLEMENT are informational
    // only — do not badge the tab as conflict (was too noisy for Gate2 review).
    let conflictCount =
      key === 'tasks' || key === 'quality'
        ? 0
        : rows.filter((r) =>
            [
              'BLOCKING',
              'OVERLOAD',
              'CRITICAL',
              'UNASSIGNED',
              'HIGH',
              'UNRESOLVED',
            ].includes(String(r.status || '').toUpperCase())
          ).length;
    if (key === 'assignments') {
      const withCapacityConflicts = rows.filter((r) => Number(r.conflictCount) > 0).length;
      const provisional = rows.filter((r) =>
        ['PROVISIONAL', 'UNASSIGNED', 'OVERLOAD'].includes(String(r.status || '').toUpperCase())
      ).length;
      conflictCount = Math.max(conflictCount, withCapacityConflicts, provisional);
    }
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
    wbsMeta,
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

export {
  SECTION_ORDER,
  SECTION_LABELS,
  sortWbsTreeForGate2,
  WBS_LEVEL_ORDER,
  mergeBacklogAndTasks,
  diagnoseScheduleEmptyReason,
};

export default buildGate2ProposalItems;
