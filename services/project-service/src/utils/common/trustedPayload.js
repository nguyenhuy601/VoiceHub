/** Keys that must come from trusted auth/params — never from client body. */
const IDENTITY_KEYS = new Set([
  'userId',
  'projectId',
  'boardId',
  'sprintId',
  'organizationId',
  'createdBy',
  'updatedBy',
  '_id',
]);

/**
 * Strip identity/scope fields from a request body so trusted values win.
 * @param {unknown} body
 * @returns {Record<string, unknown>}
 */
function bodyWithoutIdentity(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {};
  }
  const out = {};
  for (const [key, value] of Object.entries(body)) {
    if (IDENTITY_KEYS.has(key)) continue;
    if (key.startsWith('$')) continue;
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    out[key] = value;
  }
  return out;
}

module.exports = {
  IDENTITY_KEYS,
  bodyWithoutIdentity,
};
