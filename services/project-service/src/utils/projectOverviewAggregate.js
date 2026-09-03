/**
 * Project Hub overview aggregates — parity với client projectHubUtils (summary/charts).
 * Pure functions; không HTTP.
 */

function hubListById(lists = []) {
  return new Map((lists || []).map((l) => [String(l._id || l.id), l]));
}

function cardStatusText(card, listById) {
  const list = listById.get(String(card?.listId || card?.list || ''));
  return String(card?.status || list?.statusKey || list?.title || '').toLowerCase();
}

function isDoneStatus(status) {
  const s = String(status || '').toLowerCase();
  return s.includes('done') || s.includes('complete') || s === 'done';
}

function classifyListStatusBucket(listOrStatus) {
  const s = String(
    typeof listOrStatus === 'string'
      ? listOrStatus
      : listOrStatus?.statusKey || listOrStatus?.title || ''
  ).toLowerCase();
  if (s.includes('done') || s.includes('complete')) return 'done';
  if (s.includes('progress') || s.includes('doing') || s.includes('review')) return 'progress';
  return 'todo';
}

function isCardOpen(card, listById) {
  return !isDoneStatus(cardStatusText(card, listById));
}

function slugPriorityKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function computeHubBoardSummary(cards = [], lists = []) {
  const listById = hubListById(lists);
  const total = (cards || []).length;
  let done = 0;
  let overdue = 0;
  let inReview = 0;
  const now = Date.now();
  for (const card of cards || []) {
    const status = cardStatusText(card, listById);
    if (isDoneStatus(status)) done += 1;
    if (status.includes('review')) inReview += 1;
    const due = card?.dueDate ? new Date(card.dueDate).getTime() : NaN;
    if (Number.isFinite(due) && due < now && !isDoneStatus(status)) overdue += 1;
  }
  const donePercent = total ? Math.round((done / total) * 100) : 0;
  return { total, done, donePercent, overdue, inReview };
}

function countCardsByIssueType(cards = []) {
  const out = { story: 0, task: 0, bug: 0, other: 0 };
  for (const card of cards || []) {
    const it = String(card.issueType || card.type || 'task').toLowerCase();
    if (it === 'story') out.story += 1;
    else if (it === 'bug') out.bug += 1;
    else if (it === 'task') out.task += 1;
    else out.other += 1;
  }
  return out;
}

function countIssuesByStatusBucket(issues = [], lists = []) {
  const listById = hubListById(lists);
  const out = { todo: 0, progress: 0, done: 0 };
  for (const issue of issues || []) {
    const list = listById.get(String(issue.listId || issue.list || ''));
    const bucket = classifyListStatusBucket(issue.status || list);
    out[bucket] += 1;
  }
  return out;
}

function cardsHavePriorityField(cards = []) {
  return (cards || []).some((card) => {
    if (!card || typeof card !== 'object') return false;
    if (!Object.prototype.hasOwnProperty.call(card, 'priority')) return false;
    const raw = card.priority;
    return raw != null && String(raw).trim() !== '';
  });
}

