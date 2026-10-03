/**
 * Pure rule: card sẵn sàng đề xuất Done khi đủ TC Pass + không bug open (DEC A2/A4).
 * @param {{ testCases?: object[], openBugs?: object[] }} input
 * @returns {{ ready: boolean, reason: string|null, passCount: number, totalActive: number, openBugCount: number }}
 */
function isActiveTestCase(tc) {
  if (!tc || tc.isActive === false) return false;
  const status = String(tc.status || '')
    .trim()
    .toLowerCase();
  if (status === 'obsolete') return false;
  return true;
}

function normalizeResult(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function evaluateReadyToDone({ testCases = [], openBugs = [] } = {}) {
  const active = (Array.isArray(testCases) ? testCases : []).filter(isActiveTestCase);
  const totalActive = active.length;
  const passCount = active.filter((tc) => normalizeResult(tc.lastResult) === 'pass').length;
  const openBugCount = (Array.isArray(openBugs) ? openBugs : []).filter(Boolean).length;

  if (totalActive < 1) {
    return {
      ready: false,
      reason: 'no_active_test_cases',
      passCount: 0,
      totalActive: 0,
      openBugCount,
    };
  }
  if (openBugCount > 0) {
    return {
      ready: false,
      reason: 'open_bugs',
      passCount,
      totalActive,
      openBugCount,
    };
  }
  if (passCount !== totalActive) {
    return {
      ready: false,
      reason: 'not_all_passed',
      passCount,
      totalActive,
      openBugCount: 0,
    };
  }
  return {
    ready: true,
    reason: null,
    passCount,
    totalActive,
    openBugCount: 0,
  };
}

module.exports = {
  evaluateReadyToDone,
  isActiveTestCase,
};
