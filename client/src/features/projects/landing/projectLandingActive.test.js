import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isProjectActiveForUi,
  isProjectCompletedForUi,
} from './projectLandingActive.js';

describe('projectLandingActive', () => {
  it('treats closed as completed / not active', () => {
    assert.equal(isProjectCompletedForUi({ status: 'closed', isActive: true }), true);
    assert.equal(isProjectActiveForUi({ status: 'closed', isActive: true }), false);
  });

  it('treats draft/active as active when isActive', () => {
    assert.equal(isProjectActiveForUi({ status: 'draft', isActive: true }), true);
    assert.equal(isProjectActiveForUi({ status: 'planning', isActive: true }), true);
    assert.equal(isProjectCompletedForUi({ status: 'active' }), false);
    assert.equal(isProjectCompletedForUi({ status: 'in_development' }), false);
  });

  it('treats isActive false as completed', () => {
    assert.equal(isProjectCompletedForUi({ status: 'draft', isActive: false }), true);
    assert.equal(isProjectActiveForUi({ status: 'draft', isActive: false }), false);
  });
});
