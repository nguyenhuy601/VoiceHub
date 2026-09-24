const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  DEV_PERMS,
  QA_PERMS,
  PM_PERMS,
  defaultPermissionsForRoleKey,
  permissionsToBoardCapabilities,
} = require('../src/utils/project/projectPermissionMatrix');
const { isReadyForQaListTitle } = require('../src/services/boardCapabilities');

describe('board Done policy', () => {
  it('does not allow developers to move cards to Done', () => {
    assert.equal(permissionsToBoardCapabilities(DEV_PERMS).canMoveToDone, false);
  });

  it('allows QA to move cards to Done', () => {
    assert.equal(permissionsToBoardCapabilities(QA_PERMS).canMoveToDone, true);
  });

  it('allows PM and technical lead to move cards to Done', () => {
    assert.equal(permissionsToBoardCapabilities(PM_PERMS).canMoveToDone, true);
    assert.equal(
      permissionsToBoardCapabilities(
        defaultPermissionsForRoleKey('technical_lead')
      ).canMoveToDone,
      true
    );
  });

  it('recognizes the Ready for QA list title', () => {
    assert.equal(isReadyForQaListTitle('Ready for QA'), true);
  });
});

describe('default board lists include Ready for QA', () => {
  it('project.service DEFAULT_LIST_TITLES seeds Ready for QA before Done', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '../src/services/project.service.js'),
      'utf8'
    );
    const m = src.match(
      /DEFAULT_LIST_TITLES\s*=\s*Object\.freeze\(\[([^\]]+)\]\)/
    );
    assert.ok(m, 'DEFAULT_LIST_TITLES freeze array not found');
    const titles = m[1]
      .split(',')
      .map((s) => s.replace(/['"`]/g, '').trim())
      .filter(Boolean);
    assert.deepEqual(titles, ['To Do', 'In Progress', 'Ready for QA', 'Done']);
  });
});
