/**
 * Immutable planning artifact revision ids + content hash (HOW).
 * Mirror Gate1 style — no shared cross-service model required for v1.
 */

const crypto = require('crypto');

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

function hashRevisionContent(content) {
  const digest = crypto.createHash('sha256').update(stableStringify(content ?? {})).digest('hex');
  return `sha256:${digest}`;
}

function newRevisionId(prefix = 'wbs') {
  const ts = Date.now().toString(36);
  const rnd = crypto.randomBytes(4).toString('hex');
  return `${prefix}-r${ts}${rnd}`;
}

function newEventId(prefix = 'evt') {
  const ts = Date.now().toString(36);
  const rnd = crypto.randomBytes(3).toString('hex');
  return `${prefix}-${ts}-${rnd}`;
}

function newImpactId(prefix = 'impact') {
  const ts = Date.now().toString(36);
  const rnd = crypto.randomBytes(3).toString('hex');
  return `${prefix}-${ts}-${rnd}`;
}

function newRequestId(prefix = 'req') {
  const ts = Date.now().toString(36);
  const rnd = crypto.randomBytes(3).toString('hex');
  return `${prefix}-${ts}-${rnd}`;
}

module.exports = {
  stableStringify,
  hashRevisionContent,
  newRevisionId,
  newEventId,
  newImpactId,
  newRequestId,
};
