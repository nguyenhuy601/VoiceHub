/**
 * Org-role helpers for Admin Hub import/ops.
 * Operator SoT = organization role keys (DIRECTOR, HR_APPROVER) — not membership owner|admin|hr.
 */

const DEFAULT_OPERATOR_ORG_ROLE_KEYS = Object.freeze(['DIRECTOR', 'HR_APPROVER']);

/**
 * @param {string|string[]|null|undefined} roleOrKeys — single org role key or list
 * @param {string[]} [allowedKeys]
 */
function canImportViaOrgRole(roleOrKeys, allowedKeys = DEFAULT_OPERATOR_ORG_ROLE_KEYS) {
  const allowed = new Set(
    (Array.isArray(allowedKeys) ? allowedKeys : DEFAULT_OPERATOR_ORG_ROLE_KEYS).map((k) =>
      String(k || '')
        .trim()
        .toUpperCase()
    )
  );
  const keys = Array.isArray(roleOrKeys)
    ? roleOrKeys
    : [roleOrKeys];
  return keys.some((key) => allowed.has(String(key || '').trim().toUpperCase()));
}

module.exports = {
  canImportViaOrgRole,
  DEFAULT_OPERATOR_ORG_ROLE_KEYS,
};
