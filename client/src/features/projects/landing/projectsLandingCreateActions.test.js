import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLandingCreateActions } from './projectsLandingCreateActions.js';

describe('resolveLandingCreateActions', () => {
  it('disables create while scope loading but still shows button', () => {
    const r = resolveLandingCreateActions({ scopeLoading: true, canCreate: false });
    assert.equal(r.showCreate, true);
    assert.equal(r.createDisabled, true);
  });

  it('hides create when scope denies', () => {
    const r = resolveLandingCreateActions({ scopeLoading: false, canCreate: false });
    assert.equal(r.showCreate, false);
    assert.equal(r.showCreateWithAi, false);
  });

  it('enables create when allowed; AI waits on requirement access', () => {
    const pending = resolveLandingCreateActions({
      scopeLoading: false,
      canCreate: true,
      requirementAccessLoading: true,
      canCreateWithAi: false,
    });
    assert.equal(pending.showCreate, true);
    assert.equal(pending.createDisabled, false);
    assert.equal(pending.showCreateWithAi, true);
    assert.equal(pending.createWithAiDisabled, true);

    const allowed = resolveLandingCreateActions({
      scopeLoading: false,
      canCreate: true,
      requirementAccessLoading: false,
      canCreateWithAi: true,
    });
    assert.equal(allowed.createWithAiDisabled, false);
    assert.equal(allowed.showCreateWithAi, true);
  });

  it('hides AI when create allowed but AI planning denied', () => {
    const r = resolveLandingCreateActions({
      scopeLoading: false,
      canCreate: true,
      requirementAccessLoading: false,
      canCreateWithAi: false,
    });
    assert.equal(r.showCreateWithAi, false);
  });
});
