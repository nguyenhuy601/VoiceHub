/**
 * Pure rule: project Release Ready (DEC B1–B2).
 * @param {object} input
 * @returns {{
 *   ready: boolean,
 *   reason: string|null,
 *   blockers: string[],
 *   openBugCount: number,
 *   tcPassCount: number,
 *   tcTotal: number,
 *   cardsPendingCount: number,
 *   pendingCrCount: number,
 * }}
 */
function isActiveLinkedTc(tc) {
  if (!tc || tc.isActive === false) return false;
  const status = String(tc.status || '')
    .trim()
    .toLowerCase();
  if (status === 'obsolete') return false;
  if (!tc.workItemId) return false;
  return true;
}

function normalizeResult(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function evaluateReleaseReady({
  deliveryPhase = '',
  openBugCount = 0,
  linkedTestCases = [],
  sprintCardsWithTc = [],
  pendingCrCount = 0,
} = {}) {
  const blockers = [];
  const phase = String(deliveryPhase || '')
    .trim()
    .toLowerCase();

  const active = (Array.isArray(linkedTestCases) ? linkedTestCases : []).filter(isActiveLinkedTc);
  const tcTotal = active.length;
  const tcPassCount = active.filter((tc) => normalizeResult(tc.lastResult) === 'pass').length;
  const bugs = Math.max(0, Number(openBugCount) || 0);
  const pendingCr = Math.max(0, Number(pendingCrCount) || 0);
  const cardsPending = (Array.isArray(sprintCardsWithTc) ? sprintCardsWithTc : []).filter(
    (c) => c && !c.isDone && !c.readyToDone
  ).length;

  if (phase !== 'qa_uat') blockers.push('wrong_phase');
  if (bugs > 0) blockers.push('open_bugs');
  if (tcTotal < 1) blockers.push('no_linked_test_cases');
  else if (tcPassCount !== tcTotal) blockers.push('tc_not_pass');
  if (cardsPending > 0) blockers.push('cards_pending');
  if (pendingCr > 0) blockers.push('pending_crs');

  const ready = blockers.length === 0;
  return {
    ready,
    reason: ready ? null : blockers[0],
    blockers,
    openBugCount: bugs,
    tcPassCount,
    tcTotal,
    cardsPendingCount: cardsPending,
    pendingCrCount: pendingCr,
  };
}

module.exports = {
  evaluateReleaseReady,
  isActiveLinkedTc,
};
