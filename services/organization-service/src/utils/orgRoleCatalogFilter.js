/**
 * Pure helpers — filter OrgRoleCatalog list vs Master Data (no mongoose).
 */

const {
  MASTER_ORGANIZATION_ROLE_KEYS,
  LEGACY_ORGANIZATION_ROLE_KEY_ALIASES,
  resolveCanonicalOrganizationRoleKey,
} = require('@enterprise/shared/config/masterData');

/**
 * Filter + decorate catalog rows cho list admin (ẩn key đã disable; alias team_manager → ẩn).
 * @param {Array} roles lean OrgRoleCatalog rows
 * @param {string[]} enabledKeys
 */
function filterCatalogRolesForList(roles, enabledKeys) {
  const enabledSet = new Set((enabledKeys || []).map((k) => resolveCanonicalOrganizationRoleKey(k)));
  const masterSet = new Set(MASTER_ORGANIZATION_ROLE_KEYS);
  const out = [];

  for (const row of roles || []) {
    const key = String(row.key || '').trim();
    if (!key) continue;

    // Ẩn legacy alias row (team_manager) — canonical team_lead là SSOT
    if (Object.prototype.hasOwnProperty.call(LEGACY_ORGANIZATION_ROLE_KEY_ALIASES, key)) {
      continue;
    }

    const canonical = resolveCanonicalOrganizationRoleKey(key);
    const isMasterRow = Boolean(row.isSystem) || masterSet.has(key) || masterSet.has(canonical);

    if (isMasterRow) {
      if (!enabledSet.has(canonical) && !enabledSet.has(key)) continue;
      out.push({
        ...row,
        key: masterSet.has(key) ? key : canonical,
        enabled: true,
        legacyOutsideMaster: false,
      });
      continue;
    }

    out.push({
      ...row,
      enabled: false,
      legacyOutsideMaster: true,
    });
  }

  return out;
}

module.exports = {
  filterCatalogRolesForList,
};
