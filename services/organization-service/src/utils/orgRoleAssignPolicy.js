/**
 * Validate org-role assignment keys against catalog rows (key must exist).
 * isSystem catalog rows are assignable; PATCH/DELETE catalog still blocks system rows.
 */
function validateAssignmentRoleKeys(keys, roleByKey) {
  for (const k of keys) {
    const r = roleByKey.get(k);
    if (!r) {
      return { ok: false, code: 'NOT_FOUND', key: k };
    }
  }
  return { ok: true };
}

module.exports = {
  validateAssignmentRoleKeys,
};
