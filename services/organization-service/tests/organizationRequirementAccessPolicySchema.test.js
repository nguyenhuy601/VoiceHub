const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Organization = require('../src/models/Organization');

describe('Organization.settings.requirementAccessPolicy', () => {
  it('persists Mixed policy (not stripped by strict nested settings)', () => {
    const doc = new Organization({
      name: 'schema-rap-test',
      ownerId: new mongoose.Types.ObjectId(),
    });
    doc.settings = doc.settings || {};
    doc.settings.requirementAccessPolicy = {
      version: 1,
      actions: {
        submitter: { view: true, import: false, submit: true, approve: false },
      },
    };
    doc.markModified('settings');

    const saved = doc.toObject().settings?.requirementAccessPolicy;
    assert.ok(saved);
    assert.equal(saved.version, 1);
    assert.equal(saved.actions.submitter.import, false);
    assert.equal(saved.actions.submitter.submit, true);
  });
});
