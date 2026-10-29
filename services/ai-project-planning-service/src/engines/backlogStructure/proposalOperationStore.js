/**
 * Idempotent proposal operations: operationKey + inputHash.
 * Same key + same inputHash → replay stored result.
 * Same key + different inputHash → OPERATION_INPUT_MISMATCH (no merge).
 */

const crypto = require('crypto');

/** @type {Map<string, object>} */
const _store = new Map();

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

function hashInput(payload) {
  const body = canonicalJson(payload || {});
  return crypto.createHash('sha256').update(body).digest('hex');
}

/**
 * Build stable operation key (no attempt/retry/timestamp).
 * @param {{ packId?: string, phase?: string, tool?: string, sourceSnapshotVersion?: string, purpose?: string }} parts
 */
function buildOperationKey(parts = {}) {
  const packId = String(parts.packId || 'pack').trim();
  const phase = String(parts.phase || 'what').trim();
  const tool = String(parts.tool || 'backlogPropose').trim();
  const snap = String(parts.sourceSnapshotVersion || 'snap').trim();
  const purpose = String(parts.purpose || 'backlog_structure').trim();
  return [packId, phase, tool, snap, purpose].join('::');
}

function getOperation(operationKey) {
  const key = String(operationKey || '').trim();
  if (!key) return null;
  return _store.get(key) || null;
}

/**
 * @returns {{ ok: true, replay?: boolean, record: object } | { ok: false, code: string, message: string, record?: object }}
 */
function beginOrReplay(operationKey, inputHash, opts = {}) {
  const key = String(operationKey || '').trim();
  const hash = String(inputHash || '').trim();
  if (!key) {
    return { ok: false, code: 'MISSING_OPERATION_KEY', message: 'operationKey required' };
  }
  if (!hash) {
    return { ok: false, code: 'MISSING_INPUT_HASH', message: 'inputHash required' };
  }

  const existing = _store.get(key);
  if (existing) {
    if (existing.inputHash === hash) {
      // Replay only when a completed result (or needs_review hold) is stored
      if (existing.result && (existing.status === 'completed' || existing.status === 'needs_review')) {
        return { ok: true, replay: true, record: existing };
      }
      // Same key/hash still in progress — resume without treating as fresh create
      return { ok: true, replay: false, record: existing, resumed: true };
    }
    return {
      ok: false,
      code: 'OPERATION_INPUT_MISMATCH',
      message: 'Same operationKey with different inputHash — open a new operationKey',
      record: existing,
    };
  }

  if (opts.createIfMissing === false) {
    return { ok: false, code: 'OPERATION_NOT_FOUND', message: 'No stored operation' };
  }

  const record = {
    operationKey: key,
    inputHash: hash,
    status: 'in_progress',
    candidateProposal: null,
    tempRefMap: {},
    assignedIds: [],
    result: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  _store.set(key, record);
  return { ok: true, replay: false, record };
}

function commitOperation(operationKey, patch = {}) {
  const key = String(operationKey || '').trim();
  const existing = _store.get(key);
  if (!existing) {
    return { ok: false, code: 'OPERATION_NOT_FOUND' };
  }
  const next = {
    ...existing,
    ...patch,
    operationKey: key,
    inputHash: existing.inputHash,
    updatedAt: Date.now(),
  };
  _store.set(key, next);
  return { ok: true, record: next };
}

/** Test helper */
function clearAllOperations() {
  _store.clear();
}

function listOperationKeys() {
  return [..._store.keys()];
}

module.exports = {
  hashInput,
  buildOperationKey,
  getOperation,
  beginOrReplay,
  commitOperation,
  clearAllOperations,
  listOperationKeys,
  canonicalJson,
};
