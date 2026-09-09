import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveEnrichedMemberContact } from './enrichOrgMembersContact.js';

describe('resolveEnrichedMemberContact', () => {
  it('membership đã có email, getProfile trống → giữ email org', () => {
    const out = resolveEnrichedMemberContact(
      { displayName: 'Nguyên Huy', email: '' },
      { email: 'nv.be.lead@voicehub.local', displayName: 'Nguyên Huy' },
      { userId: 'aaaaaaaaaaaa331dbb', fallback: '—' }
    );
    assert.equal(out.email, 'nv.be.lead@voicehub.local');
    assert.equal(out.displayName, 'Nguyên Huy');
  });

  it('profile có email thì ưu tiên profile', () => {
    const out = resolveEnrichedMemberContact(
      { displayName: 'Quân', email: 'quan@voicehub.local' },
      { email: 'old@voicehub.local', displayName: 'Old' }
    );
    assert.equal(out.email, 'quan@voicehub.local');
    assert.equal(out.displayName, 'Quân');
  });

  it('profile và membership đều trống tên → fallback đuôi id', () => {
    const uid = 'abc123331dbb';
    const out = resolveEnrichedMemberContact(null, {}, { userId: uid, fallback: '—' });
    assert.equal(out.email, '');
    assert.equal(out.displayName, uid.slice(-6));
  });
});
