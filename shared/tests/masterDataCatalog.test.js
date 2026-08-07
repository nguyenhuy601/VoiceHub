const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const masterData = require('../config/masterData');
const {
  MASTER_DEPARTMENT_KEYS,
  MASTER_POSITION_KEYS,
  MASTER_ORGANIZATION_ROLE_KEYS,
  MASTER_PROJECT_ROLE_KEYS,
  MASTER_PERMISSION_GROUP_KEYS,
  COMPANY_SIZE_KEYS,
  COMPANY_SIZE_TEMPLATES,
  LEGACY_PROJECT_ROLE_KEY_ALIASES,
  resolveCanonicalProjectRoleKey,
  buildDefaultMasterDataSettings,
  validateMasterDataSettings,
} = masterData;

function assertUniqueKeys(keys, label) {
  const set = new Set(keys);
  assert.equal(set.size, keys.length, `${label} keys must be unique`);
}

describe('masterDataCatalog', () => {
  it('M1: master catalog keys are unique', () => {
    assertUniqueKeys(MASTER_DEPARTMENT_KEYS, 'department');
    assertUniqueKeys(MASTER_POSITION_KEYS, 'position');
    assertUniqueKeys(MASTER_ORGANIZATION_ROLE_KEYS, 'organization role');
    assertUniqueKeys(MASTER_PROJECT_ROLE_KEYS, 'project role');
    assertUniqueKeys(MASTER_PERMISSION_GROUP_KEYS, 'permission group');
  });

  it('M1b: company size templates are subsets of master catalogs', () => {
    for (const size of COMPANY_SIZE_KEYS) {
      const tpl = COMPANY_SIZE_TEMPLATES[size];
      assert.ok(tpl, `template ${size} exists`);
      for (const k of tpl.enabledDepartmentKeys) {
        assert.ok(MASTER_DEPARTMENT_KEYS.includes(k), `${size} dept ${k}`);
      }
      for (const k of tpl.enabledPositionKeys) {
        assert.ok(MASTER_POSITION_KEYS.includes(k), `${size} position ${k}`);
      }
      for (const k of tpl.enabledOrganizationRoleKeys) {
        assert.ok(MASTER_ORGANIZATION_ROLE_KEYS.includes(k), `${size} org role ${k}`);
      }
      for (const k of tpl.enabledProjectRoleKeys) {
        assert.ok(MASTER_PROJECT_ROLE_KEYS.includes(k), `${size} project role ${k}`);
      }
    }
  });

  it('M2: startup default settings match template', () => {
    const defaults = buildDefaultMasterDataSettings('startup');
    assert.equal(defaults.companySize, 'startup');
    assert.deepEqual(
      defaults.masterData.enabledProjectRoleKeys,
      COMPANY_SIZE_TEMPLATES.startup.enabledProjectRoleKeys
    );
    assert.doesNotThrow(() => validateMasterDataSettings(defaults.masterData));
  });

  it('legacy project role aliases resolve to master keys', () => {
    for (const [legacy, canonical] of Object.entries(LEGACY_PROJECT_ROLE_KEY_ALIASES)) {
      assert.equal(resolveCanonicalProjectRoleKey(legacy), canonical);
      assert.ok(MASTER_PROJECT_ROLE_KEYS.includes(canonical), `${legacy} → ${canonical}`);
    }
  });

  it('legacy org role alias team_manager → team_lead', () => {
    const { resolveCanonicalOrganizationRoleKey, LEGACY_ORGANIZATION_ROLE_KEY_ALIASES } = masterData;
    assert.equal(resolveCanonicalOrganizationRoleKey('team_manager'), 'team_lead');
    assert.equal(LEGACY_ORGANIZATION_ROLE_KEY_ALIASES.team_manager, 'team_lead');
  });

  it('MASTER_DATA_CATALOG_SYNC flag defaults on when V1 on', () => {
    const prevV1 = process.env.MASTER_DATA_V1;
    const prevSync = process.env.MASTER_DATA_CATALOG_SYNC;
    try {
      process.env.MASTER_DATA_V1 = '1';
      delete process.env.MASTER_DATA_CATALOG_SYNC;
      // Re-require would cache — call exported fn which reads env each time
      assert.equal(masterData.isMasterDataCatalogSyncEnabled(), true);
      process.env.MASTER_DATA_CATALOG_SYNC = '0';
      assert.equal(masterData.isMasterDataCatalogSyncEnabled(), false);
    } finally {
      if (prevV1 === undefined) delete process.env.MASTER_DATA_V1;
      else process.env.MASTER_DATA_V1 = prevV1;
      if (prevSync === undefined) delete process.env.MASTER_DATA_CATALOG_SYNC;
      else process.env.MASTER_DATA_CATALOG_SYNC = prevSync;
    }
  });

  it('reject invalid enabled keys', () => {
    assert.throws(
      () =>
        validateMasterDataSettings({
          enabledDepartmentKeys: ['engineering', 'not_a_dept'],
          enabledPositionKeys: MASTER_POSITION_KEYS.slice(0, 2),
          enabledOrganizationRoleKeys: MASTER_ORGANIZATION_ROLE_KEYS.slice(0, 2),
          enabledProjectRoleKeys: MASTER_PROJECT_ROLE_KEYS.slice(0, 2),
        }),
      /Invalid department keys/
    );
  });
});
