/**
 * Resolution actions. Semantic merge and business conflicts are proposals.
 * Model-reported confidence cannot raise autoApply (RULE-SL-05, RULE-SL-06).
 */

const ACTIONS = Object.freeze({
  SKIP_REPROCESS: { autoApply: true, requiresAuthority: false, level: 'RULE' },
  REUSE_AND_LINK: { autoApply: true, requiresAuthority: false, level: 'RULE' },
  DRAFT_VERSION: { autoApply: true, requiresAuthority: false, level: 'RULE' },
  MERGE_PROPOSAL: { autoApply: false, requiresAuthority: false, level: 'EVIDENCE_PROPOSAL' },
  SUPPLEMENT: { autoApply: false, requiresAuthority: false, level: 'EVIDENCE_PROPOSAL' },
  CONFLICT: { autoApply: false, requiresAuthority: true, level: 'AUTHORITY' },
  KEEP_SEPARATE: { autoApply: true, requiresAuthority: false, level: 'RULE' },
  NEEDS_REVIEW: { autoApply: false, requiresAuthority: true, level: 'AUTHORITY' },
});

function applyResolutionPolicy(input = {}) {
  let action = 'NEEDS_REVIEW';
  if (input.otherProject && input.similar) action = 'KEEP_SEPARATE';
  else if (input.businessConflict) action = 'CONFLICT';
  else if (input.sameSource && input.sameVersion && input.sameContent) action = 'SKIP_REPROCESS';
  else if (input.sameContent && input.sameScope && input.clearIdentity) action = 'REUSE_AND_LINK';
  else if (input.sameEntity && input.contentChanged) action = 'DRAFT_VERSION';
  else if (input.similarMeaning) action = 'MERGE_PROPOSAL';
  else if (input.supplemental) action = 'SUPPLEMENT';

  const spec = ACTIONS[action];
  return {
    action,
    autoApply: spec.autoApply,
    requiresAuthority: spec.requiresAuthority,
    level: spec.level,
    replacesApproved: false,
    llmConfidenceIgnored: input.llmConfidence != null,
  };
}

module.exports = {
  ACTIONS,
  applyResolutionPolicy,
};
