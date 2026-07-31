const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  SYSTEM_ROLE_NAME_PREFIX,
  ORG_ROLE_LABEL_PREFIX,
  PROJECT_ROLE_LABEL_PREFIX,
  normalizeLayerLabel,
  splitLayerLabel,
  isTitleLikeSystemRoleName,
  isConfusingPositionTitle,
} = require('../utils/roleLayerNaming');
const { ensureRoleKeyNamespace } = require('../utils/roleKeySlug');

describe('roleLayerNaming', () => {
  it('normalizes without double-prefix', () => {
    assert.equal(normalizeLayerLabel('Vận hành dự án', 'system'), `${SYSTEM_ROLE_NAME_PREFIX}Vận hành dự án`);
    assert.equal(
      normalizeLayerLabel(`${SYSTEM_ROLE_NAME_PREFIX}Vận hành dự án`, 'system'),
      `${SYSTEM_ROLE_NAME_PREFIX}Vận hành dự án`
    );
    assert.equal(normalizeLayerLabel('Trưởng phòng', 'org'), `${ORG_ROLE_LABEL_PREFIX}Trưởng phòng`);
    assert.equal(normalizeLayerLabel('Tech Lead', 'project'), `${PROJECT_ROLE_LABEL_PREFIX}Tech Lead`);
  });

  it('splitLayerLabel detects prefix', () => {
    assert.equal(splitLayerLabel(`${ORG_ROLE_LABEL_PREFIX}X`, 'org').hasPrefix, true);
    assert.equal(splitLayerLabel('X', 'org').hasPrefix, false);
  });

  it('isTitleLikeSystemRoleName', () => {
    assert.equal(isTitleLikeSystemRoleName('Trưởng phòng Backend'), true);
    assert.equal(isTitleLikeSystemRoleName(`${SYSTEM_ROLE_NAME_PREFIX}Trưởng phòng`), true);
    assert.equal(isTitleLikeSystemRoleName('Vận hành dự án'), false);
    assert.equal(isTitleLikeSystemRoleName(`${SYSTEM_ROLE_NAME_PREFIX}Vận hành dự án`), false);
  });

  it('isConfusingPositionTitle', () => {
    assert.equal(isConfusingPositionTitle('Senior Backend'), false);
    assert.equal(isConfusingPositionTitle(`${SYSTEM_ROLE_NAME_PREFIX}Admin`), true);
    assert.equal(isConfusingPositionTitle('Gói quyền ops'), true);
  });

  it('canonicalizeSystemRoleName', () => {
    const { canonicalizeSystemRoleName } = require('../utils/roleLayerNaming');
    assert.equal(canonicalizeSystemRoleName('Quản trị viên'), `${SYSTEM_ROLE_NAME_PREFIX}Quản trị`);
    assert.equal(canonicalizeSystemRoleName('Nhân sự'), `${SYSTEM_ROLE_NAME_PREFIX}Vận hành HR`);
    assert.equal(canonicalizeSystemRoleName('Thành viên'), `${SYSTEM_ROLE_NAME_PREFIX}Thành viên`);
    assert.equal(
      canonicalizeSystemRoleName('Trưởng phòng Backend'),
      `${SYSTEM_ROLE_NAME_PREFIX}Vận hành Backend`
    );
    assert.equal(
      canonicalizeSystemRoleName(`${SYSTEM_ROLE_NAME_PREFIX}Vận hành Backend`),
      `${SYSTEM_ROLE_NAME_PREFIX}Vận hành Backend`
    );
  });
});

describe('ensureRoleKeyNamespace', () => {
  it('prefixes org/prj without doubling', () => {
    assert.equal(ensureRoleKeyNamespace('truong_phong', 'org'), 'org_truong_phong');
    assert.equal(ensureRoleKeyNamespace('org_truong_phong', 'org'), 'org_truong_phong');
    assert.equal(ensureRoleKeyNamespace('Tech Lead', 'prj'), 'prj_tech_lead');
    assert.equal(ensureRoleKeyNamespace('prj_tech_lead', 'prj'), 'prj_tech_lead');
  });
});
