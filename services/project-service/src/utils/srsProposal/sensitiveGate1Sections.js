/**
 * Gate1 sensitive sections — BA edit → PO (re)approval (RULE-03).
 */

const SENSITIVE_GATE1_SECTIONS = Object.freeze([
  'functionalRequirements',
  'businessRules',
  'actors',
  'scope',
]);

const SENSITIVE_SET = new Set(SENSITIVE_GATE1_SECTIONS);

function isSensitiveGate1Section(section) {
  return SENSITIVE_SET.has(String(section || '').trim());
}

/**
 * True when decision is an edit (or accept with editedPayload) on a sensitive section.
 * @param {{ action?: string, editedPayload?: object|null, section?: string }} decision
 * @param {string} [sectionFromItem]
 */
function decisionTouchesSensitiveSection(decision, sectionFromItem = '') {
  const section = String(decision?.section || sectionFromItem || '').trim();
  if (!isSensitiveGate1Section(section)) return false;
  const action = String(decision?.action || '').toLowerCase();
  if (action === 'edit') return true;
  if (action === 'accept' && decision?.editedPayload && typeof decision.editedPayload === 'object') {
    return true;
  }
  return false;
}

/**
 * Scan reviewDecisions (array or map) against proposal items for sensitive edits.
 * @param {object|null} proposal
 * @param {object|Array|null} reviewDecisions
 * @returns {{ hasSensitiveEdit: boolean, sections: string[] }}
 */
function detectSensitiveGate1Edits(proposal, reviewDecisions) {
  if (!reviewDecisions || typeof reviewDecisions !== 'object') {
    return { hasSensitiveEdit: false, sections: [] };
  }

  const { listProposalItems } = require('./review');
  const items = proposal ? listProposalItems(proposal) : [];
  const byId = new Map(items.map((row) => [String(row.logicalId), row]));

  const entries = Array.isArray(reviewDecisions)
    ? reviewDecisions
    : Object.entries(reviewDecisions).map(([logicalId, decision]) => ({
        logicalId,
        ...(decision || {}),
      }));

  const touched = new Set();
  for (const entry of entries) {
    const logicalId = entry?.logicalId != null ? String(entry.logicalId) : '';
    const row = logicalId ? byId.get(logicalId) : null;
    const section = entry.section || row?.section || '';
    if (decisionTouchesSensitiveSection(entry, section)) {
      touched.add(String(section));
    }
  }

  return {
    hasSensitiveEdit: touched.size > 0,
    sections: [...touched],
  };
}

/**
 * Pure helper: next pack fields when sensitive re-approval is required.
 * @param {{ status: string, aiAnalysis?: object }} packLike
 * @param {{ hasSensitiveEdit: boolean }} detection
 */
function applySensitiveReapprovalState(packLike, detection) {
  const status = String(packLike?.status || '');
  const hasSensitiveEdit = Boolean(detection?.hasSensitiveEdit);
  const shell =
    packLike?.aiAnalysis && typeof packLike.aiAnalysis === 'object'
      ? { ...packLike.aiAnalysis }
      : {};
  const gate1 = shell.gate1 && typeof shell.gate1 === 'object' ? { ...shell.gate1 } : {};

  if (!hasSensitiveEdit) {
    return {
      status,
      clearPoStamp: false,
      poReapprovalRequired: Boolean(gate1.poReapprovalRequired),
      aiAnalysis: packLike?.aiAnalysis || null,
      transitionToUnderReview: status === 'draft',
    };
  }

  gate1.poReapprovalRequired = true;
  gate1.sensitiveSectionsEdited = detection.sections || [];
  gate1.reapprovalRequestedAt = new Date().toISOString();
  shell.gate1 = gate1;

  const clearPoStamp = status === 'approved';
  if (clearPoStamp) {
    const phaseRuns = shell.phaseRuns && typeof shell.phaseRuns === 'object' ? { ...shell.phaseRuns } : {};
    const phaseWhat =
      phaseRuns.phase_what && typeof phaseRuns.phase_what === 'object'
        ? { ...phaseRuns.phase_what }
        : {};
    if (phaseWhat.gate1 === 'approved') {
      phaseWhat.gate1 = 'pending_reapproval';
      delete phaseWhat.confirmedAt;
    }
    phaseRuns.phase_what = phaseWhat;
    shell.phaseRuns = phaseRuns;
  }

  return {
    status: clearPoStamp || status === 'draft' || status === 'under_review' ? 'under_review' : status,
    clearPoStamp,
    poReapprovalRequired: true,
    aiAnalysis: shell,
    transitionToUnderReview: status === 'draft' || clearPoStamp,
    allowFromApproved: clearPoStamp,
  };
}

module.exports = {
  SENSITIVE_GATE1_SECTIONS,
  isSensitiveGate1Section,
  decisionTouchesSensitiveSection,
  detectSensitiveGate1Edits,
  applySensitiveReapprovalState,
};
