const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveCanonicalOrganizationRoleKey,
  organizationRoleLookupCodes,
} = require('@enterprise/shared/config/masterData');
const {
  lookupCodesForEnsure,
  legacyCodesForCanonical,
  pickRoleRowPreferCanonical,
} = require('../src/services/orgRoleGrantBaseline.service');
const {
  filterLegacyOrgRoleDuplicates,
  codesMatchingCreateInput,
} = require('../src/services/orgRbacMatrix.service');

test('resolveCanonical maps lowercase and UPPER to UPPER SoT', () => {
  assert.equal(resolveCanonicalOrganizationRoleKey('department_manager'), 'DEPARTMENT_MANAGER');
  assert.equal(resolveCanonicalOrganizationRoleKey('DEPARTMENT_MANAGER'), 'DEPARTMENT_MANAGER');
  assert.equal(resolveCanonicalOrganizationRoleKey('team_manager'), 'TEAM_LEAD');
  assert.equal(resolveCanonicalOrganizationRoleKey('org_member'), 'MEMBER');
  assert.equal(resolveCanonicalOrganizationRoleKey('ORG_OWNER'), 'ORG_OWNER');
});

test('lookupCodesForEnsure includes aliases for TEAM_LEAD', () => {
  const { canonical, codes } = lookupCodesForEnsure('team_lead');
  assert.equal(canonical, 'TEAM_LEAD');
  assert.ok(codes.includes('TEAM_LEAD'));
  assert.ok(codes.includes('team_lead'));
  assert.ok(codes.includes('team_manager'));
});

test('lookupCodesForEnsure maps team_manager input to TEAM_LEAD', () => {
  const { canonical, codes } = lookupCodesForEnsure('team_manager');
  assert.equal(canonical, 'TEAM_LEAD');
  assert.ok(codes.includes('team_manager'));
  assert.ok(codes.includes('TEAM_LEAD'));
});

test('legacyCodesForCanonical lists lowercase aliases for TEAM_LEAD', () => {
  const legacy = legacyCodesForCanonical('TEAM_LEAD');
  assert.ok(legacy.includes('team_manager'));
  assert.ok(legacy.includes('team_lead'));
});

test('pickRoleRowPreferCanonical prefers UPPER when both exist', () => {
  const rows = [
    { _id: '1', code: 'team_lead', name: 'Team Lead' },
    { _id: '2', code: 'TEAM_LEAD', name: 'Trưởng nhóm' },
  ];
  const picked = pickRoleRowPreferCanonical(rows, 'TEAM_LEAD');
  assert.equal(picked.code, 'TEAM_LEAD');
  assert.equal(String(picked._id), '2');
});

test('filterLegacyOrgRoleDuplicates hides lowercase when UPPER present', () => {
  const filtered = filterLegacyOrgRoleDuplicates([
    { code: 'team_lead', name: 'Legacy' },
    { code: 'TEAM_LEAD', name: 'Trưởng nhóm' },
    { code: 'DIRECTOR', name: 'Giám đốc tổ chức' },
    { code: 'ORG_OWNER', name: 'Organization Owner' },
  ]);
  assert.ok(filtered.every((row) => row.code !== 'team_lead'));
  assert.ok(filtered.some((row) => row.code === 'TEAM_LEAD'));
  assert.ok(filtered.some((row) => row.code === 'ORG_OWNER'));
});

test('filterLegacyOrgRoleDuplicates keeps lowercase when UPPER missing', () => {
  const filtered = filterLegacyOrgRoleDuplicates([
    { code: 'team_lead', name: 'Legacy' },
    { code: 'DIRECTOR', name: 'Giám đốc tổ chức' },
  ]);
  assert.ok(filtered.some((row) => row.code === 'team_lead'));
});

test('filterLegacyOrgRoleDuplicates keeps one sibling when both are aliases', () => {
  const filtered = filterLegacyOrgRoleDuplicates([
    { code: 'team_lead', name: 'A' },
    { code: 'team_manager', name: 'B' },
    { code: 'DIRECTOR', name: 'Giám đốc tổ chức' },
  ]);
  const team = filtered.filter((row) =>
    ['team_lead', 'team_manager', 'TEAM_LEAD'].includes(String(row.code))
  );
  assert.equal(team.length, 1);
  assert.ok(filtered.some((row) => row.code === 'DIRECTOR'));
});

test('codesMatchingCreateInput and organizationRoleLookupCodes cover alias', () => {
  const codes = codesMatchingCreateInput('team_manager');
  assert.ok(codes.includes('team_manager'));
  assert.ok(codes.includes('TEAM_LEAD'));
  const lookup = organizationRoleLookupCodes('MENTOR');
  assert.ok(lookup.includes('MENTOR'));
  assert.ok(lookup.includes('mentor'));
});
