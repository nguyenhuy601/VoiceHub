/**
 * Code-side WHAT eligibility — block UC/Data until FR baseline pinned (always-on).
 */

const {
  WHAT_TOOL_DEPENDENCIES,
  CANONICAL_ORDER,
} = require('./whatToolDag');
const { WHAT_FR_TOOL } = require('../whatSecs/sectionCatalog');
const { successfulWhatTools } = require('./artifactCompleteness');
const { needsFrConfirm } = require('../planningRevision/frCheckpoint');

const STOP_WHAT_WAITING_FR_CONFIRM = 'WHAT_WAITING_FR_CONFIRM';
const STOP_WHAT_NO_ELIGIBLE_PROGRESS = 'WHAT_NO_ELIGIBLE_PROGRESS';

function whatReactCatalogTools() {
  return [...CANONICAL_ORDER];
}

function whatToolDepsSatisfied(toolName, done) {
  const name = String(toolName || '').trim();
  if (!name) return false;
  if (!(name in WHAT_TOOL_DEPENDENCIES)) return true;
  const deps = WHAT_TOOL_DEPENDENCIES[name] || [];
  return deps.every((dep) => done.has(dep));
}

/**
 * Tools that list WhatFrTool as a DAG dependency (UC / Data).
 * @param {string} toolName
 */
function dependsOnWhatFr(toolName) {
  const deps = WHAT_TOOL_DEPENDENCIES[toolName] || [];
  return deps.includes(WHAT_FR_TOOL);
}

/**
 * @param {object} state
 * @param {{ catalog?: string[] }} [opts]
 * @returns {{ eligible: string[], blocked: Array<{ toolName: string, blockedBy: string[] }>, running: string[] }}
 */
function computeEligibleWhatTools(state, opts = {}) {
  const catalog = Array.isArray(opts.catalog) ? opts.catalog : whatReactCatalogTools();
  const done = successfulWhatTools(state);
  const eligible = [];
  const blocked = [];
  const running = [];
  const frWaiting = needsFrConfirm(state);

  for (const toolName of catalog) {
    if (done.has(toolName)) continue;

    if (!whatToolDepsSatisfied(toolName, done)) {
      const deps = WHAT_TOOL_DEPENDENCIES[toolName] || [];
      blocked.push({
        toolName,
        blockedBy: deps.filter((d) => !done.has(d)),
      });
      continue;
    }

    // Always-on FR checkpoint: block only FR dependents until baseline pinned.
    if (frWaiting && dependsOnWhatFr(toolName)) {
      blocked.push({
        toolName,
        blockedBy: ['fr_baseline_confirm'],
      });
      continue;
    }

    eligible.push(toolName);
  }

  return { eligible, blocked, running };
}

/**
 * True when nothing eligible and remaining tools are only waiting on FR pin.
 * @param {object} state
 */
function isWaitingFrConfirmOnly(state) {
  if (!needsFrConfirm(state)) return false;
  const { eligible, blocked, running } = computeEligibleWhatTools(state);
  if (eligible.length || running.length) return false;
  const remaining = blocked.filter((b) => !successfulWhatTools(state).has(b.toolName));
  if (!remaining.length) return false;
  return remaining.every(
    (b) =>
      Array.isArray(b.blockedBy) &&
      b.blockedBy.includes('fr_baseline_confirm')
  );
}

function isWhatWaitingFrStopReason(stopReason) {
  return String(stopReason || '') === STOP_WHAT_WAITING_FR_CONFIRM;
}

module.exports = {
  whatReactCatalogTools,
  computeEligibleWhatTools,
  whatToolDepsSatisfied,
  dependsOnWhatFr,
  isWaitingFrConfirmOnly,
  isWhatWaitingFrStopReason,
  STOP_WHAT_WAITING_FR_CONFIRM,
  STOP_WHAT_NO_ELIGIBLE_PROGRESS,
  WHAT_FR_TOOL,
};
