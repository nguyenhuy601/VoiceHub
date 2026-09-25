/**
 * WHAT G4 single-run policy — deprecate 4 WHAT job runs; Gate1 marks phase_what approved.
 * RULE-PO-03: no container.jobs WHAT shells.
 */

const { isAiAnalysisWhatJob } = require('../../constants/aiAnalysisJobs.constants');

/**
 * WHAT_G4_ENABLED default on. Set 0/false/off to restore legacy 4-job / tools_propose local.
 */
function isWhatG4Enabled(env = process.env) {
  const raw = String(env.WHAT_G4_ENABLED ?? '1').trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(raw)) return false;
  return true;
}

/**
 * Throw 409 when client tries to run a classic WHAT job under G4 mode.
 * @param {string} job
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 */
function assertWhatJobDeprecatedForG4(job, opts = {}) {
  if (!isWhatG4Enabled(opts.env)) return;
  if (!isAiAnalysisWhatJob(job)) return;
  const err = new Error(
    `WHAT job "${job}" is deprecated — use phase_what G4 run (prepare → G4 → Gate 1)`
  );
  err.statusCode = 409;
  err.errorCode = 'WHAT_JOB_DEPRECATED_USE_G4';
  err.details = { job, use: 'phase_what', mode: 'g4' };
  throw err;
}

/**
 * After Gate1 approve: mark phase_what ready/approved (compat for HOW unlock).
 * Does NOT create or confirm container.jobs (RULE-PO-03).
 * @param {object} container
 * @param {{ source?: string, at?: string }} [opts]
 */
function markPhaseWhatGate1Approved(container, opts = {}) {
  const next = container && typeof container === 'object' ? { ...container } : {};
  if (next.jobs != null) delete next.jobs;
  next.phaseRuns = { ...(next.phaseRuns || {}) };
  next.phaseRuns.phase_what = {
    ...(next.phaseRuns.phase_what || {}),
    status: next.phaseRuns.phase_what?.status || 'ready',
    gate1: 'approved',
  };
  if (opts.source != null) {
    next.phaseRuns.phase_what.source = String(opts.source);
  }
  if (opts.at != null) {
    next.phaseRuns.phase_what.confirmedAt = String(opts.at);
  }
  return next;
}

/** @deprecated Use markPhaseWhatGate1Approved — no WHAT job shells */
const autoConfirmWhatJobShells = markPhaseWhatGate1Approved;

/**
 * Merge G4 understanding into analyses + phase_what ready meta.
 */
function applyG4UnderstandingToContainer(container, g4Understanding, meta = {}) {
  const next = container && typeof container === 'object' ? { ...container } : {};
  next.analyses = { ...(next.analyses || {}) };
  if (g4Understanding && typeof g4Understanding === 'object') {
    next.analyses.g4Understanding = g4Understanding;
  }
  next.phaseRuns = { ...(next.phaseRuns || {}) };
  next.phaseRuns.phase_what = {
    ...(next.phaseRuns.phase_what || {}),
    status: meta.status || 'ready',
    mode: meta.mode || 'g4',
    remoteRunId: meta.remoteRunId || next.phaseRuns.phase_what?.remoteRunId || null,
    snapshotId: meta.snapshotId || next.phaseRuns.phase_what?.snapshotId || null,
    completedAt: meta.completedAt || new Date().toISOString(),
    durationMs: meta.durationMs ?? g4Understanding?.meta?.durationMs ?? null,
    error: meta.error || null,
    partial: Boolean(g4Understanding?.meta?.partial),
  };
  return next;
}

function hasReadyG4Understanding(containerOrPack) {
  const analyses =
    containerOrPack?.analyses ||
    containerOrPack?.aiAnalysis?.analyses ||
    {};
  const g4 = analyses.g4Understanding;
  if (!g4 || typeof g4 !== 'object') return false;
  return Array.isArray(g4.requirements);
}

module.exports = {
  isWhatG4Enabled,
  assertWhatJobDeprecatedForG4,
  markPhaseWhatGate1Approved,
  autoConfirmWhatJobShells,
  applyG4UnderstandingToContainer,
  hasReadyG4Understanding,
};
