/**
 * Semantic validation for LLM staffing proposal vs pack baseline.
 * Pure — never throws.
 */

const {
  computeStaffingDelta,
  collectLeafRoleKeys,
} = require('./aiPlanningStaffingBaseline');
const { normalizeRoleKey } = require('./requirementStaffingParse');

const HOURS_REJECT_PCT = 50;
const HOURS_WARN_PCT = 25;

function emptyValidation(status = 'skipped') {
  return {
    status,
    errors: [],
    warnings: [],
    delta: null,
  };
}

function hasRoles(proposal) {
  return Array.isArray(proposal?.requiredRoles) && proposal.requiredRoles.length > 0;
}

function hasSkills(proposal) {
  return Array.isArray(proposal?.requiredSkills) && proposal.requiredSkills.length > 0;
}

/**
 * @param {{
 *   proposal: object|null,
 *   baseline: object,
 *   pack?: object,
 *   dropped?: string[],
 * }} input
 */
function validateStaffingProposal({ proposal, baseline, pack, dropped = [] } = {}) {
  if (!proposal || typeof proposal !== 'object') {
    return emptyValidation('skipped');
  }
  if (!baseline || typeof baseline !== 'object') {
    return emptyValidation('skipped');
  }

  const errors = [];
  const warnings = [];
  const delta = computeStaffingDelta(baseline, proposal);

  const leafRoleKeys = pack ? collectLeafRoleKeys(pack) : new Set(Object.keys(baseline.leafCountByRole || {}));
  const proposalRoleKeys = new Set(
    (proposal.requiredRoles || []).map((r) => normalizeRoleKey(r.roleKey)).filter(Boolean)
  );

  for (const roleKey of leafRoleKeys) {
    if (!proposalRoleKeys.has(roleKey)) {
      errors.push({
        code: 'missing_leaf_role',
        message: `Proposal thiếu role ${roleKey} có trên FR leaves`,
        roleKey,
      });
    }
  }

  const totalLeafHours = Number(baseline.totalLeafHours) || 0;
  const proposalHours =
    proposal.estimatedHoursTotal != null && Number.isFinite(Number(proposal.estimatedHoursTotal))
      ? Number(proposal.estimatedHoursTotal)
      : null;

  if (totalLeafHours > 0 && proposalHours != null) {
    const pct = Math.abs(proposalHours - totalLeafHours) / totalLeafHours;
    if (pct > HOURS_REJECT_PCT / 100) {
      errors.push({
        code: 'hours_delta_exceeded',
        message: `estimatedHoursTotal lệch ${Math.round(pct * 100)}% so với tổng giờ leaves (${totalLeafHours}h)`,
        hoursDeltaPct: Math.round(pct * 100),
      });
    } else if (pct > HOURS_WARN_PCT / 100) {
      warnings.push({
        code: 'hours_delta_warning',
        message: `estimatedHoursTotal lệch ${Math.round(pct * 100)}% so với tổng giờ leaves`,
        hoursDeltaPct: Math.round(pct * 100),
      });
    }
  }

  for (const roleKey of proposalRoleKeys) {
    if (!leafRoleKeys.has(roleKey)) {
      warnings.push({
        code: 'extra_role',
        message: `Proposal có role ${roleKey} không xuất hiện trên FR leaves`,
        roleKey,
      });
    }
  }

  const baselineHasRoles = Object.keys(baseline.leafCountByRole || {}).length > 0;
  const baselineHasSkills = (baseline.rollup?.requiredSkills || []).length > 0;
  if (baselineHasRoles && baselineHasSkills) {
    if (hasSkills(proposal) && !hasRoles(proposal)) {
      warnings.push({
        code: 'partial_proposal_roles',
        message: 'Proposal chỉ có skills, thiếu requiredRoles',
      });
    }
    if (hasRoles(proposal) && !hasSkills(proposal)) {
      warnings.push({
        code: 'partial_proposal_skills',
        message: 'Proposal chỉ có roles, thiếu requiredSkills',
      });
    }
  }

  if (Array.isArray(dropped) && dropped.length) {
    warnings.push({
      code: 'normalize_dropped',
      message: `LLM output dropped ${dropped.length} item(s) during normalize`,
      dropped: dropped.slice(0, 20),
    });
  }

  let status = 'ok';
  if (errors.length) {
    status = 'rejected';
  } else if (warnings.length) {
    status = 'warnings';
  }

  return {
    status,
    errors,
    warnings,
    delta,
  };
}

function deriveStaffingStatus(llmStaff, validation) {
  if (!llmStaff || typeof llmStaff !== 'object') {
    return 'failed';
  }
  if (llmStaff.status === 'skipped') return 'skipped';
  if (llmStaff.status === 'failed') return 'failed';
  if (llmStaff.status === 'proposed') {
    if (validation?.status === 'rejected') return 'rejected_semantic';
    if (validation?.status === 'warnings') return 'proposed_with_warnings';
    return 'proposed';
  }
  return llmStaff.status || 'failed';
}

function canApproveStaffingProposal(overlay) {
  if (!overlay || typeof overlay !== 'object') return false;
  const proposal = overlay.staffingProposal;
  if (!proposal || typeof proposal !== 'object') return false;
  if (proposal.accepted || overlay.staffingProposalAcceptedAt) return false;
  if (overlay.proposalValidation?.status === 'rejected') return false;
  return true;
}

module.exports = {
  HOURS_REJECT_PCT,
  HOURS_WARN_PCT,
  validateStaffingProposal,
  deriveStaffingStatus,
  emptyValidation,
  canApproveStaffingProposal,
};