function countCardsByPriority(cards = [], priorityConfig) {
  const items = Array.isArray(priorityConfig?.items) ? priorityConfig.items : [];
  const counts = new Map(items.map((i) => [String(i.key || ''), 0]));
  let none = 0;
  for (const card of cards || []) {
    if (!Object.prototype.hasOwnProperty.call(card || {}, 'priority')) {
      none += 1;
      continue;
    }
    const raw = card.priority;
    if (raw == null || String(raw).trim() === '') {
      none += 1;
      continue;
    }
    const key = slugPriorityKey(raw);
    if (!key) {
      none += 1;
      continue;
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const byPriority = [];
  for (const item of items) {
    byPriority.push({ key: item.key, count: counts.get(item.key) || 0 });
  }
  const known = new Set(items.map((i) => String(i.key || '')));
  for (const [key, count] of counts.entries()) {
    if (!known.has(key) && count > 0) byPriority.push({ key, count });
  }
  if (none > 0) byPriority.push({ key: 'none', count: none });
  return byPriority;
}

function countOpenCardsByAssignee(cards = [], lists = [], members = [], topN = 5) {
  const listById = hubListById(lists);
  const byKey = new Map();
  let unassigned = 0;
  for (const card of cards || []) {
    if (!isCardOpen(card, listById)) continue;
    const id = String(card?.assigneeId || '').trim();
    const name = String(card?.assigneeName || '').trim();
    if (!id && !name) {
      unassigned += 1;
      continue;
    }
    const key = id || `name:${name.toLowerCase()}`;
    const prev = byKey.get(key);
    if (prev) {
      prev.count += 1;
      if (!prev.displayName && name) prev.displayName = name;
    } else {
      byKey.set(key, {
        userId: id || '',
        displayName: name || (id ? id.slice(-6) : ''),
        count: 1,
      });
    }
  }
  const rows = [...byKey.values()].sort((a, b) => b.count - a.count);
  const top = rows.slice(0, topN);
  const rest = rows.slice(topN);
  const otherCount = rest.reduce((sum, r) => sum + r.count, 0);
  if (unassigned > 0) top.push({ userId: '', displayName: '', count: unassigned, unassigned: true });
  if (otherCount > 0) top.push({ userId: '', displayName: '', count: otherCount, other: true });
  return top;
}

function countUnassignedOpenCards(cards = [], lists = []) {
  const listById = hubListById(lists);
  let n = 0;
  for (const card of cards || []) {
    if (!isCardOpen(card, listById)) continue;
    if (
      !String(card?.assigneeId || '').trim() &&
      !String(card?.assigneeName || '').trim()
    ) {
      n += 1;
    }
  }
  return n;
}

function sumOpenCardEstimateHours(cards = [], lists = []) {
  const listById = hubListById(lists);
  let sum = 0;
  for (const card of cards || []) {
    if (!isCardOpen(card, listById)) continue;
    const h = Number(card?.estimateHours);
    if (Number.isFinite(h) && h > 0) sum += h;
  }
  return sum;
}

function dueDateTone(dueDate, statusOrList) {
  if (!dueDate) return 'none';
  const due = new Date(dueDate).getTime();
  if (!Number.isFinite(due)) return 'none';
  const bucket = classifyListStatusBucket(statusOrList);
  if (bucket === 'done') return 'none';
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  if (due < now) return 'overdue';
  if (due - now <= 2 * dayMs) return 'soon';
  return 'none';
}

function hubActionAttentionRank({ dueTone, isInReview, hasAssignee } = {}) {
  if (dueTone === 'overdue') return 0;
  if (dueTone === 'soon') return 1;
  if (isInReview) return 2;
  if (!hasAssignee) return 3;
  return 4;
}

function listHubHealthCards(cards = [], lists = [], kind = 'overdue', limit = 8) {
  const listById = hubListById(lists);
  const now = Date.now();
  const want = String(kind || '').toLowerCase();
  const out = [];
  for (const card of cards || []) {
    const status = cardStatusText(card, listById);
    if (want === 'overdue') {
      if (isDoneStatus(status)) continue;
      const due = card?.dueDate ? new Date(card.dueDate).getTime() : NaN;
      if (!(Number.isFinite(due) && due < now)) continue;
    } else if (want === 'inreview' || want === 'in_review') {
      if (!status.includes('review')) continue;
    } else continue;
    out.push({
      id: String(card._id || card.id || ''),
      title: String(card.title || '').trim() || '—',
      dueDate: card.dueDate || null,
    });
  }
  out.sort((a, b) => a.title.localeCompare(b.title));
  return out.slice(0, Math.max(1, Number(limit) || 8));
}

function pickNextHubActions(cards = [], lists = [], { limit = 5, projectCode = '' } = {}) {
  const listById = hubListById(lists);
  const ranked = (cards || [])
    .filter((card) => isCardOpen(card, listById))
    .map((card) => {
      const list = listById.get(String(card?.listId || card?.list || ''));
      const dueRaw = card.dueDate || card.targetDate || null;
      const dueTs = dueRaw ? new Date(dueRaw).getTime() : NaN;
      const hasDue = Number.isFinite(dueTs);
      const status = cardStatusText(card, listById);
      const dueTone = dueDateTone(dueRaw, card.status || list);
      const isInReview = status.includes('review');
      const hasAssignee = Boolean(
        String(card?.assigneeId || '').trim() || String(card?.assigneeName || '').trim()
      );
      return {
        card,
        dueRaw,
        dueTs: hasDue ? dueTs : Number.POSITIVE_INFINITY,
        attentionRank: hubActionAttentionRank({ dueTone, isInReview, hasAssignee }),
      };
    });
  ranked.sort((a, b) => {
    if (a.attentionRank !== b.attentionRank) return a.attentionRank - b.attentionRank;
    if (a.dueTs !== b.dueTs) return a.dueTs - b.dueTs;
    return String(a.card.title || '').localeCompare(String(b.card.title || ''));
  });
  return ranked.slice(0, limit).map(({ card, dueRaw }) => ({
    id: String(card._id || card.id || ''),
    title: String(card.title || ''),
    issueKey: projectCode ? `${projectCode}-${String(card._id || '').slice(-4)}` : '',
    issueType: card.issueType || card.type || 'task',
    dueDate: dueRaw,
  }));
}

function countPlanningByType(rows = []) {
  let epic = 0;
  let feature = 0;
  for (const item of rows || []) {
    const type = String(item?.type || '').toLowerCase();
    if (type === 'epic') epic += 1;
    else if (type === 'feature') feature += 1;
  }
  return { epic, feature };
}

function resolveActiveSprint(sprints = []) {
  const active = (sprints || []).filter(
    (s) => String(s?.status || '').toLowerCase() === 'active'
  );
  if (!active.length) return null;
  return active.sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  )[0];
}

function countCardsInSprint(cards = [], sprintId) {
  const sid = String(sprintId || '').trim();
  if (!sid) return 0;
  return (cards || []).filter((c) => String(c?.sprintId || '').trim() === sid).length;
}

function slimOverviewProject(project = {}) {
  if (!project || typeof project !== 'object') return {};
  return {
    projectId: String(project.projectId || project._id || ''),
    title: project.title,
    status: project.status,
    projectCode: project.projectCode,
    access: project.access || null,
    priorityConfig: project.priorityConfig || null,
    capabilities: project.capabilities || null,
    defaultBoardId: project.defaultBoardId || null,
  };
}

/**
 * @param {{ cards?: object[], lists?: object[], priorityConfig?: object, members?: object[], projectCode?: string, sprints?: object[], planningRows?: object[], informationLevel?: string }} input
 */
function buildProjectOverviewAggregate(input = {}) {
  const informationLevel = String(input.informationLevel || 'details').toLowerCase();
  const isSummaryOnly = informationLevel === 'summary';
  const cards = Array.isArray(input.cards) ? input.cards : [];
  const lists = Array.isArray(input.lists) ? input.lists : [];
  const members = Array.isArray(input.members) ? input.members : [];
  const priorityConfig = input.priorityConfig || null;
  const projectCode = String(input.projectCode || '').trim();
  const sprints = Array.isArray(input.sprints) ? input.sprints : [];
  const planningPulse = countPlanningByType(input.planningRows || []);

  if (isSummaryOnly) {
    return {
      summary: { total: 0, done: 0, donePercent: 0, overdue: 0, inReview: 0, unassigned: 0, estimateHours: 0 },
      charts: {
        byStatus: { todo: 0, progress: 0, done: 0 },
        byType: { story: 0, task: 0, bug: 0, other: 0 },
        byPriority: [],
        byAssignee: [],
      },
      planningPulse,
      activeSprint: null,
      healthPreview: { overdue: [], inReview: [] },
      nextActions: [],
    };
  }

  const summary = computeHubBoardSummary(cards, lists);
  summary.unassigned = countUnassignedOpenCards(cards, lists);
  summary.estimateHours = sumOpenCardEstimateHours(cards, lists);

  const active = resolveActiveSprint(sprints);
  const activeSprint = active
    ? {
        _id: String(active._id || active.id || ''),
        name: active.name || '',
        status: active.status || '',
        issueCount: countCardsInSprint(cards, active._id || active.id),
      }
    : null;

  return {
    summary,
    charts: {
      byStatus: countIssuesByStatusBucket(cards, lists),
      byType: countCardsByIssueType(cards),
      byPriority: cardsHavePriorityField(cards)
        ? countCardsByPriority(cards, priorityConfig)
        : [],
      byAssignee: countOpenCardsByAssignee(cards, lists, members),
    },
    planningPulse,
    activeSprint,
    healthPreview: {
      overdue: listHubHealthCards(cards, lists, 'overdue', 8),
      inReview: listHubHealthCards(cards, lists, 'inReview', 8),
    },
    nextActions: pickNextHubActions(cards, lists, { limit: 5, projectCode }),
  };
}

module.exports = {
  buildProjectOverviewAggregate,
  computeHubBoardSummary,
  countPlanningByType,
  slimOverviewProject,
  classifyListStatusBucket,
  countIssuesByStatusBucket,
};
