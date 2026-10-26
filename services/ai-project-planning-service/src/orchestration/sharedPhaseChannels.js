/**
 * SharedChannels contract — Pattern B parent↔subgraph I/O whitelist.
 * Private keys stay on subgraph Annotation only (RULE-SG-03).
 */

const { deepMergePlanningContainers } = require('../tools/mergePlanningContainers');

/** @type {readonly string[]} */
const SHARED_PHASE_KEYS = Object.freeze([
  'runId',
  'snapshotId',
  'snapshot',
  'pack',
  'toolData',
  'container',
  'corpus',
  'contextPackage',
  'history',
  'toolResults',
  'messages',
  'evaluate',
  'feasibilitySignal',
  'feasibility',
  'goal',
  'currentGoal',
  'constraints',
  'budget',
  'stopReason',
  'startedAt',
  'hitl',
  'skipUnderstand',
  'agentIteration',
  'currentToolName',
  'gapReport',
  'enrichLoop',
  'completeness',
  'env',
  'generationId',
  // WHAT-leaning shared (also on orchestrator for what branch)
  'frUnderstanding',
  'proposalFragment',
  'conflictAmbiguityGate',
  'requirementIntegrityGate',
  'frOpts',
  'understandingPartial',
  'corpusContentHash',
  'paused',
  'srsProposal',
  'engineResultsById',
  'semanticStatuses',
  'whatTiming',
  'humanResume',
]);

/** Keys sec/section subgraphs may share with phase (subset of SHARED). */
const SEC_SHARED_KEYS = Object.freeze([
  'pack',
  'container',
  'toolData',
  'snapshot',
  'snapshotId',
  'env',
  'contextPackage',
  'runId',
  'toolResults',
  'history',
  'messages',
  'currentToolName',
]);

/** Examples of private keys — must not appear on orchestrator Annotation. */
const EXAMPLE_PRIVATE_KEYS = Object.freeze([
  'semanticOut',
  'facts',
  'proposed',
  'prepared',
  'result',
  'containerPatch',
  'generateJsonFn',
  'phaseResult',
  'input',
]);

/** Orchestrator routing only — not on phase graphs. */
const ORCHESTRATOR_ONLY_KEYS = Object.freeze(['phase', 'threadId', 'output']);

function appendList(left, right) {
  const base = Array.isArray(left) ? left : [];
  if (right == null) return base;
  return base.concat(Array.isArray(right) ? right : [right]);
}

function mergeStopReason(left, right) {
  return left || right || null;
}

function mergeCurrentToolName(left, right) {
  if (!left) return right || null;
  if (!right || left === right) return left;
  const names = new Set(String(`${left}|${right}`).split('|').filter(Boolean));
  return [...names].join('|');
}

function mergeMaxNumber(left, right) {
  return Math.max(Number(left) || 0, Number(right) || 0);
}

function mergeObjectAssign(left, right) {
  if (right == null) return left || {};
  return { ...(left || {}), ...(right || {}) };
}

/**
 * Concurrent-safe last-write-wins for channels that Pattern B subgraphs echo
 * on Send fan-out (LangGraph LastValue forbids 2+ writes per step).
 * @param {*} left
 * @param {*} right
 */
function preferRight(left, right) {
  return right === undefined ? left : right;
}

/**
 * LastValue-compatible Annotation that tolerates parallel Send updates.
 * @param {{ Annotation: Function }} deps
 */
function lastWriteField(deps) {
  const { Annotation } = deps;
  return Annotation({ reducer: preferRight });
}

/**
 * Shared channel Annotation fragments (reducers aligned parent/subgraph).
 * Caller merges with private + orchestrator-only fields.
 * @param {{ Annotation: Function, field?: Function }} deps
 */
