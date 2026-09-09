import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  memberHasRealDisplayName,
  pickNamedMember,
  resolveWizardMemberLabel,
} from './projectWizardMemberLabel.js';

describe('memberHasRealDisplayName', () => {
  it('tên thật vs placeholder đuôi id', () => {
    assert.equal(memberHasRealDisplayName({ userId: 'abc123331dbb', displayName: 'Bùi Quang Huy' }), true);
    assert.equal(memberHasRealDisplayName({ userId: 'abc123331dbb', displayName: '331dbb' }), false);
    assert.equal(memberHasRealDisplayName({ userId: 'abc123331dbb' }), false);
  });
});

describe('pickNamedMember', () => {
  it('ưu tiên row có displayName, không lấy nameless org-wide', () => {
    const roster = { userId: 'u1', displayName: 'Nhất Nhất' };
    const orgWide = { userId: 'u1' };
    assert.equal(pickNamedMember(orgWide, roster), roster);
    assert.equal(pickNamedMember(roster, orgWide)?.displayName, 'Nhất Nhất');
  });
});

describe('resolveWizardMemberLabel', () => {
  const uid = 'aaaaaaaaaaaa331dbb';

  it('có trong viewMembers / deptRoster → tên', () => {
    const viewMembers = [{ userId: uid, displayName: 'Bùi Quang Huy' }];
    assert.equal(resolveWizardMemberLabel(uid, [viewMembers]), 'Bùi Quang Huy');
    const deptRoster = [{ userId: uid, displayName: 'Nhất Nhất' }];
    assert.equal(resolveWizardMemberLabel(uid, [deptRoster, []]), 'Nhất Nhất');
  });

  it('chỉ có trong members → tên', () => {
    const members = [{ userId: uid, displayName: 'Lan' }];
    assert.equal(resolveWizardMemberLabel(uid, [[], new Map(), members]), 'Lan');
  });

  it('không nguồn nào → 6 ký tự cuối id, không dùng employeeCode', () => {
    const members = [{ userId: uid, employeeCode: 'VH-001' }];
    assert.equal(resolveWizardMemberLabel(uid, [members]), '331dbb');
    assert.equal(resolveWizardMemberLabel(uid, []), '331dbb');
  });

  it('membersByIdAll Map', () => {
    const map = new Map([[uid, { userId: uid, displayName: 'Huy' }]]);
    assert.equal(resolveWizardMemberLabel(uid, [map]), 'Huy');
  });
});
