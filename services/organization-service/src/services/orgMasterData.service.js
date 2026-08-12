const Organization = require('../models/Organization');
const {
  isMasterDataV1Enabled,
  MASTER_DEPARTMENTS,
  MASTER_POSITIONS,
  MASTER_ORGANIZATION_ROLES,
  MASTER_PROJECT_ROLES,
  MASTER_PERMISSION_GROUPS,
  buildDefaultMasterDataSettings,
  resolveCompanySize,
  validateMasterDataSettings,
  getTemplateForCompanySize,
} = require('@enterprise/shared/config/masterData');

function mapTeamSizeToCompanySize(teamSizeRaw) {
  const raw = String(teamSizeRaw || '').trim().toLowerCase();
  if (!raw) return 'startup';
  if (raw.includes('enterprise') || raw.includes('1000') || raw.includes('500+')) return 'enterprise';
  if (raw.includes('mid') || raw.includes('200') || raw.includes('100-')) return 'mid';
  if (raw.includes('sme') || raw.includes('50') || raw.includes('medium')) return 'sme';
  if (raw.includes('startup') || raw.includes('small') || raw.includes('1-')) return 'startup';
  return 'startup';
}

function readOrgMasterData(org) {
  const settings = org?.settings || {};
  const companySize = resolveCompanySize(settings.companySize || mapTeamSizeToCompanySize(org?.teamSize));
  const template = getTemplateForCompanySize(companySize);
  const md = settings.masterData || {};
  return {
    companySize,
    masterData: {
      enabledDepartmentKeys:
        Array.isArray(md.enabledDepartmentKeys) && md.enabledDepartmentKeys.length
          ? [...md.enabledDepartmentKeys]
          : [...template.enabledDepartmentKeys],
      enabledPositionKeys:
        Array.isArray(md.enabledPositionKeys) && md.enabledPositionKeys.length
          ? [...md.enabledPositionKeys]
          : [...template.enabledPositionKeys],
      enabledOrganizationRoleKeys:
        Array.isArray(md.enabledOrganizationRoleKeys) && md.enabledOrganizationRoleKeys.length
          ? [...md.enabledOrganizationRoleKeys]
          : [...template.enabledOrganizationRoleKeys],
      enabledProjectRoleKeys:
        Array.isArray(md.enabledProjectRoleKeys) && md.enabledProjectRoleKeys.length
          ? [...md.enabledProjectRoleKeys]
          : [...template.enabledProjectRoleKeys],
    },
  };
}

