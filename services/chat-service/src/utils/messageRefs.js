const { mongoose } = require('@enterprise/shared/config/mongo');

const REF_KINDS = Object.freeze(['task', 'change_request']);
const MAX_REFS_V1 = 1;
const LABEL_MAX = 120;

function asOid(raw) {
  const s = String(raw || '').trim();
  return mongoose.isValidObjectId(s) ? s : '';
}

/**
 * Parse optional message.refs[] (Work/CR chips). Additive — không đụng visibility.
 * @param {unknown} raw
 * @returns {{ refs: Array<{ kind: string, id: string, projectId: string, label: string }>, error: string|null }}
 */
function parseMessageRefs(raw) {
  if (raw == null) return { refs: [], error: null };
  if (!Array.isArray(raw)) {
    return { refs: [], error: 'refs must be an array' };
  }
  if (raw.length > MAX_REFS_V1) {
    return { refs: [], error: 'refs supports at most 1 item' };
  }

  const refs = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      return { refs: [], error: 'refs item is invalid' };
    }
    const kind = String(item.kind || '').trim();
    if (!REF_KINDS.includes(kind)) {
      return { refs: [], error: 'refs kind must be task or change_request' };
    }
    const id = asOid(item.id);
    const projectId = asOid(item.projectId);
    if (!id || !projectId) {
      return { refs: [], error: 'refs id and projectId must be valid ids' };
    }
    const label = String(item.label || '').trim().slice(0, LABEL_MAX);
    refs.push({ kind, id, projectId, ...(label ? { label } : {}) });
  }
  return { refs, error: null };
}

module.exports = {
  REF_KINDS,
  MAX_REFS_V1,
  LABEL_MAX,
  parseMessageRefs,
};
