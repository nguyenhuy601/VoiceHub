/**
 * Director project-health (portfolio): 1 dòng = 1 Project.
 * RAG dùng lifecycle Project + tiến độ thẻ (không nhầm % allocation / ERP).
 */

/** Còn hạn nhưng gần due — cửa sổ at_risk (không phải delayed). */
const AT_RISK_DUE_SOON_DAYS = 14;
/** % thẻ hoặc % giờ xong dưới ngưỡng khi due soon → at_risk. */
const AT_RISK_LOW_DONE_RATIO = 0.5;
const AT_RISK_LOW_CARD_DONE_RATIO = AT_RISK_LOW_DONE_RATIO;

const HEALTH_RANK = Object.freeze({
  delayed: 0,
  at_risk: 1,
  paused: 2,
  on_track: 3,
  completed: 4,
  cancelled: 5,
});

function roundHours(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

function roundRatio(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1000) / 1000;
}

function emptyCardProgress() {
  return {
    totalCards: 0,
    doneCards: 0,
    openCards: 0,
    cancelledCards: 0,
    overdueCards: 0,
    estimateHoursDone: 0,
    estimateHoursOpen: 0,
    percentDoneCards: null,
    percentDoneHours: null,
    cycleTimeHours: null,
    cycleTimeSample: 0,
    cycleTimeUnavailableReason: 'missing_firstInProgressAt',
    sprintCommittedCards: 0,
    sprintDoneCards: 0,
    sprintCommittedHours: 0,
    sprintCompletedHours: 0,
    sprintCommitmentRatio: null,
  };
}

function withProgressPercents(raw = {}) {
  const doneCards = Math.max(0, Number(raw.doneCards) || 0);
  const openCards = Math.max(0, Number(raw.openCards) || 0);
  const cancelledCards = Math.max(0, Number(raw.cancelledCards) || 0);
  const overdueCards = Math.max(0, Number(raw.overdueCards) || 0);
  const estimateHoursDone = roundHours(raw.estimateHoursDone);
  const estimateHoursOpen = roundHours(raw.estimateHoursOpen);
  const cardDenom = doneCards + openCards;
  const hoursDenom = estimateHoursDone + estimateHoursOpen;
  const totalCards = Math.max(
    0,
    Number(raw.totalCards) || doneCards + openCards + cancelledCards
  );
  const cycleTimeSample = Math.max(0, Number(raw.cycleTimeSample) || 0);
  const cycleSum = Number(raw.cycleTimeHoursSum);
  const cycleTimeHours =
    cycleTimeSample > 0 && Number.isFinite(cycleSum)
      ? roundHours(cycleSum / cycleTimeSample)
      : raw.cycleTimeHours != null
        ? roundHours(raw.cycleTimeHours)
        : null;
  const sprintCommittedCards = Math.max(0, Number(raw.sprintCommittedCards) || 0);
  const sprintDoneCards = Math.max(0, Number(raw.sprintDoneCards) || 0);
  const sprintCommittedHours = roundHours(raw.sprintCommittedHours);
  const sprintCompletedHours = roundHours(raw.sprintCompletedHours);
  return {
    totalCards,
    doneCards,
    openCards,
    cancelledCards,
    overdueCards,
    estimateHoursDone,
    estimateHoursOpen,
    percentDoneCards: cardDenom > 0 ? roundRatio(doneCards / cardDenom) : null,
    percentDoneHours: hoursDenom > 0 ? roundRatio(estimateHoursDone / hoursDenom) : null,
    cycleTimeHours: cycleTimeHours > 0 ? cycleTimeHours : null,
    cycleTimeSample,
    cycleTimeUnavailableReason:
      cycleTimeSample > 0 ? null : 'missing_firstInProgressAt',
    sprintCommittedCards,
    sprintDoneCards,
    sprintCommittedHours,
    sprintCompletedHours,
    sprintCommitmentRatio:
      sprintCommittedCards > 0 ? roundRatio(sprintDoneCards / sprintCommittedCards) : null,
  };
}

function lookupProgress(progressByProjectId, projectId) {
  const pid = String(projectId || '');
  if (!pid || !progressByProjectId) return emptyCardProgress();
  let raw = null;
  if (typeof progressByProjectId.get === 'function') raw = progressByProjectId.get(pid);
  else raw = progressByProjectId[pid];
  if (!raw) return emptyCardProgress();
  return withProgressPercents(raw);
}

function resolveDueDate(project) {
  return project?.dueDate || project?.expectedEndDate || null;
}

function normalizeStatus(project) {
  return String(project?.status || '').trim().toLowerCase();
}

