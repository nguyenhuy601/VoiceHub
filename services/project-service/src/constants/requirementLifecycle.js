/**
 * RequirementPack lifecycle + org-level permission keys.
 * AI analysis: manual trigger only (phase 2).
 *
 * Position (+ project role) drives Collaborate UI / approve.
 * Org membership roles (owner/admin/hr) only for Admin Hub import/ops.
 */

const REQUIREMENT_PERMISSIONS = Object.freeze([
  'requirement:view',
  'requirement:import',
  'requirement:submit',
  'requirement:approve',
  'requirement:create-project',
  'requirement:run-ai-planning',
]);

/** Pack statuses allowed to run heuristic AI planning. */
const AI_PLANNING_ALLOWED_STATUSES = Object.freeze([
  'under_review',
  'approved',
  'project_linked',
]);

const REQUIREMENT_PACK_STATUS = Object.freeze([
  'draft',
  'under_review',
  'approved',
  'rejected',
  'project_linked',
]);

const IMPORT_SESSION_STATUS = Object.freeze(['preview', 'imported', 'expired', 'cancelled']);

const AI_ANALYSIS_STATUS = Object.freeze(['none', 'pending', 'ready', 'failed']);

/** Org roles that may import/submit via Admin Hub (not Collaborate nav). */
const REQUIREMENT_ADMIN_ORG_ROLES = Object.freeze(['owner', 'admin', 'hr']);

/** Master position keys — BA may import/submit on Collaborate. */
const REQUIREMENT_SUBMITTER_JOB_TITLE_KEYS = Object.freeze(['business_analyst']);

/** Project role keys — BA may import/submit on Collaborate. */
const REQUIREMENT_SUBMITTER_PROJECT_ROLE_KEYS = Object.freeze(['business_analyst']);

/**
 * Ai được duyệt (requirement:approve): chỉ Product Manager, Project Manager, PO.
 * - Position catalog: `product_manager` (= Product Manager; cũng dùng làm proxy PO khi HR không có key riêng).
 * - Job title alias (không có master key): Product Owner / Project Manager.
 * - Project role: `product_owner`, `project_manager`.
 * Org owner/admin/hr và BA không được duyệt.
 */
const REQUIREMENT_APPROVER_JOB_TITLE_KEYS = Object.freeze(['product_manager']);

/** Normalized job-title strings (lowercase) treated as approver when catalog key thiếu. */
const REQUIREMENT_APPROVER_JOB_TITLE_ALIASES = Object.freeze([
  'product owner',
  'product_owner',
  'project manager',
  'project_manager',
]);

/** Project role keys — PO / Project Manager may approve/reject. */
const REQUIREMENT_APPROVER_PROJECT_ROLE_KEYS = Object.freeze([
  'product_owner',
  'project_manager',
]);

/** @deprecated use SUBMITTER + APPROVER keys */
const REQUIREMENT_PRODUCT_JOB_TITLE_KEYS = Object.freeze([
  ...REQUIREMENT_SUBMITTER_JOB_TITLE_KEYS,
  ...REQUIREMENT_APPROVER_JOB_TITLE_KEYS,
]);

/** @deprecated use SUBMITTER + APPROVER keys */
const REQUIREMENT_PRODUCT_PROJECT_ROLE_KEYS = Object.freeze([
  ...REQUIREMENT_SUBMITTER_PROJECT_ROLE_KEYS,
  ...REQUIREMENT_APPROVER_PROJECT_ROLE_KEYS,
]);

/** @deprecated use REQUIREMENT_ADMIN_ORG_ROLES */
const REQUIREMENT_BA_ORG_ROLES = REQUIREMENT_ADMIN_ORG_ROLES;

const VALID_STATUS_TRANSITIONS = Object.freeze({
  draft: ['under_review'],
  under_review: ['approved', 'rejected', 'draft'],
  approved: ['project_linked'],
  rejected: ['draft'],
  project_linked: [],
});

module.exports = {
  REQUIREMENT_PERMISSIONS,
  REQUIREMENT_PACK_STATUS,
  IMPORT_SESSION_STATUS,
  AI_ANALYSIS_STATUS,
  AI_PLANNING_ALLOWED_STATUSES,
  REQUIREMENT_BA_ORG_ROLES,
  REQUIREMENT_ADMIN_ORG_ROLES,
  REQUIREMENT_SUBMITTER_JOB_TITLE_KEYS,
  REQUIREMENT_SUBMITTER_PROJECT_ROLE_KEYS,
  REQUIREMENT_APPROVER_JOB_TITLE_KEYS,
  REQUIREMENT_APPROVER_JOB_TITLE_ALIASES,
  REQUIREMENT_APPROVER_PROJECT_ROLE_KEYS,
  REQUIREMENT_PRODUCT_JOB_TITLE_KEYS,
  REQUIREMENT_PRODUCT_PROJECT_ROLE_KEYS,
  VALID_STATUS_TRANSITIONS,
};
