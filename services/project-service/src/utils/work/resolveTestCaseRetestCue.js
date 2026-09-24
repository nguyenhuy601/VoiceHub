/**
 * Pure cue for QA after Fail → open bug → Dev fixes → card back to Ready for QA.
 * Board column of parent card is SoT for “ready to retest” (bug Done optional).
 *
 * @param {{
 *   lastResult?: string|null,
 *   hasLinkedBug?: boolean,
 *   linkedBugDone?: boolean,
 *   parentReadyForQa?: boolean,
 * }} input
 */
function resolveTestCaseRetestCue({
  lastResult = null,
  hasLinkedBug = false,
  linkedBugDone = false,
  parentReadyForQa = false,
} = {}) {
  if (!hasLinkedBug) {
    return {
      cue: null,
      needsRetest: false,
      linkedBugOpen: false,
      linkedBugDone: false,
    };
  }
  const fail =
    String(lastResult || '')
      .trim()
      .toLowerCase() === 'fail';
  const bugDone = Boolean(linkedBugDone);
  const parentOnQa = Boolean(parentReadyForQa);

  // Pass (or not Fail) → no retest / no "bug open" chip on the queue.
  if (!fail) {
    return {
      cue: null,
      needsRetest: false,
      linkedBugOpen: false,
      linkedBugDone: bugDone,
    };
  }

  // Parent returned to Ready for QA (or bug already Done) → QA must re-run Fail TC.
  if (bugDone || parentOnQa) {
    return {
      cue: 'needs_retest',
      needsRetest: true,
      linkedBugOpen: !bugDone,
      linkedBugDone: bugDone,
    };
  }

  return {
    cue: 'bug_open',
    needsRetest: false,
    linkedBugOpen: true,
    linkedBugDone: false,
  };
}

module.exports = { resolveTestCaseRetestCue };
