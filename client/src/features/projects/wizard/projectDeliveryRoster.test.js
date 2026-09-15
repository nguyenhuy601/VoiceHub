import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectWizardRosterKeys, deliveryRosterStatus } from './projectDeliveryRoster.js';

test('không mặc định creator PO — thiếu BA → hasBa false', () => {
  const keys = collectWizardRosterKeys([
    { userId: 'u2', projectRoleKeys: ['scrum_master'] },
    { userId: 'u3', projectRoleKeys: ['backend_developer'] },
  ]);
  const s = deliveryRosterStatus(keys);
  assert.equal(s.hasProduct, false);
  assert.equal(s.hasBa, false);
  assert.equal(s.hasPo, false);
  assert.equal(s.hasFacilitate, true);
  assert.equal(s.hasBuild, true);
});

test('T4 intake PO+PM+BA không Dev — không giả định creator PO', () => {
  const keys = collectWizardRosterKeys([
    { userId: 'u1', projectRoleKeys: ['product_owner', 'project_manager'] },
    { userId: 'u2', projectRoleKeys: ['business_analyst'] },
  ]);
  const s = deliveryRosterStatus(keys);
  assert.equal(s.hasPo, true);
  assert.equal(s.hasBa, true);
  assert.equal(s.hasFacilitate, true);
  assert.ok(!keys.includes('developer'));
});

test('gán BA trên seed → hasBa / hasProduct', () => {
  const keys = collectWizardRosterKeys([
    { userId: 'u1', projectRoleKeys: ['business_analyst'] },
    { userId: 'u2', projectRoleKeys: ['scrum_master'] },
    { userId: 'u3', projectRoleKeys: ['frontend_developer'] },
  ]);
  const s = deliveryRosterStatus(keys);
  assert.equal(s.hasBa, true);
  assert.equal(s.hasProduct, true);
  assert.equal(s.hasFacilitate, true);
  assert.equal(s.hasBuild, true);
});

test('thiếu SM/PM → hasFacilitate false', () => {
  const keys = collectWizardRosterKeys([{ userId: 'u2', projectRoleKeys: ['qa_engineer'] }]);
  const s = deliveryRosterStatus(keys);
  assert.equal(s.hasProduct, false);
  assert.equal(s.hasFacilitate, false);
  assert.equal(s.hasBuild, true);
});
