import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectWizardRosterKeys, deliveryRosterStatus } from './projectDeliveryRoster.js';

test('creator PO + SM + Dev → đủ 3 band', () => {
  const keys = collectWizardRosterKeys([
    { userId: 'u2', projectRoleKeys: ['scrum_master'] },
    { userId: 'u3', projectRoleKeys: ['backend_developer'] },
  ]);
  const s = deliveryRosterStatus(keys);
  assert.equal(s.hasProduct, true);
  assert.equal(s.hasFacilitate, true);
  assert.equal(s.hasBuild, true);
});

test('thiếu SM/PM → hasFacilitate false', () => {
  const keys = collectWizardRosterKeys([{ userId: 'u2', projectRoleKeys: ['qa_engineer'] }]);
  const s = deliveryRosterStatus(keys);
  assert.equal(s.hasProduct, true);
  assert.equal(s.hasFacilitate, false);
  assert.equal(s.hasBuild, true);
});
