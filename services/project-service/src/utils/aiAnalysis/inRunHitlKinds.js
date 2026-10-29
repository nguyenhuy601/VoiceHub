/**
 * Hybrid HITL — in-run kinds (mirror AI planning service).
 * Gate 1/2 are NOT in-run kinds.
 */

const IN_RUN_KINDS = Object.freeze(['clarify', 'edit_draft', 'wbs_confirm']);

function normalizeInRunKind(raw) {
  const k = String(raw || '').trim().toLowerCase();
  if (k === 'edit_draft' || k === 'edit' || k === 'review_edit') return 'edit_draft';
  if (k === 'clarify' || k === 'ask_user' || k === 'respond') return 'clarify';
  if (
    k === 'wbs_confirm' ||
    k === 'confirm_wbs' ||
    k === 'wbs_checkpoint' ||
    k === 'wbs_stage'
  ) {
    return 'wbs_confirm';
  }
  return k;
}

function isInRunHitlKind(raw) {
  return IN_RUN_KINDS.includes(normalizeInRunKind(raw));
}

module.exports = {
  IN_RUN_KINDS,
  normalizeInRunKind,
  isInRunHitlKind,
};
