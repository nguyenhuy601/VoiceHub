/**
 * Gate1/HITL actor flags — project role wins for this pack's project.
 * Org requirementAccess alone misses PO who only has product_owner on the project.
 *
 * Approvers (requirement:approve): Product Owner, Project Manager (+ Product Manager via org persona).
 * Submitters: Business Analyst. Panel SoD: canApprove never shows BA «Xác nhận duyệt».
 * Gate2 Planning: PM (planning:pm_review) → PO (planning:po_review).
 */

const APPROVER_PROJECT_ROLE_KEYS = new Set(['product_owner', 'project_manager']);
const SUBMITTER_PROJECT_ROLE_KEYS = new Set(['business_analyst']);
const GATE2_PM_ROLE_KEYS = new Set(['project_manager']);
const GATE2_PO_ROLE_KEYS = new Set(['product_owner']);

function normKeys(keys) {
  if (!Array.isArray(keys)) return [];
  return keys.map((k) => String(k || '').trim().toLowerCase()).filter(Boolean);
}

/**
 * @param {{
 *   canSubmitOrg?: boolean,
 *   canApproveOrg?: boolean,
 *   canRunOrg?: boolean,
 *   canPromoteOrg?: boolean,
 *   viewerProjectRoleKeys?: string[],
 *   canReviewAnalysisPo?: boolean,
 *   canBaAuthorAnalysis?: boolean,
 *   canReviewAnalysisBa?: boolean,
 *   canReviewPlanningPm?: boolean,
 *   canReviewPlanningPo?: boolean,
 * }} input
 */
export function resolveHitlRequirementFlags(input = {}) {
  const keys = normKeys(input.viewerProjectRoleKeys);
  const projectApprove =
    Boolean(input.canReviewAnalysisPo) || keys.some((k) => APPROVER_PROJECT_ROLE_KEYS.has(k));
  const projectSubmit =
    Boolean(input.canBaAuthorAnalysis) ||
    Boolean(input.canReviewAnalysisBa) ||
    keys.some((k) => SUBMITTER_PROJECT_ROLE_KEYS.has(k));
  const canReviewGate2Pm =
    Boolean(input.canReviewPlanningPm) || keys.some((k) => GATE2_PM_ROLE_KEYS.has(k));
  const canReviewGate2Po =
    Boolean(input.canReviewPlanningPo) || keys.some((k) => GATE2_PO_ROLE_KEYS.has(k));

  return {
    canSubmit: Boolean(input.canSubmitOrg) || projectSubmit,
    canApprove: Boolean(input.canApproveOrg) || projectApprove,
    canRun: Boolean(input.canRunOrg) || projectApprove || projectSubmit,
    // Gate2 activate: org create-from-pack OR project PO (planning:po_review)
    canPromote: Boolean(input.canPromoteOrg) || canReviewGate2Po,
    canReviewGate2Pm,
    canReviewGate2Po,
    projectApprove,
    projectSubmit,
  };
}

export {
  APPROVER_PROJECT_ROLE_KEYS,
  SUBMITTER_PROJECT_ROLE_KEYS,
  GATE2_PM_ROLE_KEYS,
  GATE2_PO_ROLE_KEYS,
};

export default resolveHitlRequirementFlags;
