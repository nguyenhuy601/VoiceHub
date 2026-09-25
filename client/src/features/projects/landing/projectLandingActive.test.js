import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isProjectActiveForUi,
  isProjectCompletedForUi,
  isProjectDraftForUi,
  isProjectListableForUi,
} from './projectLandingActive.js';

describe('projectLandingActive', () => {
  it('treats closed as completed / not active / not draft', () => {
    assert.equal(isProjectCompletedForUi({ status: 'closed', isActive: true }), true);
    assert.equal(isProjectActiveForUi({ status: 'closed', isActive: true }), false);
    assert.equal(isProjectDraftForUi({ status: 'closed', isActive: true }), false);
    assert.equal(isProjectListableForUi({ status: 'closed', isActive: true }), false);
  });

  it('treats draft and legacy planning as draft, not active', () => {
    assert.equal(isProjectDraftForUi({ status: 'draft', isActive: true }), true);
    assert.equal(isProjectDraftForUi({ status: 'planning', isActive: true }), true);
    assert.equal(isProjectDraftForUi({ status: 'ready_for_planning', isActive: true }), true);
    assert.equal(isProjectActiveForUi({ status: 'draft', isActive: true }), false);
    assert.equal(isProjectActiveForUi({ status: 'planning', isActive: true }), false);
    assert.equal(isProjectListableForUi({ status: 'draft', isActive: true }), true);
  });

  it('treats active / on_hold / in_development as active, not draft', () => {
    assert.equal(isProjectActiveForUi({ status: 'active', isActive: true }), true);
    assert.equal(isProjectActiveForUi({ status: 'on_hold', isActive: true }), true);
    assert.equal(isProjectActiveForUi({ status: 'in_development', isActive: true }), true);
    assert.equal(isProjectDraftForUi({ status: 'active', isActive: true }), false);
    assert.equal(isProjectCompletedForUi({ status: 'active' }), false);
    assert.equal(isProjectCompletedForUi({ status: 'in_development' }), false);
    assert.equal(isProjectListableForUi({ status: 'on_hold', isActive: true }), true);
  });

  it('treats isActive false as completed / not listable', () => {
    assert.equal(isProjectCompletedForUi({ status: 'draft', isActive: false }), true);
    assert.equal(isProjectActiveForUi({ status: 'draft', isActive: false }), false);
    assert.equal(isProjectDraftForUi({ status: 'draft', isActive: false }), false);
    assert.equal(isProjectListableForUi({ status: 'draft', isActive: false }), false);
  });
});