function buildSharedPhaseAnnotations(deps) {
  const { Annotation } = deps;
  const field = () => lastWriteField(deps);
  return {
    runId: field(),
    snapshotId: field(),
    snapshot: field(),
    pack: field(),
    toolData: field(),
    container: Annotation({
      reducer: (left, right) => {
        if (right == null) return left;
        return deepMergePlanningContainers(left, right);
      },
    }),
    corpus: field(),
    contextPackage: field(),
    history: Annotation({
      reducer: appendList,
      default: () => [],
    }),
    toolResults: Annotation({
      reducer: appendList,
      default: () => [],
    }),
    messages: Annotation({
      reducer: appendList,
      default: () => [],
    }),
    evaluate: field(),
    feasibilitySignal: field(),
    feasibility: field(),
    goal: field(),
    currentGoal: field(),
    constraints: field(),
    budget: field(),
    stopReason: Annotation({
      reducer: mergeStopReason,
    }),
    startedAt: field(),
    hitl: field(),
    skipUnderstand: field(),
    agentIteration: Annotation({
      reducer: mergeMaxNumber,
      default: () => 0,
    }),
    currentToolName: Annotation({
      reducer: mergeCurrentToolName,
    }),
    gapReport: field(),
    enrichLoop: Annotation({
      reducer: mergeMaxNumber,
      default: () => 0,
    }),
    completeness: field(),
    env: field(),
    generationId: field(),
    frUnderstanding: field(),
    proposalFragment: field(),
    conflictAmbiguityGate: field(),
    requirementIntegrityGate: field(),
    frOpts: field(),
    understandingPartial: field(),
    corpusContentHash: field(),
    paused: field(),
    srsProposal: field(),
    engineResultsById: Annotation({
      reducer: mergeObjectAssign,
      default: () => ({}),
    }),
    semanticStatuses: Annotation({
      reducer: mergeObjectAssign,
      default: () => ({}),
    }),
    whatTiming: field(),
    humanResume: field(),
  };
}

function toKeySet(keys) {
  if (keys instanceof Set) return keys;
  if (Array.isArray(keys)) return new Set(keys);
  return new Set(Object.keys(keys || {}));
}

/**
 * @param {Iterable<string>|object} parentKeys
 * @param {Iterable<string>|object} [subgraphKeys]
 * @param {{ privateKeys?: string[], requireAllShared?: boolean }} [opts]
 */
function assertSharedKeys(parentKeys, subgraphKeys = null, opts = {}) {
  const parent = toKeySet(parentKeys);
  const privateKeys = opts.privateKeys || EXAMPLE_PRIVATE_KEYS;
  const requireAllShared = opts.requireAllShared !== false;

  if (requireAllShared) {
    for (const key of SHARED_PHASE_KEYS) {
      if (!parent.has(key)) {
        throw new Error(`SharedChannels: parent missing shared key "${key}"`);
      }
    }
  }

  for (const key of privateKeys) {
    if (parent.has(key)) {
      throw new Error(`SharedChannels: private key "${key}" must not be on parent Annotation`);
    }
  }

  if (subgraphKeys != null) {
    const sub = toKeySet(subgraphKeys);
    for (const key of SEC_SHARED_KEYS) {
      if (!sub.has(key)) {
        throw new Error(`SharedChannels: sec subgraph missing shared key "${key}"`);
      }
    }
    for (const key of privateKeys) {
      if (parent.has(key)) {
        throw new Error(`SharedChannels: private "${key}" leaked to parent`);
      }
    }
  }

  return true;
}

/**
 * Facade: opaque API `input` bag → SharedChannels object (outside graph).
 * @param {object|null|undefined} input
 */
function spreadInputToShared(input) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const key of SHARED_PHASE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      out[key] = src[key];
    }
  }
  return out;
}

/**
 * @param {object|null|undefined} state
 */
function projectSharedFromState(state) {
  return spreadInputToShared(state);
}

module.exports = {
  SHARED_PHASE_KEYS,
  SEC_SHARED_KEYS,
  EXAMPLE_PRIVATE_KEYS,
  ORCHESTRATOR_ONLY_KEYS,
  buildSharedPhaseAnnotations,
  assertSharedKeys,
  spreadInputToShared,
  projectSharedFromState,
  appendList,
  mergeStopReason,
  mergeCurrentToolName,
  mergeMaxNumber,
  mergeObjectAssign,
  preferRight,
  lastWriteField,
  deepMergePlanningContainers,
};