async function getOrgMasterDataSettings(organizationId) {
  const org = await Organization.findById(organizationId).select('settings teamSize').lean();
  if (!org) {
    const err = new Error('Organization không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  return readOrgMasterData(org);
}

function buildCatalogResponse(settings) {
  const enabledDepts = new Set(settings.masterData.enabledDepartmentKeys);
  const enabledPos = new Set(settings.masterData.enabledPositionKeys);
  const enabledOrgRoles = new Set(settings.masterData.enabledOrganizationRoleKeys);
  const enabledProjectRoles = new Set(settings.masterData.enabledProjectRoleKeys);

  return {
    companySize: settings.companySize,
    masterData: settings.masterData,
    catalogs: {
      departments: MASTER_DEPARTMENTS.map((row) => ({
        ...row,
        enabled: enabledDepts.has(row.key),
      })),
      positions: MASTER_POSITIONS.map((row) => ({
        ...row,
        enabled: enabledPos.has(row.key),
      })),
      organizationRoles: MASTER_ORGANIZATION_ROLES.map((row) => ({
        ...row,
        enabled: enabledOrgRoles.has(row.key),
      })),
      projectRoles: MASTER_PROJECT_ROLES.map((row) => ({
        ...row,
        enabled: enabledProjectRoles.has(row.key),
      })),
      permissionGroups: MASTER_PERMISSION_GROUPS,
    },
  };
}

async function getOrgMasterDataCatalog(organizationId) {
  const settings = await getOrgMasterDataSettings(organizationId);
  return buildCatalogResponse(settings);
}

async function ensureOrgMasterDataSeed(organizationId, { companySize } = {}) {
  if (!isMasterDataV1Enabled()) return null;
  const org = await Organization.findById(organizationId).select('settings teamSize').lean();
  if (!org) return null;
  const existing = org.settings?.masterData;
  if (existing && Array.isArray(existing.enabledProjectRoleKeys) && existing.enabledProjectRoleKeys.length) {
    return readOrgMasterData(org);
  }
  const size = resolveCompanySize(companySize || mapTeamSizeToCompanySize(org.teamSize));
  const defaults = buildDefaultMasterDataSettings(size);
  await Organization.updateOne(
    { _id: organizationId },
    {
      $set: {
        'settings.companySize': defaults.companySize,
        'settings.masterData': defaults.masterData,
      },
    }
  );
  return defaults;
}

async function patchOrgMasterDataEnabled(organizationId, patch = {}, options = {}) {
  if (!isMasterDataV1Enabled()) {
    const err = new Error('Master Data V1 chưa bật');
    err.statusCode = 403;
    err.errorCode = 'MASTER_DATA_DISABLED';
    throw err;
  }
  const org = await Organization.findById(organizationId).select('settings teamSize').lean();
  if (!org) {
    const err = new Error('Organization không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const current = readOrgMasterData(org);
  const beforeSnap = {
    companySize: current.companySize,
    enabledDepartmentKeys: current.masterData.enabledDepartmentKeys,
    enabledPositionKeys: current.masterData.enabledPositionKeys,
    enabledOrganizationRoleKeys: current.masterData.enabledOrganizationRoleKeys,
    enabledProjectRoleKeys: current.masterData.enabledProjectRoleKeys,
  };
  const nextMasterData = { ...current.masterData };
  if (patch.enabledDepartmentKeys !== undefined) {
    nextMasterData.enabledDepartmentKeys = patch.enabledDepartmentKeys;
  }
  if (patch.enabledPositionKeys !== undefined) {
    nextMasterData.enabledPositionKeys = patch.enabledPositionKeys;
  }
  if (patch.enabledOrganizationRoleKeys !== undefined) {
    nextMasterData.enabledOrganizationRoleKeys = patch.enabledOrganizationRoleKeys;
  }
  if (patch.enabledProjectRoleKeys !== undefined) {
    nextMasterData.enabledProjectRoleKeys = patch.enabledProjectRoleKeys;
  }
  validateMasterDataSettings(nextMasterData);

  const nextCompanySize =
    patch.companySize !== undefined ? resolveCompanySize(patch.companySize) : current.companySize;

  await Organization.updateOne(
    { _id: organizationId },
    {
      $set: {
        'settings.companySize': nextCompanySize,
        'settings.masterData': nextMasterData,
      },
    }
  );

  // Sync runtime OrgRoleCatalog sau khi đổi enabled keys (project roles sync khi list bên project-service).
  try {
    const { syncOrgRoleCatalogFromMaster } = require('./orgRoleCatalogSync.service');
    await syncOrgRoleCatalogFromMaster(organizationId);
  } catch {
    /* không fail patch Master Data nếu sync catalog lỗi tạm thời */
  }

  const afterSnap = {
    companySize: nextCompanySize,
    enabledDepartmentKeys: nextMasterData.enabledDepartmentKeys,
    enabledPositionKeys: nextMasterData.enabledPositionKeys,
    enabledOrganizationRoleKeys: nextMasterData.enabledOrganizationRoleKeys,
    enabledProjectRoleKeys: nextMasterData.enabledProjectRoleKeys,
  };
  const actorUserId = String(options.actorUserId || '').trim();
  if (actorUserId) {
    try {
      const { recordProjectAudit } = require('../clients/projectAudit.client');
      await recordProjectAudit({
        organizationId: String(organizationId),
        actorUserId,
        action: 'master_data.enabled_updated',
        resourceType: 'master_data',
        resourceId: String(organizationId),
        before: beforeSnap,
        after: afterSnap,
        requestId: String(options.requestId || '').slice(0, 96),
      });
    } catch {
      /* audit best-effort */
    }
  }

  return buildCatalogResponse({
    companySize: nextCompanySize,
    masterData: nextMasterData,
  });
}

async function getEnabledProjectRoleKeys(organizationId) {
  if (!isMasterDataV1Enabled()) {
    return MASTER_PROJECT_ROLES.map((r) => r.key);
  }
  await ensureOrgMasterDataSeed(organizationId);
  const settings = await getOrgMasterDataSettings(organizationId);
  return settings.masterData.enabledProjectRoleKeys;
}

async function getEnabledOrganizationRoleKeys(organizationId) {
  if (!isMasterDataV1Enabled()) {
    return MASTER_ORGANIZATION_ROLES.map((r) => r.key);
  }
  await ensureOrgMasterDataSeed(organizationId);
  const settings = await getOrgMasterDataSettings(organizationId);
  return settings.masterData.enabledOrganizationRoleKeys;
}

async function getEnabledPositionKeys(organizationId) {
  if (!isMasterDataV1Enabled()) {
    return MASTER_POSITIONS.map((p) => p.key);
  }
  await ensureOrgMasterDataSeed(organizationId);
  const settings = await getOrgMasterDataSettings(organizationId);
  return settings.masterData.enabledPositionKeys;
}

module.exports = {
  mapTeamSizeToCompanySize,
  getOrgMasterDataSettings,
  getOrgMasterDataCatalog,
  ensureOrgMasterDataSeed,
  patchOrgMasterDataEnabled,
  getEnabledProjectRoleKeys,
  getEnabledOrganizationRoleKeys,
  getEnabledPositionKeys,
  buildCatalogResponse,
};
