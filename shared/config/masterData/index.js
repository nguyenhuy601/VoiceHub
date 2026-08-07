/**
 * Master Data SSOT — Phase 2.0 entry point.
 */

const departments = require('./departments');
const positions = require('./positions');
const organizationRoles = require('./organizationRoles');
const projectRoles = require('./projectRoles');
const permissionGroups = require('./permissionGroups');
const companySizeTemplates = require('./companySizeTemplates');

function isMasterDataV1Enabled() {
  const raw = String(process.env.MASTER_DATA_V1 ?? '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

/** Rollback sync Master→runtime catalog: MASTER_DATA_CATALOG_SYNC=0 */
function isMasterDataCatalogSyncEnabled() {
  if (!isMasterDataV1Enabled()) return false;
  const raw = String(process.env.MASTER_DATA_CATALOG_SYNC ?? '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

const MASTER_DATA_CATALOG_KINDS = Object.freeze([
  'departments',
  'positions',
  'organizationRoles',
  'projectRoles',
]);

function validateEnabledKeysSubset(enabledKeys, masterKeys, kindLabel) {
  const masterSet = new Set(masterKeys);
  const invalid = (Array.isArray(enabledKeys) ? enabledKeys : []).filter((k) => !masterSet.has(k));
  if (invalid.length) {
    const err = new Error(`Invalid ${kindLabel} keys: ${invalid.join(', ')}`);
    err.errorCode = 'MASTER_DATA_INVALID_KEYS';
    err.invalidKeys = invalid;
    throw err;
  }
}

function validateMasterDataSettings(settings = {}) {
  const md = settings?.masterData || settings;
  validateEnabledKeysSubset(md.enabledDepartmentKeys, departments.MASTER_DEPARTMENT_KEYS, 'department');
  validateEnabledKeysSubset(md.enabledPositionKeys, positions.MASTER_POSITION_KEYS, 'position');
  validateEnabledKeysSubset(
    md.enabledOrganizationRoleKeys,
    organizationRoles.MASTER_ORGANIZATION_ROLE_KEYS,
    'organization role'
  );
  validateEnabledKeysSubset(
    md.enabledProjectRoleKeys,
    projectRoles.MASTER_PROJECT_ROLE_KEYS,
    'project role'
  );
}

module.exports = {
  isMasterDataV1Enabled,
  isMasterDataCatalogSyncEnabled,
  MASTER_DATA_CATALOG_KINDS,
  validateEnabledKeysSubset,
  validateMasterDataSettings,
  ...departments,
  ...positions,
  ...organizationRoles,
  ...projectRoles,
  ...permissionGroups,
  ...companySizeTemplates,
};
