/**
 * Create bootstrap: only pmUserId receives project_manager.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  assertSingleProjectManager,
  stripExtraProjectManagerKeys,
  roleKeysIncludePm,
} = require('../src/utils/project/assertSingleProjectManager');

describe('create / assign single project_manager', () => {
  it('allows first PM assign', () => {
    const r = assertSingleProjectManager({
      userId: 'b',
      nextRoleKeys: ['project_manager'],
      existingMembers: [{ userId: 'a', projectRoleKeys: ['observer'] }],
    });
    assert.equal(r.ok, true);
  });

  it('rejects second PM when another member already has project_manager', () => {
    const r = assertSingleProjectManager({
      userId: 'a',
      nextRoleKeys: ['project_manager', 'observer'],
      existingMembers: [{ userId: 'b', projectRoleKeys: ['project_manager'] }],
    });
    assert.equal(r.ok, false);
    assert.equal(r.errorCode, 'PROJECT_PM_ALREADY_ASSIGNED');
    assert.equal(r.existingPmUserId, 'b');
  });

  it('allows same user to keep PM on update', () => {
    const r = assertSingleProjectManager({
      userId: 'b',
      nextRoleKeys: ['project_manager'],
      existingMembers: [{ userId: 'b', projectRoleKeys: ['project_manager'] }],
    });
    assert.equal(r.ok, true);
  });

  it('stripExtraProjectManagerKeys keeps sole PM only', () => {
    const map = new Map([
      ['creator', { keys: new Set(['project_manager', 'observer']) }],
      ['pm', { keys: new Set(['project_manager']) }],
    ]);
    stripExtraProjectManagerKeys(map, 'pm', 'observer');
    assert.equal(roleKeysIncludePm([...map.get('pm').keys]), true);
    assert.equal(roleKeysIncludePm([...map.get('creator').keys]), false);
    assert.ok(map.get('creator').keys.has('observer'));
  });
});
