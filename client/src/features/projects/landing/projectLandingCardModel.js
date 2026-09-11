/**
 * Map GET /projects list item → landing card view-model (Tier 1–2).
 */
import { displayDepartmentName } from '../../../utils/orgEntityDisplay.js';

const GRAD_PAIRS = [
  ['#1D4ED8', '#3B82F6'],
  ['#7C3AED', '#A78BFA'],
  ['#D97706', '#FBBF24'],
  ['#059669', '#34D399'],
  ['#DC2626', '#F87171'],
];

const HEALTH_DOT = Object.freeze({
  on_track: 'bg-success',
  at_risk: 'bg-warning',
  delayed: 'bg-destructive',
  paused: 'bg-muted-foreground',
  completed: 'bg-success',
  cancelled: 'bg-muted-foreground',
});

export function pickGrad(seed) {
  const n = String(seed || '')
    .split('')
    .reduce((a, c) => a + c.charCodeAt(0), 0);
  return GRAD_PAIRS[n % GRAD_PAIRS.length];
}

export function normalizeProjectStatus(status) {
  return String(status || '')
    .trim()
    .toLowerCase();
}

export function normalizeProjectPriority(priority) {
  return String(priority || '')
    .trim()
    .toLowerCase();
}

export function normalizeProjectHealth(health) {
  return String(health || '')
    .trim()
    .toLowerCase();
}

/** Locale path under workspace.* */
export function projectStatusLabelKey(status) {
  const st = normalizeProjectStatus(status);
  const allowed = new Set([
    'planning',
    'ready_for_planning',
    'in_development',
    'on_hold',
    'closed',
  ]);
  if (!allowed.has(st)) return null;
  return `workspace.projectHubProjectStatus_${st}`;
}

export function projectPriorityLabelKey(priority) {
  const p = normalizeProjectPriority(priority);
  if (p === 'high') return 'workspace.projectHubPriorityHigh';
  if (p === 'medium') return 'workspace.projectHubPriorityMedium';
  if (p === 'low') return 'workspace.projectHubPriorityLow';
  if (p === 'urgent') return 'workspace.projectHubPriorityUrgent';
  return null;
}

export function projectHealthLabelKey(health) {
  const h = normalizeProjectHealth(health);
  const allowed = new Set([
    'on_track',
    'at_risk',
    'delayed',
    'paused',
    'completed',
    'cancelled',
  ]);
  if (!allowed.has(h)) return null;
  return `workspace.projectLandingHealth_${h}`;
}

export function projectHealthDotClass(health) {
  const h = normalizeProjectHealth(health);
  return HEALTH_DOT[h] || 'bg-muted-foreground';
}

/**
 * @param {string|Date|null|undefined} value
 * @param {string} [locale]
 * @returns {string} empty if invalid
 */
export function formatLandingDeadline(value, locale = 'vi') {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function resolveLandingDeadlineRaw(project) {
  return project?.expectedEndDate || project?.dueDate || null;
}

/**
 * @param {object} p — list project payload
 * @param {string} [locale]
 */
export function buildProjectLandingCard(p, locale = 'vi', idx = 0) {
  const id = String(p?.projectId || p?._id || `project-${idx}`);
  const rawName = p?.title || p?.name || 'Project';
  const name = displayDepartmentName(rawName, locale);
  const initial = String(name).trim().charAt(0).toUpperCase() || 'P';
  const [gradStart, gradEnd] = pickGrad(id);
  const memberCount = Number(p?.memberCount ?? p?.membersCount ?? p?.totalMembers ?? 0);
  const relatedDeptCount = Array.isArray(p?.relatedDepartmentIds)
    ? p.relatedDepartmentIds.length
    : 0;
  const status = normalizeProjectStatus(p?.status);
  const priority = normalizeProjectPriority(p?.priority);
  const health = normalizeProjectHealth(p?.health);
  const progressRaw = p?.progressPercent;
  const progressPercent =
    progressRaw == null || progressRaw === ''
      ? null
      : Number.isFinite(Number(progressRaw))
        ? Math.max(0, Math.min(100, Math.round(Number(progressRaw))))
        : null;
  const deadlineRaw = resolveLandingDeadlineRaw(p);
  const pmUserId = String(p?.pm?.userId || '').trim();
  const pmDisplayName = String(p?.pm?.displayName || '').trim();

  return {
    id,
    name,
    description: p?.description || '',
    initial,
    gradStart,
    gradEnd,
    type: p?.visibility || 'private',
    members: Number.isFinite(memberCount) ? memberCount : 0,
    relatedDeptCount,
    informationLevel: p?.access?.informationLevel || '',
    isSummaryOnly: p?.access?.informationLevel === 'summary',
    raw: p,
    isProject: true,
    defaultBoardId: String(p?.defaultBoardId || p?.boards?.[0]?._id || ''),
    projectCode: String(p?.projectCode || '').trim(),
    status,
    statusLabelKey: projectStatusLabelKey(status),
    priority,
    priorityLabelKey: projectPriorityLabelKey(priority),
    health,
    healthLabelKey: projectHealthLabelKey(health),
    healthDotClass: projectHealthDotClass(health),
    progressPercent,
    deadlineRaw,
    deadlineLabel: formatLandingDeadline(deadlineRaw, locale),
    pmUserId,
    pmDisplayName: pmDisplayName || '',
    hasPm: Boolean(pmUserId),
  };
}

export function buildProjectLandingCards(projects = [], locale = 'vi') {
  return (Array.isArray(projects) ? projects : []).map((p, idx) =>
    buildProjectLandingCard(p, locale, idx)
  );
}
