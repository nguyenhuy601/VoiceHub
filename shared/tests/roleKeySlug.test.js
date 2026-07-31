const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  ROLE_KEY_MAX_LEN,
  ROLE_KEY_FALLBACK,
  slugifyRoleKey,
  ensureRoleKeyNamespace,
  allocateUniqueRoleKey,
} = require('../utils/roleKeySlug');

describe('slugifyRoleKey', () => {
  it('strips Vietnamese diacritics', () => {
    assert.equal(slugifyRoleKey('Trưởng nhóm'), 'truong_nhom');
    assert.equal(slugifyRoleKey('Điều phối QA'), 'dieu_phoi_qa');
  });

  it('maps đ/Đ to d', () => {
    assert.equal(slugifyRoleKey('Điều phối'), 'dieu_phoi');
    assert.equal(slugifyRoleKey('Đội ngũ'), 'doi_ngu');
  });

  it('collapses spaces and non-alnum', () => {
    assert.equal(slugifyRoleKey('  Tech  Lead  '), 'tech_lead');
    assert.equal(slugifyRoleKey('Front-End / UI'), 'front_end_ui');
  });

  it('falls back when empty or symbols only', () => {
    assert.equal(slugifyRoleKey(''), ROLE_KEY_FALLBACK);
    assert.equal(slugifyRoleKey('!!!'), ROLE_KEY_FALLBACK);
    assert.equal(slugifyRoleKey('🚀'), ROLE_KEY_FALLBACK);
  });

  it('truncates to max length', () => {
    const long = 'a'.repeat(80);
    const out = slugifyRoleKey(long);
    assert.ok(out.length <= ROLE_KEY_MAX_LEN);
    assert.equal(out, 'a'.repeat(ROLE_KEY_MAX_LEN));
  });
});

describe('allocateUniqueRoleKey', () => {
  it('returns base when free', () => {
    assert.equal(allocateUniqueRoleKey('Trưởng nhóm', []), 'truong_nhom');
  });

  it('suffixes when same slug from different labels', () => {
    const taken = new Set(['truong_nhom']);
    assert.equal(allocateUniqueRoleKey('Truong nhom', taken), 'truong_nhom_2');
    taken.add('truong_nhom_2');
    assert.equal(allocateUniqueRoleKey('Trưởng nhóm', taken), 'truong_nhom_3');
  });

  it('avoids colliding with system keys', () => {
    assert.equal(allocateUniqueRoleKey('Tech Lead', ['tech_lead']), 'tech_lead_2');
  });

  it('keeps result within max length when suffixing long base', () => {
    const base = 'a'.repeat(ROLE_KEY_MAX_LEN);
    const out = allocateUniqueRoleKey(base, [base]);
    assert.ok(out.length <= ROLE_KEY_MAX_LEN);
    assert.match(out, /_2$/);
  });
});

describe('ensureRoleKeyNamespace', () => {
  it('adds org_ and prj_ once', () => {
    assert.equal(ensureRoleKeyNamespace('Trưởng phòng', 'org'), 'org_truong_phong');
    assert.equal(ensureRoleKeyNamespace('org_truong_phong', 'org'), 'org_truong_phong');
    assert.equal(ensureRoleKeyNamespace('tech_lead', 'prj'), 'prj_tech_lead');
  });
});
