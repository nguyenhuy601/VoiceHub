/**
 * Loop State Contract — history events + Loop1 child transition (S3).
 * Append-only; trim delegated to agentStateSchema (≤50).
 */

const HISTORY_EVENTS = Object.freeze({
  GATE1_REJECT: 'GATE1_REJECT',
  HUMAN_FEEDBACK: 'HUMAN_FEEDBACK',
  GENERATION_CREATED: 'GENERATION_CREATED',
  REPLAN_REQUESTED: 'REPLAN_REQUESTED',
});

const FEEDBACK_SOURCES = Object.freeze({
  GATE1: 'gate1',
  GATE2: 'gate2',
});

const LOOP1_CHILD_EVENTS = Object.freeze([
  HISTORY_EVENTS.GATE1_REJECT,
  HISTORY_EVENTS.HUMAN_FEEDBACK,
  HISTORY_EVENTS.GENERATION_CREATED,
]);

/**
 * Append a history event string (idempotent if last entry already equals event).
 * @param {string[]} history
 * @param {string} event
 * @returns {string[]}
 */
function appendHistoryEvent(history, event) {
  const name = String(event || '').trim();
  if (!name) return Array.isArray(history) ? [...history] : [];
  const next = Array.isArray(history) ? [...history] : [];
  if (next[next.length - 1] === name) return next;
  next.push(name);
  return next;
}

/**
 * Seed Loop1 child transition history (RULE-S03 — child only, never parent CP).
 * @param {string[]} [prior]
 * @returns {string[]}
 */
function buildLoop1ChildHistory(prior = []) {
  let history = Array.isArray(prior) ? [...prior] : [];
  for (const event of LOOP1_CHILD_EVENTS) {
    history = appendHistoryEvent(history, event);
  }
  return history;
}

/**
 * Seed Loop2 replan history on the same run.
 * @param {string[]} [prior]
 * @returns {string[]}
 */
function buildLoop2ReplanHistory(prior = []) {
  let history = Array.isArray(prior) ? [...prior] : [];
  history = appendHistoryEvent(history, HISTORY_EVENTS.HUMAN_FEEDBACK);
  history = appendHistoryEvent(history, HISTORY_EVENTS.REPLAN_REQUESTED);
  return history;
}

/**
 * @param {string[]} history
 * @returns {boolean}
 */
function hasLoop1ChildTriad(history) {
  const h = Array.isArray(history) ? history : [];
  return LOOP1_CHILD_EVENTS.every((e) => h.includes(e));
}

module.exports = {
  HISTORY_EVENTS,
  FEEDBACK_SOURCES,
  LOOP1_CHILD_EVENTS,
  appendHistoryEvent,
  buildLoop1ChildHistory,
  buildLoop2ReplanHistory,
  hasLoop1ChildTriad,
};
