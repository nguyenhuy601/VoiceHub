/**
 * @vitest-environment node
 * Lightweight contract for Wave B capabilities helper (run via node --test if imported as CJS —
 * this file is ESM; covered by client build + source usage).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkspaceCapabilities, canCreateProjectUi } from './capabilities.js';

describe('buildWorkspaceCapabilities', () => {
  it('Create Project uses canCreateProject not canCreateTask alone', () => {
    const caps = buildWorkspaceCapabilities({
      canCreateTask: true,
      canCreateProject: false,
    });
    assert.equal(caps.project.create, false);
    assert.equal(caps.task.create, true);
  });

  it('requires grant when masterGrants provided', () => {
    const deny = buildWorkspaceCapabilities({
      canCreateProject: true,
      masterGrants: ['project.project.view'],
    });
    assert.equal(deny.project.create, false);
    const allow = buildWorkspaceCapabilities({
      canCreateProject: true,
      masterGrants: ['project.project.create'],
    });
    assert.equal(allow.project.create, true);
    assert.equal(canCreateProjectUi(allow), true);
  });

  it('resolved empty masterGrants denies create (not unknown)', () => {
    const caps = buildWorkspaceCapabilities({
      canCreateProject: true,
      masterGrants: [],
    });
    assert.equal(caps.project.create, false);
  });

  it('grantsError fail-closed denies create', () => {
    const caps = buildWorkspaceCapabilities({
      canCreateProject: true,
      canCreateTask: true,
      grantsError: true,
      masterGrants: ['project.project.create'],
    });
    assert.equal(caps.project.create, false);
    assert.equal(caps.task.create, true);
  });

  it('unknown grants (omit masterGrants) relies on scope flag', () => {
    const caps = buildWorkspaceCapabilities({
      canCreateProject: true,
    });
    assert.equal(caps.project.create, true);
  });

  it('grant match is case-insensitive', () => {
    const caps = buildWorkspaceCapabilities({
      canCreateProject: true,
      masterGrants: ['Project.Project.Create'],
    });
    assert.equal(caps.project.create, true);
  });
});
