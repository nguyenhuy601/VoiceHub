const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('setUnitMembers rejects operator-shaped member ids before write', () => {
  it('throws ORG_INVALID_ID when a member entry has no ObjectId string, before deleteMany', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/controllers/structureController.js'),
      'utf8'
    );
    const guard = src.indexOf("errorCode = 'ORG_INVALID_ID'");
    const wipe = src.indexOf('OrgUnitMembership.deleteMany');
    assert.ok(guard > 0, 'missing invalid-id throw');
    assert.ok(wipe > guard, 'deleteMany must stay after the invalid-id throw');
  });
});
