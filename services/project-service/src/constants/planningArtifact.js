/**
 * Planning artifact kinds, lifecycle, and permissions (Phase 1 Delivery Planning).
 */

const PLANNING_ARTIFACT_KINDS = Object.freeze([
  'WBS',
  'ARCHITECTURE',
  'RESOURCE',
  'DEPENDENCY',
  'SCHEDULE',
  'MILESTONE',
  'RELEASE',
  'RISK',
]);

const PLANNING_ARTIFACT_STATUSES = Object.freeze([
  'draft',
  'ba_review',
  'tech_review',
  'pm_review',
  'po_review',
  'approved',
  'rejected',
]);

const PLANNING_STATUS_TRANSITIONS = Object.freeze({
  draft: ['ba_review'],
  ba_review: ['tech_review', 'rejected'],
  tech_review: ['pm_review', 'rejected'],
  pm_review: ['po_review', 'rejected'],
  po_review: ['approved', 'rejected'],
  rejected: ['draft'],
  approved: [],
});

const PLANNING_TRANSITION_PERMISSION = Object.freeze({
  'draft:ba_review': 'planning:submit_review',
  'ba_review:tech_review': 'planning:ba_review',
  'ba_review:rejected': 'planning:ba_review',
  'tech_review:pm_review': 'planning:tech_review',
  'tech_review:rejected': 'planning:tech_review',
  'pm_review:po_review': 'planning:pm_review',
  'pm_review:rejected': 'planning:pm_review',
  'po_review:approved': 'planning:po_review',
  'po_review:rejected': 'planning:po_review',
  'rejected:draft': 'planning:artifact_edit',
});

function canTransitionPlanningStatus(from, to) {
  const a = String(from || '')
    .trim()
    .toLowerCase();
  const b = String(to || '')
    .trim()
    .toLowerCase();
  if (!PLANNING_ARTIFACT_STATUSES.includes(a) || !PLANNING_ARTIFACT_STATUSES.includes(b)) {
    return false;
  }
  if (a === b) return true;
  return (PLANNING_STATUS_TRANSITIONS[a] || []).includes(b);
}

function permissionForPlanningTransition(from, to) {
  const a = String(from || '')
    .trim()
    .toLowerCase();
  const b = String(to || '')
    .trim()
    .toLowerCase();
  return PLANNING_TRANSITION_PERMISSION[`${a}:${b}`] || null;
}

function normalizePlanningKind(kind) {
  const k = String(kind || '')
    .trim()
    .toUpperCase();
  return PLANNING_ARTIFACT_KINDS.includes(k) ? k : null;
}

module.exports = {
  PLANNING_ARTIFACT_KINDS,
  PLANNING_ARTIFACT_STATUSES,
  PLANNING_STATUS_TRANSITIONS,
  PLANNING_TRANSITION_PERMISSION,
  canTransitionPlanningStatus,
  permissionForPlanningTransition,
  normalizePlanningKind,
};
