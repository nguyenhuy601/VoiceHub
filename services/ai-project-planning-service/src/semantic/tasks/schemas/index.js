/**
 * Per-task schema validators (lightweight shape checks).
 */

function requireArray(obj, key) {
  return obj && typeof obj === 'object' && Array.isArray(obj[key]);
}

const SCHEMA_VALIDATORS = Object.freeze({
  bg: (data) => ({ ok: requireArray(data, 'goals'), errors: requireArray(data, 'goals') ? [] : [{ field: 'goals' }] }),
  br: (data) => ({ ok: requireArray(data, 'rules'), errors: requireArray(data, 'rules') ? [] : [{ field: 'rules' }] }),
  nfr: (data) => ({ ok: requireArray(data, 'nfrs'), errors: requireArray(data, 'nfrs') ? [] : [{ field: 'nfrs' }] }),
  scope: (data) => ({
    ok: requireArray(data, 'scopeItems'),
    errors: requireArray(data, 'scopeItems') ? [] : [{ field: 'scopeItems' }],
  }),
  bpm: (data) => ({
    ok: requireArray(data, 'processes'),
    errors: requireArray(data, 'processes') ? [] : [{ field: 'processes' }],
  }),
  interface: (data) => ({
    ok: requireArray(data, 'interfaces'),
    errors: requireArray(data, 'interfaces') ? [] : [{ field: 'interfaces' }],
  }),
  fr: (data) => ({ ok: requireArray(data, 'items') || Array.isArray(data?.requirements), errors: [] }),
  uc: (data) => ({
    ok: requireArray(data, 'useCases'),
    errors: requireArray(data, 'useCases') ? [] : [{ field: 'useCases' }],
  }),
  data: (data) => ({
    ok: requireArray(data, 'entities'),
    errors: requireArray(data, 'entities') ? [] : [{ field: 'entities' }],
  }),
});

function validateTaskSchema(taskId, data) {
  const fn = SCHEMA_VALIDATORS[taskId];
  if (!fn) return { ok: true, errors: [] };
  return fn(data);
}

module.exports = { SCHEMA_VALIDATORS, validateTaskSchema };
