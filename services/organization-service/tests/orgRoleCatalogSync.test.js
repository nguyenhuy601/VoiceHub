/**
 * Unit: filter/decorate OrgRoleCatalog list vs Master Data enabled keys + alias.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { filterCatalogRolesForList } = require('../src/utils/orgRoleCatalogFilter');

describe('filterCatalogRolesForList', () => {
  it('includes enabled master keys and hides disabled system rows', () => {
    const roles = [
      { _id: '1', key: 'resource_manager', label: 'RM', isSystem: true, sortOrder: 40 },
      { _id: '2', key: 'mentor', label: 'Mentor', isSystem: true, sortOrder: 60 },
      { _id: '3', key: 'employ', label: 'Employ', isSystem: false, sortOrder: 99 },
    ];
    const out = filterCatalogRolesForList(roles, ['resource_manager', 'team_lead']);
    assert.equal(out.length, 2);
    assert.equal(out[0].key, 'resource_manager');
    assert.equal(out[0].enabled, true);
    assert.equal(out[0].legacyOutsideMaster, false);
    assert.equal(out[1].key, 'employ');
    assert.equal(out[1].legacyOutsideMaster, true);
    assert.equal(out[1].enabled, false);
  });

  it('hides legacy alias team_manager when canonical team_lead is used', () => {
    const roles = [
      { _id: 'a', key: 'team_manager', label: 'Team Manager', isSystem: true, sortOrder: 20 },
      { _id: 'b', key: 'team_lead', label: 'Team Lead', isSystem: true, sortOrder: 20 },
    ];
    const out = filterCatalogRolesForList(roles, ['team_lead']);
    assert.equal(out.length, 1);
    assert.equal(out[0].key, 'team_lead');
  });
});
