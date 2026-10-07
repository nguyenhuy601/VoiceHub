const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { toPublicOrganization } = require('../src/utils/orgDto');

const doc = {
  _id: 'org1',
  name: 'Acme',
  description: 'd',
  slug: 'acme',
  ownerId: 'u1',
  settings: { allowedEmailDomains: ['acme.vn'], projectVisibility: { mode: 'team' } },
  provisioning: { structure: { status: 'ready', error: 'secret stack' } },
};

describe('orgDto.toPublicOrganization settings slim (RULE-18)', () => {
  for (const role of ['owner', 'admin', 'hr', 'HR']) {
    it(`${role} receives full settings`, () => {
      const out = toPublicOrganization(doc, { myRole: role });
      assert.deepEqual(out.settings, doc.settings);
    });
  }

  for (const role of ['member', undefined, '', 'guest']) {
    it(`${String(role)} receives empty settings, key kept`, () => {
      const out = toPublicOrganization(doc, role === undefined ? {} : { myRole: role });
      assert.ok(Object.prototype.hasOwnProperty.call(out, 'settings'));
      assert.deepEqual(out.settings, {});
    });
  }

  it('other fields unchanged and provisioning error hidden', () => {
    const member = toPublicOrganization(doc, { myRole: 'member', memberCount: 3 });
    const owner = toPublicOrganization(doc, { myRole: 'owner', memberCount: 3 });
    const { settings: _a, ...memberRest } = member;
    const { settings: _b, ...ownerRest } = owner;
    assert.deepEqual({ ...memberRest, myRole: 'x' }, { ...ownerRest, myRole: 'x' });
    assert.equal(member.memberCount, 3);
    assert.deepEqual(member.provisioning, { structure: { status: 'ready', completedAt: null } });
  });
});
