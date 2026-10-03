/**
 * Pure helpers for immutable ArtifactRevision (Gate1 Wave A).
 * Persist wrappers live in gateReviewCommands (DB).
 */

const crypto = require('crypto');

const ORIGIN_AI = 'AI_GENERATED';
const ORIGIN_BA_EDIT = 'BA_EDITED';
const ORIGIN_LEGACY = 'LEGACY_BASELINE';
const ORIGIN_SYSTEM = 'SYSTEM_BASELINE';

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/**
 * @param {object} content
 * @returns {string} sha256:hex
 */
function hashRevisionContent(content) {
  const digest = crypto.createHash('sha256').update(stableStringify(content ?? {})).digest('hex');
  return `sha256:${digest}`;
}

function newRevisionId(prefix = 'REV') {
  const ts = Date.now().toString(36);
  const rnd = crypto.randomBytes(4).toString('hex');
  return `${prefix}-${ts}-${rnd}`;
}

/**
 * Snapshot of proposal item content for a revision (no review metadata).
 * @param {object} item
 */
function extractRevisionContent(item) {
  if (!item || typeof item !== 'object') return {};
  const {
    logicalId,
    id,
    title,
    description,
    acceptanceCriteria,
    status,
    priority,
    sourceRefs,
    actors,
    preconditions,
    postconditions,
    notes,
    category,
    type,
    statement,
    rule,
    name,
    ...rest
  } = item;
  // Keep a stable core + residual fields minus noisy internals
  const content = {
    logicalId: logicalId || id || null,
    title: title ?? name ?? null,
    description: description ?? statement ?? rule ?? null,
    acceptanceCriteria: acceptanceCriteria ?? null,
    status: status ?? null,
    priority: priority ?? null,
    sourceRefs: Array.isArray(sourceRefs) ? sourceRefs : [],
    actors: actors ?? null,
    preconditions: preconditions ?? null,
    postconditions: postconditions ?? null,
    notes: notes ?? null,
    category: category ?? null,
    type: type ?? null,
  };
  // Include remaining enumerable own keys that look like domain fields
  for (const [k, v] of Object.entries(rest)) {
    if (k.startsWith('_')) continue;
    if (['meta', 'review', 'editedPayload'].includes(k)) continue;
    if (content[k] === undefined || content[k] === null) content[k] = v;
  }
  return content;
}

/**
 * Build in-memory revision doc (not persisted).
 */
function buildRevisionDoc({
  revisionId,
  organizationId,
  projectId = null,
  packId,
  reviewId = null,
  artifactType,
  logicalId,
  section = '',
  revisionNo,
  parentRevisionId = null,
  origin,
  content,
  snapshotId = null,
  createdBy = null,
  createdByType = 'SYSTEM',
  createdAt = null,
}) {
  const contentHash = hashRevisionContent(content);
  return {
    revisionId: revisionId || newRevisionId(),
    organizationId,
    projectId,
    packId,
    reviewId,
    artifactType: String(artifactType || section || 'ITEM'),
    logicalId: String(logicalId),
    section: String(section || ''),
    revisionNo: Number(revisionNo) || 1,
    parentRevisionId: parentRevisionId || null,
    origin,
    content,
    contentHash,
    snapshotId: snapshotId ? String(snapshotId) : null,
    createdBy,
    createdByType,
    createdAt: createdAt || new Date().toISOString(),
  };
}

/**
 * Assert CAS: expected tip matches current tip.
 * @throws error with errorCode REVISION_CONFLICT
 */
function assertExpectedRevisionId(currentRevisionId, expectedRevisionId) {
  if (expectedRevisionId == null || expectedRevisionId === '') return;
  const cur = currentRevisionId != null ? String(currentRevisionId) : '';
  const exp = String(expectedRevisionId);
  if (cur && cur !== exp) {
    const err = new Error(
      `Revision conflict: expected ${exp} but current tip is ${cur || 'none'}`
    );
    err.statusCode = 409;
    err.errorCode = 'REVISION_CONFLICT';
    err.details = { expectedRevisionId: exp, currentRevisionId: cur || null };
    throw err;
  }
}

/**
 * Merge editedPayload onto prior content for BA edit.
 */
function applyEditToContent(priorContent, editedPayload) {
  const base =
    priorContent && typeof priorContent === 'object'
      ? JSON.parse(JSON.stringify(priorContent))
      : {};
  if (!editedPayload || typeof editedPayload !== 'object') return base;
  return { ...base, ...editedPayload };
}

function sectionToArtifactType(section) {
  const map = {
    functionalRequirements: 'FR',
    nonFunctionalRequirements: 'NFR',
    businessRules: 'BR',
    businessGoals: 'BG',
    useCases: 'UC',
    processes: 'BPM',
    scope: 'SCOPE',
    actors: 'ACTOR',
    entities: 'DATA',
    glossary: 'GLOSSARY',
    assumptions: 'ASSUMPTION',
    interfaces: 'INTERFACE',
    traceability: 'TRACE',
  };
  return map[String(section || '')] || String(section || 'ITEM').toUpperCase();
}

module.exports = {
  ORIGIN_AI,
  ORIGIN_BA_EDIT,
  ORIGIN_LEGACY,
  ORIGIN_SYSTEM,
  stableStringify,
  hashRevisionContent,
  newRevisionId,
  extractRevisionContent,
  buildRevisionDoc,
  assertExpectedRevisionId,
  applyEditToContent,
  sectionToArtifactType,
};
