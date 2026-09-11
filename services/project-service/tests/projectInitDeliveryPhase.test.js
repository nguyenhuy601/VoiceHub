const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildProjectInitFields,
} = require('../src/utils/project/projectInitFields');

describe('buildProjectInitFields deliveryPhase', () => {
  it('defaults new projects to requirement_analysis', () => {
    const init = buildProjectInitFields({});
    assert.equal(init.ok, true);
    assert.equal(init.fields.deliveryPhase, 'requirement_analysis');
  });

  it('accepts explicit deliveryPhase on create', () => {
    const init = buildProjectInitFields({ deliveryPhase: 'development' });
    assert.equal(init.ok, true);
    assert.equal(init.fields.deliveryPhase, 'development');
  });

  it('partial patch can set deliveryPhase', () => {
    const init = buildProjectInitFields({ deliveryPhase: 'qa_uat' }, { partial: true });
    assert.equal(init.ok, true);
    assert.equal(init.fields.deliveryPhase, 'qa_uat');
  });

  it('rejects invalid deliveryPhase', () => {
    const init = buildProjectInitFields({ deliveryPhase: 'nope' }, { partial: true });
    assert.equal(init.ok, false);
  });
});
