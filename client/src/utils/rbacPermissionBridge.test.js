import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveLegacyEntriesFromCatalogDraft,
  permissionDraftForEditor,
  permissionEntriesForPersist,
} from './rbacPermissionBridge.js';

describe('permissionDraftForEditor', () => {
  it('maps legacy chat/task role permissions onto catalog checkboxes', () => {
    const draft = permissionDraftForEditor([
      { resource: 'chat', actions: ['read', 'write'] },
      { resource: 'task', actions: ['read'] },
      { resource: 'role', actions: ['read'] },
    ]);
    assert.equal(draft['channel:view'], true);
    assert.equal(draft['channel:create'], true);
    assert.equal(draft['task:view'], true);
    assert.equal(draft['project:view'], true);
    assert.equal(draft['system:view_audit_log'], true);
    assert.equal(draft['chat:read'], undefined);
  });

  it('keeps existing catalog keys as-is', () => {
    const draft = permissionDraftForEditor([
      { resource: 'user', actions: ['view', 'update'] },
      { resource: 'channel', actions: ['view'] },
    ]);
    assert.equal(draft['user:view'], true);
    assert.equal(draft['user:update'], true);
    assert.equal(draft['channel:view'], true);
  });

  it('expands wildcard resource', () => {
    const draft = permissionDraftForEditor([{ resource: '*', actions: ['*'] }]);
    assert.equal(draft['channel:view'], true);
    assert.equal(draft['system:manage_role'], true);
  });
});

describe('permissionEntriesForPersist', () => {
  it('dual-writes catalog + legacy gateway actions', () => {
    const entries = permissionEntriesForPersist({
      'channel:view': true,
      'channel:create': true,
      'task:view': true,
      'user:view': true,
    });
    const byResource = Object.fromEntries(entries.map((e) => [e.resource, e.actions.sort()]));
    assert.ok(byResource.channel?.includes('view'));
    assert.ok(byResource.channel?.includes('create'));
    assert.ok(byResource.chat?.includes('read'));
    assert.ok(byResource.chat?.includes('write'));
    assert.ok(byResource.task?.includes('view'));
    assert.ok(byResource.task?.includes('read'));
    assert.ok(byResource.organization_member?.includes('read'));
  });
});

describe('deriveLegacyEntriesFromCatalogDraft', () => {
  it('does not invent legacy when draft empty', () => {
    assert.deepEqual(deriveLegacyEntriesFromCatalogDraft({}), []);
  });
});
