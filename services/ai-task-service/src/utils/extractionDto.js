const OMIT_KEYS = new Set(['rawModelOutput', 'confirmIdempotencyKey']);

/**
 * Public extraction shape for GET /extractions/:id — omit model raw + idempotency secret.
 * @param {Record<string, unknown>|null|undefined} doc
 * @returns {Record<string, unknown>|null}
 */
function toPublicExtraction(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const out = {};
  for (const [key, value] of Object.entries(doc)) {
    if (OMIT_KEYS.has(key)) continue;
    if (key === 'error') {
      // Never expose raw pipeline/stack text; only a safe flag for UI.
      out.hasError = Boolean(value && String(value).trim());
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Slim draft GET response — drop internal error string dump.
 * @param {Record<string, unknown>|null|undefined} doc
 */
function toPublicDraft(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const { error, ...rest } = doc;
  return {
    ...rest,
    hasError: Boolean(error && String(error).trim()),
  };
}

module.exports = {
  OMIT_KEYS,
  toPublicExtraction,
  toPublicDraft,
};
