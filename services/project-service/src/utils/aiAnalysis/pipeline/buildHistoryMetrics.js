/**
 * Aggregate hours-by-complexity from SNAP employee history ONLY (HARD-03).
 * Never invent numbers — empty history → sampleSize 0 and empty hours.
 */

const COMPLEXITY_KEYS = Object.freeze(['low', 'medium', 'high']);

function emptyMetrics() {
  return {
    hoursByComplexity: {},
    sampleSize: 0,
  };
}

function normalizeComplexity(raw) {
  const c = String(raw || '')
    .trim()
    .toLowerCase();
  if (c === 'low' || c === 'medium' || c === 'high') return c;
  if (c === 'l' || c === '1' || c === 'simple') return 'low';
  if (c === 'm' || c === '2' || c === 'med' || c === 'normal') return 'medium';
  if (c === 'h' || c === '3' || c === 'hard' || c === 'complex') return 'high';
  return null;
}

function hoursFromHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const candidates = [
    entry.hours,
    entry.effortHours,
    entry.estimatedHours,
    entry.actualHours,
  ];
  for (const raw of candidates) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function historyRowsFromEmployee(employee) {
  if (!employee || typeof employee !== 'object') return [];
  if (Array.isArray(employee.history)) return employee.history;
  if (Array.isArray(employee.capability?.projectExperiences)) {
    return employee.capability.projectExperiences;
  }
  return [];
}

/**
 * @param {object[]} employees
 * @returns {{ hoursByComplexity: object, sampleSize: number }}
 */
function buildHistoryMetricsFromEmployees(employees = []) {
  const buckets = { low: [], medium: [], high: [] };
  let sampleSize = 0;

  for (const emp of Array.isArray(employees) ? employees : []) {
    for (const row of historyRowsFromEmployee(emp)) {
      const complexity = normalizeComplexity(row?.complexity || row?.complexityBand);
      const hours = hoursFromHistoryEntry(row);
      if (!complexity || hours == null) continue;
      buckets[complexity].push(hours);
      sampleSize += 1;
    }
  }

  if (sampleSize === 0) return emptyMetrics();

  const hoursByComplexity = {};
  for (const key of COMPLEXITY_KEYS) {
    const values = buckets[key];
    if (!values.length) continue;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    hoursByComplexity[key] = Math.round(avg * 100) / 100;
  }

  return { hoursByComplexity, sampleSize };
}

/**
 * @param {object|null} snapshot — AiAnalysisSnapshot lean/toObject
 */
function buildHistoryMetricsFromSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return emptyMetrics();

  const employees =
    snapshot.commonFiltered?.employees ||
    snapshot.projected?.employees ||
    snapshot.employees ||
    snapshot.toolData?.employees ||
    [];

  return buildHistoryMetricsFromEmployees(employees);
}

module.exports = {
  buildHistoryMetricsFromEmployees,
  buildHistoryMetricsFromSnapshot,
  emptyMetrics,
};
