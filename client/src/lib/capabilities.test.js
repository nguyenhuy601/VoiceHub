import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PROJECT_CREATE_GRANT,
  buildWorkspaceCapabilities,
  canCreateProjectUi,
  canShowCreateFromPack,
} from './capabilities.js';

describe('buildWorkspaceCapabilities', () => {
  it('allows create when grantScopes has project.project.create', () => {
    const caps = buildWorkspaceCapabilities({
      grantScopes: { [PROJECT_CREATE_GRANT]: 'COMPANY' },
      canCreateTask: true,
    });
    assert.equal(canCreateProjectUi(caps), true);
  });

  it('denies create when grantScopes missing create key', () => {
    const caps = buildWorkspaceCapabilities({
      grantScopes: { 'employee.view': 'SELF' },
      canCreateTask: true,
    });
    assert.equal(canCreateProjectUi(caps), false);
    assert.equal(caps.project.denyReason, 'grant');
  });

  it('fail-closed on grantsError', () => {
    const caps = buildWorkspaceCapabilities({
      grantsError: true,
      canCreateTask: true,
    });
    assert.equal(canCreateProjectUi(caps), false);
    assert.equal(caps.project.denyReason, 'grants_error');
  });
});

describe('canShowCreateFromPack', () => {
  it('requires both persona pack flag and create grant', () => {
    assert.equal(canShowCreateFromPack(true, true), true);
    assert.equal(canShowCreateFromPack(true, false), false);
    assert.equal(canShowCreateFromPack(false, true), false);
    assert.equal(canShowCreateFromPack(false, false), false);
  });
});
