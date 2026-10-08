const TEST_CASE_STATUSES = Object.freeze(['draft', 'ready', 'obsolete']);
const TEST_CASE_RESULTS = Object.freeze(['pass', 'fail']);

function invalid(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeTestCaseStatus(value, fallback = null) {
  const status = normalizeToken(value);
  if (!status) return fallback;
  return TEST_CASE_STATUSES.includes(status) ? status : null;
}

function assertTestCaseResult(value) {
  const result = normalizeToken(value);
  if (!TEST_CASE_RESULTS.includes(result)) {
    throw invalid('result phải là pass hoặc fail');
  }
  return result;
}

module.exports = {
  TEST_CASE_STATUSES,
  TEST_CASE_RESULTS,
  normalizeTestCaseStatus,
  assertTestCaseResult,
};
