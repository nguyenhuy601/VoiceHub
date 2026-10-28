/**
 * Map predecessor/successor time events → FS|SS|FF|SF (code-owned; not LLM pick).
 * Events are earliest-time constraints (lag 0): start/finish of B vs A.
 */

const DEP_EVENTS = Object.freeze(['START', 'FINISH']);

const EVENT_PAIR_TO_TYPE = Object.freeze({
  'FINISH|START': 'FS',
  'START|START': 'SS',
  'FINISH|FINISH': 'FF',
  'START|FINISH': 'SF',
});

const TYPE_TO_EVENTS = Object.freeze({
  FS: { predecessorEvent: 'FINISH', successorEvent: 'START' },
  SS: { predecessorEvent: 'START', successorEvent: 'START' },
  FF: { predecessorEvent: 'FINISH', successorEvent: 'FINISH' },
  SF: { predecessorEvent: 'START', successorEvent: 'FINISH' },
});

function normalizeDepEvent(value) {
  const token = String(value || '')
    .trim()
    .toUpperCase();
  if (token === 'START' || token === 'BEGIN' || token === 'S') return 'START';
  if (token === 'FINISH' || token === 'END' || token === 'F' || token === 'COMPLETE') {
    return 'FINISH';
  }
  return null;
}

/**
 * @param {string|null|undefined} predecessorEvent
 * @param {string|null|undefined} successorEvent
 * @returns {'FS'|'SS'|'FF'|'SF'|null}
 */
function mapEventsToDepType(predecessorEvent, successorEvent) {
  const pred = normalizeDepEvent(predecessorEvent);
  const succ = normalizeDepEvent(successorEvent);
  if (!pred || !succ) return null;
  return EVENT_PAIR_TO_TYPE[`${pred}|${succ}`] || null;
}

/**
 * One-way legacy: known depType → event pair (read path / old LLM shape).
 * @param {string|null|undefined} depType
 * @returns {{ predecessorEvent: string, successorEvent: string }|null}
 */
function eventsFromDepType(depType) {
  const token = String(depType || '')
    .trim()
    .toUpperCase();
  return TYPE_TO_EVENTS[token] || null;
}

module.exports = {
  DEP_EVENTS,
  EVENT_PAIR_TO_TYPE,
  TYPE_TO_EVENTS,
  normalizeDepEvent,
  mapEventsToDepType,
  eventsFromDepType,
};
