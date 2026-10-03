/**
 * Pure progress state reducer — ordering + apply transitions.
 * RULE-P01: step+substep = canonical business progress.
 * RULE-P02: node/tool-only updates activity metadata only.
 * RULE-P05: stale seq ignored; duplicate seq idempotent.
 */

const { SUBSTEPS } = require('../engines/g4/pipelineProgress');
const { mapPipelineProgressEvent } = require('./mapPipelineProgressEvent');

/** Catalog order for forward-only substep checks */
const SUBSTEP_ORDER = Object.keys(SUBSTEPS);

let staleProgressEventTotal = 0;

function getStaleProgressEventTotal() {
  return staleProgressEventTotal;
}

function resetStaleProgressEventTotalForTests() {
  staleProgressEventTotal = 0;
}

/**
 * @param {object} current PlanningRun-like slice
 * @returns {{ pipelineStep: number|null, pipelineSubstep: string|null, currentNode: string|null, currentTool: string|null, progressVersion: number, status: string|null }}
 */
function snapshotProgress(current = {}) {
  return {
    pipelineStep: current.pipelineStep ?? null,
    pipelineSubstep: current.pipelineSubstep || null,
    currentNode: current.currentNode || null,
    currentTool: current.currentTool || null,
    progressVersion: Number(current.progressVersion) || 0,
    status: current.status || null,
  };
}

function substepRank(substep) {
  const idx = SUBSTEP_ORDER.indexOf(String(substep || ''));
  return idx >= 0 ? idx : -1;
}

/**
 * @param {object} current
 * @param {object|null} rawEvt
 * @param {{ runId?: string, now?: Date }} [opts]
 * @returns {{ action: 'apply'|'ignore'|'idempotent', reason?: string, next?: object, from?: object, event?: object }}
 */
function reduceProgressState(current, rawEvt, opts = {}) {
  const from = snapshotProgress(current);
  const event = mapPipelineProgressEvent(rawEvt, { runId: opts.runId });
  if (!event) {
    return { action: 'ignore', reason: 'empty_event', from };
  }

  const version = from.progressVersion;
  let seq = event.seq;

  if (seq != null) {
    if (seq < version) {
      staleProgressEventTotal += 1;
      return { action: 'ignore', reason: 'stale_seq', from, event };
    }
    if (seq === version) {
      return { action: 'idempotent', reason: 'duplicate_seq', from, event, next: { ...from } };
    }
  } else {
    seq = version + 1;
  }

  const next = { ...from };
  let businessChanged = false;
  let metaChanged = false;

  if (event.step != null && event.substep) {
    const nextRank = substepRank(event.substep);
    const curRank = substepRank(from.pipelineSubstep);
    // Allow first set, same, or forward; block backward when ranks known
    if (curRank >= 0 && nextRank >= 0 && nextRank < curRank) {
      staleProgressEventTotal += 1;
      return { action: 'ignore', reason: 'backward_substep', from, event };
    }
    if (
      next.pipelineStep !== event.step ||
      next.pipelineSubstep !== event.substep
    ) {
      next.pipelineStep = event.step;
      next.pipelineSubstep = event.substep;
      businessChanged = true;
    }
    // Business boundary clears stale tool unless this event also sets a tool
    if (event.tool == null || event.tool === '') {
      if (next.currentTool) {
        next.currentTool = null;
        metaChanged = true;
      }
    }
  }

  if (event.node) {
    if (next.currentNode !== event.node) {
      next.currentNode = event.node;
      metaChanged = true;
    }
  }
  if (event.tool !== null && event.tool !== undefined) {
    const toolVal = event.tool || null;
    if (next.currentTool !== toolVal) {
      next.currentTool = toolVal;
      metaChanged = true;
    }
  }

  // Lifecycle hint on progress event (optional) — does not clear business progress
  if (event.status === 'waiting_human' || event.status === 'failed' || event.status === 'succeeded') {
    // status on PlanningRun is owned by controller lifecycle; store hint only if provided
    // Reducer exposes statusHint for callers; keep pipeline fields
    next.statusHint = event.status;
    metaChanged = true;
  }

  if (!businessChanged && !metaChanged && seq === version) {
    return { action: 'idempotent', reason: 'no_change', from, event, next };
  }

  next.progressVersion = seq;
  next.progressUpdatedAt = opts.now || new Date();

  return {
    action: 'apply',
    from,
    event: { ...event, seq },
    next,
  };
}

module.exports = {
  reduceProgressState,
  snapshotProgress,
  SUBSTEP_ORDER,
  getStaleProgressEventTotal,
  resetStaleProgressEventTotalForTests,
};
