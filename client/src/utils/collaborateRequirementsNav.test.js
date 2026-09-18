import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolvePositionKeyFromJobTitle,
  shouldShowCollaborateRequirementsNav,
  shouldShowCollaborateRequirementsNavForUser,
} from './collaborateRequirementsNav.js';

test('resolvePositionKeyFromJobTitle maps key and label', () => {
  assert.equal(resolvePositionKeyFromJobTitle('business_analyst'), 'business_analyst');
  assert.equal(resolvePositionKeyFromJobTitle('Business Analyst'), 'business_analyst');
  assert.equal(resolvePositionKeyFromJobTitle('Product Manager'), 'product_manager');
  assert.equal(resolvePositionKeyFromJobTitle(''), '');
});

test('shouldShowCollaborateRequirementsNav is Position-only', () => {
  assert.equal(shouldShowCollaborateRequirementsNav({ jobTitle: 'business_analyst' }), true);
  assert.equal(shouldShowCollaborateRequirementsNav({ jobTitle: 'product_manager' }), true);
  assert.equal(shouldShowCollaborateRequirementsNav({ jobTitle: 'software_developer' }), false);
  assert.equal(shouldShowCollaborateRequirementsNav({ jobTitle: '' }), false);
});

test('shouldShowCollaborateRequirementsNavForUser uses preferences.jobTitle SoT', () => {
  assert.equal(
    shouldShowCollaborateRequirementsNavForUser({
      jobTitle: 'software_developer',
      preferences: { jobTitle: 'business_analyst' },
    }),
    true
  );
  assert.equal(
    shouldShowCollaborateRequirementsNavForUser({
      preferences: { jobTitle: '' },
      jobTitle: 'business_analyst',
    }),
    false
  );
});
