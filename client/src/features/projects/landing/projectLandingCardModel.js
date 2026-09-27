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

/**
 * Nhãn trạng thái trên thẻ landing — ưu tiên deliveryPhase khi Phase 4
 * (status DB vẫn có thể là in_development).
 * @param {object} project
 * @returns {string|null}
 */
export function resolveLandingStatusLabelKey(project) {
  const status = normalizeProjectStatus(project?.status);
  if (status === 'closed') return projectStatusLabelKey(status);
  const phase = String(project?.deliveryPhase || '')
    .trim()
    .toLowerCase();
  if (phase === 'release_handover') {
    return 'workspace.projectHubProjectStatus_handover';
  }
  return projectStatusLabelKey(status);
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

function normalizeLandingProgressPercent(progressRaw) {
  if (progressRaw == null || progressRaw === '') return null;
  if (!Number.isFinite(Number(progressRaw))) return null;
  return Math.max(0, Math.min(100, Math.round(Number(progressRaw))));
}

/**
 * Gợi ý bước tiếp trên thẻ landing — % board ≠ cổng Phase 3/4 (RR / UAT / handover).
 * @param {object} project — list card payload
 * @returns {{ key: string, params: Record<string, number|string>|null }|null}
 */
export function resolveLandingNextHint(project) {
  const status = normalizeProjectStatus(project?.status);
  if (status === 'closed') return null;

  const phase = String(project?.deliveryPhase || '')
    .trim()
    .toLowerCase();
  const rr = String(project?.releaseReadyStatus || 'none')
    .trim()
    .toLowerCase();
  const uat = String(project?.uatStatus || 'none')
    .trim()
    .toLowerCase();
  const progress = normalizeLandingProgressPercent(project?.progressPercent);
  const atFullBoard = progress != null && progress >= 100;

  if (phase === 'release_handover') {
    if (progress != null && progress < 100) {
      return {
        key: 'workspace.projectLandingNext_phase4HandoverBoardOpen',
        params: { remainingPct: 100 - progress, pct: progress },
      };
    }
    return { key: 'workspace.projectLandingNext_phase4Handover', params: null };
  }

  if (phase === 'qa_uat') {
    if (rr !== 'confirmed') {
      return {
        key: atFullBoard
          ? 'workspace.projectLandingNext_confirmReleaseReadyAt100'
          : 'workspace.projectLandingNext_confirmReleaseReady',
        params: null,
      };
    }
    if (uat !== 'pass') {
      return { key: 'workspace.projectLandingNext_uatPass', params: null };
    }
    return { key: 'workspace.projectLandingNext_advancePhase4', params: null };
  }

  if (phase === 'development' && atFullBoard) {
    return { key: 'workspace.projectLandingNext_advanceQaUat', params: null };
  }

  // BE card cũ chưa trả deliveryPhase — vẫn gợi ý khi board đã 100%.
  if (atFullBoard && !phase) {
    return { key: 'workspace.projectLandingNext_boardCompleteOpenGates', params: null };
  }

  return null;
}

/** @returns {string|null} locale key under workspace.* */
export function resolveLandingNextHintKey(project) {
  return resolveLandingNextHint(project)?.key || null;
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
  const progressPercent = normalizeLandingProgressPercent(p?.progressPercent);
  const deadlineRaw = resolveLandingDeadlineRaw(p);
  const pmUserId = String(p?.pm?.userId || '').trim();
  const pmDisplayName = String(p?.pm?.displayName || '').trim();
  const nextHint = resolveLandingNextHint(p);

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
    statusLabelKey: resolveLandingStatusLabelKey(p),
    priority,
    priorityLabelKey: projectPriorityLabelKey(priority),
    health,
    healthLabelKey: projectHealthLabelKey(health),
    healthDotClass: projectHealthDotClass(health),
    progressPercent,
    nextHintLabelKey: nextHint?.key || null,
    nextHintParams: nextHint?.params || null,
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
