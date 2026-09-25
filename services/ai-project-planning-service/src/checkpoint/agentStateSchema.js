/**
 * G15 AgentState v1 — whitelist + soft trim (Redis-only SoT).
 * RULE-G15-PIN: toolData / pack / container / corpus + tool seek index.
 */

const AGENT_STATE_SCHEMA_VERSION = 1;
const MAX_HISTORY_ENTRIES = 50;
const MAX_TOOL_RESULTS = 40;
const MAX_EVIDENCE_IDS = 100;
const MAX_PINNED_EMPLOYEES = 200;
const MAX_CORPUS_DOCS = 50;
const MAX_CORPUS_TEXT_CHARS = 2000;

const ALLOWED_KEYS = new Set([
  'schemaVersion',
  'runId',
  'projectId',
  'packId',
  'organizationId',
  'job',
  'approvedSrsVersion',
  'snapshotId',
  'context',
  'contextPackage',
  // Track B AgentState core
  'goal',
  'currentGoal',
  'constraints',
  'budget',
  'stopReason',
  'currentPlan',
  'currentAction',
  'currentNode',
  'toolResults',
  'evidenceIds',
  'evidence',
  'unresolvedIssues',
  'evaluationResult',
  'evaluate',
  // Early signal ≠ G13 SoT (Track B lỗ #6)
  'feasibilitySignal',
  // G13 candidate after agent exit (Gate2 SoT)
  'feasibility',
  'humanFeedback',
  'lastFeedback',
  'iteration',
  'status',
  'history',
  'phaseOut',
  'output',
  'g4Understanding',
  'hitl',
  'understand',
  'plan',
  'select',
  'observe',
  'savedAt',
  // G16 selective resume (RULE-AUD-01)
  'selectiveReplanSteps',
  // RULE-G15-PIN / RULE-SEEK-01
  'toolData',
  'pack',
  'container',
  'corpus',
  'currentToolIndex',
  'currentToolName',
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function trimArray(arr, max) {
  if (arr.length <= max) return arr;
  return arr.slice(arr.length - max);
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function slimToolData(toolData) {
  if (!isPlainObject(toolData)) return undefined;
  const employees = Array.isArray(toolData.employees)
    ? toolData.employees.slice(0, MAX_PINNED_EMPLOYEES)
    : toolData.employees;
  return {
    ...toolData,
    employees,
  };
}

function slimPack(pack) {
  if (!isPlainObject(pack)) return undefined;
  return {
    overview: pack.overview || {},
    staffingPlan: pack.staffingPlan,
    requirementSkills: pack.requirementSkills,
    status: pack.status,
    versionNumber: pack.versionNumber,
    approvedSrsVersion: pack.approvedSrsVersion,
  };
}

function slimContainer(container) {
  if (!isPlainObject(container)) return undefined;
  const next = { ...container };
  if (next.jobs != null) delete next.jobs;
  return next;
}

function slimCorpus(corpus) {
  if (!Array.isArray(corpus)) return undefined;
  return corpus.slice(0, MAX_CORPUS_DOCS).map((doc) => {
    if (!isPlainObject(doc)) return doc;
    const text = doc.text != null ? String(doc.text) : undefined;
    return {
      ...doc,
      text:
        text != null && text.length > MAX_CORPUS_TEXT_CHARS
          ? text.slice(0, MAX_CORPUS_TEXT_CHARS)
          : text,
    };
  });
}

/**
 * @param {object} raw
 * @returns {object} normalized AgentState
 */
function normalizeAgentState(raw = {}) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = { schemaVersion: AGENT_STATE_SCHEMA_VERSION };

  for (const key of ALLOWED_KEYS) {
    if (key === 'schemaVersion') continue;
    if (src[key] !== undefined) out[key] = src[key];
  }

  if (src.node != null && out.currentNode == null) {
    out.currentNode = src.node;
  }

  const evidenceIds = asArray(src.evidenceIds);
  if (evidenceIds.length) {
    out.evidenceIds = trimArray(
      evidenceIds.map((id) => String(id)).filter(Boolean),
      MAX_EVIDENCE_IDS
    );
  } else if (Array.isArray(src.evidence)) {
    out.evidenceIds = trimArray(
      src.evidence
        .map((e) => (e && e.evidenceId != null ? String(e.evidenceId) : null))
        .filter(Boolean),
      MAX_EVIDENCE_IDS
    );
  }

  if (Array.isArray(src.toolResults)) {
    out.toolResults = trimArray(src.toolResults, MAX_TOOL_RESULTS);
  }
  if (Array.isArray(src.history)) {
    out.history = trimArray(src.history, MAX_HISTORY_ENTRIES);
  }
  if (Array.isArray(src.selectiveReplanSteps)) {
    out.selectiveReplanSteps = src.selectiveReplanSteps
      .map((name) => String(name || '').trim())
      .filter(Boolean);
  } else if (src.selectiveReplanSteps === null) {
    out.selectiveReplanSteps = null;
  }

  if (src.toolData !== undefined) {
    const slim = slimToolData(src.toolData);
    if (slim !== undefined) out.toolData = slim;
    else delete out.toolData;
  }
  if (src.pack !== undefined) {
    const slim = slimPack(src.pack);
    if (slim !== undefined) out.pack = slim;
    else delete out.pack;
  }
  if (src.container !== undefined) {
    const slim = slimContainer(src.container);
    if (slim !== undefined) out.container = slim;
    else delete out.container;
  }
  if (src.corpus !== undefined) {
    const slim = slimCorpus(src.corpus);
    if (slim !== undefined) out.corpus = slim;
    else delete out.corpus;
  }

  if (typeof src.currentToolIndex === 'number' && Number.isFinite(src.currentToolIndex)) {
    out.currentToolIndex = Math.max(0, Math.floor(src.currentToolIndex));
  }
  if (src.currentToolName != null) {
    out.currentToolName = String(src.currentToolName);
  }

  if (out.iteration == null && typeof src.iteration === 'number') {
    out.iteration = src.iteration;
  }

  // Track B: goal alias + constraints / budget / stop / feasibilitySignal
  if (src.goal != null && out.goal == null) {
    out.goal = src.goal;
  }
  if (out.currentGoal == null && out.goal != null) {
    out.currentGoal = out.goal;
  }
  if (out.goal == null && out.currentGoal != null) {
    out.goal = out.currentGoal;
  }
  if (isPlainObject(src.constraints)) {
    out.constraints = { ...src.constraints };
  }
  if (isPlainObject(src.budget)) {
    out.budget = { ...src.budget };
  }
  if (src.stopReason != null) {
    out.stopReason = String(src.stopReason);
  }
  if (isPlainObject(src.feasibilitySignal)) {
    out.feasibilitySignal = { ...src.feasibilitySignal, notG13: true };
  }

  return out;
}

/**
 * Build initial AgentState fields for a phase (Track B DoD).
 * @param {{
 *   phase?: string,
 *   runId?: string|null,
 *   snapshotId?: string|null,
 *   goal?: string|object,
 *   constraints?: object,
 *   budget?: object,
 * }} input
 */
function buildInitialAgentFields(input = {}) {
  const phase = String(input.phase || '').trim().toLowerCase() || 'how';
  const goal =
    input.goal != null
      ? input.goal
      : phase === 'what' || phase === 'phase_what'
        ? 'phase_what_understanding'
        : 'phase_how_planning';
  return {
    goal,
    currentGoal: goal,
    constraints:
      input.constraints && typeof input.constraints === 'object'
        ? { ...input.constraints }
        : {
            snapshotBound: true,
            evidenceRequired: true,
            g8NotG13: true,
          },
    budget: input.budget && typeof input.budget === 'object' ? { ...input.budget } : undefined,
    iteration: 0,
    stopReason: null,
    feasibilitySignal: null,
    toolResults: [],
    evidenceIds: [],
  };
}

module.exports = {
  AGENT_STATE_SCHEMA_VERSION,
  MAX_HISTORY_ENTRIES,
  MAX_PINNED_EMPLOYEES,
  MAX_CORPUS_DOCS,
  MAX_CORPUS_TEXT_CHARS,
  normalizeAgentState,
  buildInitialAgentFields,
};
