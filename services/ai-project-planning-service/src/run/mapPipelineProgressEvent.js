/**
 * Normalize raw progress callbacks into a canonical ProgressEvent.
 * RULE-P01/P02: never infer business step/substep from node.
 */

const { SUBSTEPS } = require('../engines/g4/pipelineProgress');

const STATUS_SET = new Set(['running', 'waiting_human', 'succeeded', 'failed']);

/**
 * @param {object|null|undefined} raw
 * @param {{ runId?: string }} [opts]
 * @returns {object|null} canonical event or null if empty/invalid
 */
function mapPipelineProgressEvent(raw, opts = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const runId = String(opts.runId || raw.runId || '').trim() || null;
  const node = raw.node != null ? String(raw.node).trim() : '';
  const tool = raw.tool != null ? String(raw.tool).trim() : '';

  let step = raw.step != null && raw.step !== '' ? Number(raw.step) : null;
  if (step != null && !Number.isFinite(step)) step = null;

  let substep = raw.substep != null ? String(raw.substep).trim() : '';
  if (substep && SUBSTEPS[substep] && step == null) {
    step = SUBSTEPS[substep].step;
  }

  const hasBusiness = step != null && Boolean(substep);
  if (substep && !SUBSTEPS[substep] && hasBusiness) {
    // Unknown catalog id — still accept explicit pair (forward-compat); step required
  }

  let status = raw.status != null ? String(raw.status).trim().toLowerCase() : '';
  if (status && !STATUS_SET.has(status)) status = '';

  let seq = raw.seq != null && raw.seq !== '' ? Number(raw.seq) : null;
  if (seq != null && !Number.isFinite(seq)) seq = null;

  if (!hasBusiness && !node && !tool && !status) return null;

  return {
    runId,
    seq,
    step: hasBusiness ? step : null,
    substep: hasBusiness ? substep : null,
    node: node || null,
    tool: tool || null,
    status: status || null,
    emittedAt: raw.emittedAt ? String(raw.emittedAt) : null,
  };
}

module.exports = {
  mapPipelineProgressEvent,
  STATUS_SET,
};
