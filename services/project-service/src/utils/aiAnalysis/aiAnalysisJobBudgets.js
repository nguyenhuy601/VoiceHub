/**
 * Per-job AI Analysis wall-clock budgets (env override + defaults).
 */

const WALL_MIN_MS = 30_000;
const WALL_MAX_MS = 600_000;
const REMAINING_MIN_MS = 15_000;

/** Default wall ms per user job (plan table). */
const DEFAULT_JOB_WALL_MS = Object.freeze({
  hierarchyDecomposition: 120_000,
  requirementAnalysis: 300_000,
  capabilityAnalysis: 240_000,
  wbsGeneration: 240_000,
  dependencyAnalysis: 180_000,
  architectureRiskAnalysis: 240_000,
  effortRoleAnalysis: 120_000,
  sequencingCpm: 60_000,
  employeeMatching: 180_000,
  scheduleCapacity: 180_000,
  projectPlan: 60_000,
});

function clampWallMs(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(WALL_MIN_MS, Math.min(WALL_MAX_MS, Math.round(n)));
}

/** camelCase job id → SCREAMING_SNAKE for env suffix. */
function jobIdToEnvSuffix(job) {
  return String(job || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toUpperCase();
}

function envKeyForJobWall(job) {
  return `AI_ANALYSIS_WALL_MS_${jobIdToEnvSuffix(job)}`;
}

/**
 * Resolve wall budget for a user job (classic / service path).
 * Order: AI_ANALYSIS_WALL_MS_<JOB> → job default.
 * @param {string} job
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 * @returns {number}
 */
function resolveJobWallMs(job, opts = {}) {
  const env = opts.env || process.env;
  const id = String(job || '').trim();
  const defaultMs = DEFAULT_JOB_WALL_MS[id] ?? 180_000;

  const perJobRaw = env[envKeyForJobWall(id)];
  if (perJobRaw != null && String(perJobRaw).trim() !== '') {
    return clampWallMs(perJobRaw, defaultMs);
  }

  return clampWallMs(defaultMs, defaultMs);
}

/**
 * Compact path: per-job env → AI_ANALYSIS_COMPACT_JOB_WALL_MS → job default.
 * @param {string} job
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 */
function resolveCompactJobWallMs(job, opts = {}) {
  const env = opts.env || process.env;
  const id = String(job || '').trim();
  const defaultMs = DEFAULT_JOB_WALL_MS[id] ?? 120_000;

  const perJobRaw = env[envKeyForJobWall(id)];
  if (perJobRaw != null && String(perJobRaw).trim() !== '') {
    return clampWallMs(perJobRaw, defaultMs);
  }

  const compactRaw = env.AI_ANALYSIS_COMPACT_JOB_WALL_MS;
  if (compactRaw != null && String(compactRaw).trim() !== '') {
    return clampWallMs(compactRaw, defaultMs);
  }

  return clampWallMs(defaultMs, defaultMs);
}

/**
 * Remaining wall after startedAt; never below minMs.
 * @param {number} wallMs
 * @param {number} startedAt
 * @param {{ now?: number, minMs?: number }} [opts]
 */
function remainingWallMs(wallMs, startedAt, opts = {}) {
  const now = opts.now ?? Date.now();
  const minMs = opts.minMs ?? REMAINING_MIN_MS;
  const elapsed = Math.max(0, now - startedAt);
  const left = Number(wallMs) - elapsed;
  if (!Number.isFinite(left)) return minMs;
  return Math.max(minMs, Math.min(WALL_MAX_MS, Math.round(left)));
}

module.exports = {
  WALL_MIN_MS,
  WALL_MAX_MS,
  REMAINING_MIN_MS,
  DEFAULT_JOB_WALL_MS,
  jobIdToEnvSuffix,
  envKeyForJobWall,
  resolveJobWallMs,
  resolveCompactJobWallMs,
  remainingWallMs,
  clampWallMs,
};
