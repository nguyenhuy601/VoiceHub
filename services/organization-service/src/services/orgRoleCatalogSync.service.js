/**
 * Sync OrgRoleCatalog (lớp B) từ Master Data enabledOrganizationRoleKeys (lớp A).
 * Rollback: MASTER_DATA_CATALOG_SYNC=0 → bỏ qua upsert.
 */

const OrgRoleCatalog = require('../models/OrgRoleCatalog');
const { toObjectId } = require('../utils/orgAccess');
const {
  isMasterDataV1Enabled,
  isMasterDataCatalogSyncEnabled,
  MASTER_ORGANIZATION_ROLES,
  MASTER_ORGANIZATION_ROLE_KEYS,
  resolveCanonicalOrganizationRoleKey,
} = require('@enterprise/shared/config/masterData');
const { getEnabledOrganizationRoleKeys } = require('./orgMasterData.service');
const { filterCatalogRolesForList } = require('../utils/orgRoleCatalogFilter');

/**
 * Upsert mọi enabled master org-role key (canonical). Không xóa assignment / custom.
 * @param {string} organizationId
 * @returns {Promise<{ upsertedKeys: string[] }>}
 */
async function syncOrgRoleCatalogFromMaster(organizationId) {
  if (!isMasterDataV1Enabled() || !isMasterDataCatalogSyncEnabled()) {
    return { upsertedKeys: [] };
  }

  const oid = toObjectId(organizationId);
  const enabledKeys = await getEnabledOrganizationRoleKeys(organizationId);
  const upsertedKeys = [];

  for (const rawKey of enabledKeys) {
    const key = resolveCanonicalOrganizationRoleKey(rawKey);
    if (!MASTER_ORGANIZATION_ROLE_KEYS.includes(key)) continue;
    const def = MASTER_ORGANIZATION_ROLES.find((r) => r.key === key);
    if (!def) continue;

    await OrgRoleCatalog.findOneAndUpdate(
      { organizationId: oid, key: def.key },
      {
        $set: {
          label: def.label,
          isSystem: true,
        },
        $setOnInsert: {
          organizationId: oid,
          key: def.key,
          description: '',
          sortOrder: def.sortOrder,
        },
      },
      { upsert: true, new: true }
    );
    upsertedKeys.push(def.key);
  }

  return { upsertedKeys };
}

module.exports = {
  syncOrgRoleCatalogFromMaster,
  filterCatalogRolesForList,
};
