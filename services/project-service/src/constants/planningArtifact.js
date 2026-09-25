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
  'ba_review', // legacy in-flight only — no role has planning:ba_review (DEC D9)
  'tech_review',
  'pm_review',
  'po_review',
  'approved',
  'rejected',
  'changes_requested',
]);

const PLANNING_CONTENT_EDITABLE_STATUSES = Object.freeze([
  'draft',
  'rejected',
  'changes_requested',
]);

/**
 * Planning lifecycle — DEC D9: PM → [Tech optional] → PO (BA not required).
 * Legacy ba_review kept for in-flight rows.
 */
const PLANNING_STATUS_TRANSITIONS = Object.freeze({
  draft: ['pm_review', 'ba_review'],
  ba_review: ['tech_review', 'pm_review', 'po_review', 'rejected', 'changes_requested'],
  tech_review: ['pm_review', 'po_review', 'rejected', 'changes_requested'],
  pm_review: ['tech_review', 'po_review', 'rejected', 'changes_requested'],
  po_review: ['approved', 'rejected', 'changes_requested'],
  changes_requested: ['pm_review', 'tech_review', 'po_review'],
  rejected: ['draft'],
  approved: [],
});

const PLANNING_TRANSITION_PERMISSION = Object.freeze({
  'draft:pm_review': 'planning:submit_review',
  'draft:ba_review': 'planning:submit_review',
  'ba_review:tech_review': 'planning:ba_review',
  'ba_review:pm_review': 'planning:ba_review',
  'ba_review:po_review': 'planning:ba_review',
  'ba_review:rejected': 'planning:ba_review',
  'ba_review:changes_requested': 'planning:ba_review',
  'tech_review:pm_review': 'planning:tech_review',
  'tech_review:po_review': 'planning:tech_review',
  'tech_review:rejected': 'planning:tech_review',
  'tech_review:changes_requested': 'planning:tech_review',
  'pm_review:tech_review': 'planning:pm_review',
  'pm_review:po_review': 'planning:pm_review',
  'pm_review:rejected': 'planning:pm_review',
  'pm_review:changes_requested': 'planning:pm_review',
  'po_review:approved': 'planning:po_review',
  'po_review:rejected': 'planning:po_review',
  'po_review:changes_requested': 'planning:po_review',
  'changes_requested:pm_review': 'planning:artifact_edit',
  'changes_requested:tech_review': 'planning:artifact_edit',
  'changes_requested:po_review': 'planning:artifact_edit',
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

function isPlanningContentEditableStatus(status) {
  return PLANNING_CONTENT_EDITABLE_STATUSES.includes(
    String(status || '')
      .trim()
      .toLowerCase()
  );
}

function isPlanningReviewNoteRequired(toStatus) {
  const to = String(toStatus || '')
    .trim()
    .toLowerCase();
  return to === 'changes_requested' || to === 'rejected';
}

function canResubmitPlanningFromChangesRequested(from, to, changesRequestedFrom) {
  if (
    String(from || '')
      .trim()
      .toLowerCase() !== 'changes_requested'
  ) {
    return false;
  }
  const target = String(to || '')
    .trim()
    .toLowerCase();
  const gate = String(changesRequestedFrom || 'pm_review')
    .trim()
    .toLowerCase();
  return target === gate;
}

module.exports = {
  PLANNING_ARTIFACT_KINDS,
  PLANNING_ARTIFACT_STATUSES,
  PLANNING_CONTENT_EDITABLE_STATUSES,
  PLANNING_STATUS_TRANSITIONS,
  PLANNING_TRANSITION_PERMISSION,
  canTransitionPlanningStatus,
  permissionForPlanningTransition,
  normalizePlanningKind,
  isPlanningContentEditableStatus,
  isPlanningReviewNoteRequired,
  canResubmitPlanningFromChangesRequested,
};