function isCancelledStatus(status) {
  return status === 'cancelled' || status === 'canceled' || status.includes('cancel');
}

function dueMsOf(project) {
  const due = resolveDueDate(project);
  if (!due) return null;
  const ms = new Date(due).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isDueSoon(project, asOf) {
  const dueMs = dueMsOf(project);
  if (dueMs == null) return false;
  const nowMs = asOf.getTime();
  if (dueMs < nowMs) return false;
  return dueMs - nowMs <= AT_RISK_DUE_SOON_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * @returns {'completed'|'cancelled'|'paused'|'delayed'|'at_risk'|'on_track'}
 */
function classifyProjectHealth(project, asOf = new Date(), progress = null) {
  const p = project || {};
  const status = normalizeStatus(p);
  if (isCancelledStatus(status)) return 'cancelled';
  if (p.isActive === false || status === 'closed') return 'completed';
  if (status === 'on_hold') return 'paused';

  const dueMs = dueMsOf(p);
  if (dueMs != null && dueMs < asOf.getTime()) return 'delayed';

  const prog = progress ? withProgressPercents(progress) : emptyCardProgress();
  if (prog.overdueCards > 0) return 'at_risk';
  const dueSoon = isDueSoon(p, asOf);
  if (
    dueSoon &&
    prog.percentDoneCards != null &&
    prog.percentDoneCards < AT_RISK_LOW_DONE_RATIO
  ) {
    return 'at_risk';
  }
  if (
    dueSoon &&
    prog.percentDoneHours != null &&
    prog.percentDoneHours < AT_RISK_LOW_DONE_RATIO
  ) {
    return 'at_risk';
  }
  return 'on_track';
}

function emptyCounts() {
  return {
    delayed: 0,
    atRisk: 0,
    onTrack: 0,
    paused: 0,
    cancelled: 0,
    completed: 0,
    total: 0,
  };
}

function bumpCount(counts, health) {
  if (health === 'delayed') counts.delayed += 1;
  else if (health === 'at_risk') counts.atRisk += 1;
  else if (health === 'paused') counts.paused += 1;
  else if (health === 'cancelled') counts.cancelled += 1;
  else if (health === 'completed') counts.completed += 1;
  else counts.onTrack += 1;
}

function emptyPortfolio() {
  return {
    openCards: 0,
    doneCards: 0,
    overdueCards: 0,
    estimateHoursOpen: 0,
    estimateHoursDone: 0,
  };
}

function addPortfolio(portfolio, progress) {
  portfolio.openCards += progress.openCards;
  portfolio.doneCards += progress.doneCards;
  portfolio.overdueCards += progress.overdueCards;
  portfolio.estimateHoursOpen = roundHours(portfolio.estimateHoursOpen + progress.estimateHoursOpen);
  portfolio.estimateHoursDone = roundHours(portfolio.estimateHoursDone + progress.estimateHoursDone);
}

function aggregateDirectorHealth(projects = [], asOf = new Date(), progressByProjectId = null) {
  const counts = emptyCounts();
  const portfolio = emptyPortfolio();
  const rows = [];
  for (const p of projects || []) {
    counts.total += 1;
    const projectId = String(p._id || p.projectId || '');
    const progress = lookupProgress(progressByProjectId, projectId);
    const health = classifyProjectHealth(p, asOf, progress);
    bumpCount(counts, health);
    addPortfolio(portfolio, progress);
    rows.push({
      projectId,
      projectCode: String(p.projectCode || ''),
      title: String(p.title || ''),
      status: String(p.status || ''),
      isActive: p.isActive !== false,
      dueDate: resolveDueDate(p),
      health,
      progress,
      budgetStub: p.budgetStub || null,
    });
  }
  rows.sort((a, b) => {
    const ra = HEALTH_RANK[a.health] ?? 9;
    const rb = HEALTH_RANK[b.health] ?? 9;
    if (ra !== rb) return ra - rb;
    return String(a.title || '').localeCompare(String(b.title || ''), 'vi');
  });
  return {
    asOf: asOf.toISOString(),
    counts,
    portfolio,
    projects: rows,
    budget: {
      enabled: false,
      note: 'Budget accounting ERP out of scope — placeholder only',
    },
  };
}

module.exports = {
  AT_RISK_DUE_SOON_DAYS,
  AT_RISK_LOW_DONE_RATIO,
  AT_RISK_LOW_CARD_DONE_RATIO,
  resolveDueDate,
  classifyProjectHealth,
  aggregateDirectorHealth,
  emptyCardProgress,
  withProgressPercents,
};
