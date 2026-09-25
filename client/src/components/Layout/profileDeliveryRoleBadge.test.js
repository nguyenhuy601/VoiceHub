import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  projectIdFromPathname,
  resolveDeliveryRoleBadges,
} from './profileDeliveryRoleBadge.js';

describe('resolveDeliveryRoleBadges', () => {
  it('maps BA Tech PO PM with distinct shorts', () => {
    assert.deepEqual(
      resolveDeliveryRoleBadges(['business_analyst']).map((b) => b.short),
      ['BA']
    );
    assert.deepEqual(
      resolveDeliveryRoleBadges(['technical_lead']).map((b) => b.short),
      ['Tech']
    );
    assert.deepEqual(
      resolveDeliveryRoleBadges(['tech_lead']).map((b) => b.short),
      ['Tech']
    );
    assert.deepEqual(
      resolveDeliveryRoleBadges(['product_owner']).map((b) => b.short),
      ['PO']
    );
    assert.deepEqual(
      resolveDeliveryRoleBadges(['project_manager']).map((b) => b.short),
      ['PM']
    );
  });

  it('ignores unrelated roles', () => {
    assert.deepEqual(resolveDeliveryRoleBadges(['observer', 'developer']), []);
  });
});

describe('projectIdFromPathname', () => {
  it('extracts project id', () => {
    assert.equal(
      projectIdFromPathname('/app/projects/6ab28f816dc370d84e6715d2/customer-documents'),
      '6ab28f816dc370d84e6715d2'
    );
    assert.equal(projectIdFromPathname('/app/projects/new'), '');
    assert.equal(projectIdFromPathname('/app/me/settings'), '');
  });
});
