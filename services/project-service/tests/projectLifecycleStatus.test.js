const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  coerceProjectLifecycleStatus,
  PROJECT_STATUSES,
} = require('../src/utils/project/projectInitFields');
const { isProjectClosedStatus } = require('../src/utils/project/projectCloseGate');

describe('coerceProjectLifecycleStatus', () => {
  it('keeps current enum values', () => {
    for (const st of PROJECT_STATUSES) {
      assert.equal(coerceProjectLifecycleStatus(st), st);
    }
  });

  it('maps legacy terminals to closed', () => {
    assert.equal(coerceProjectLifecycleStatus('cancelled'), 'closed');
    assert.equal(coerceProjectLifecycleStatus('canceled'), 'closed');
    assert.equal(coerceProjectLifecycleStatus('completed'), 'closed');
    assert.equal(coerceProjectLifecycleStatus('archived'), 'closed');
  });

  it('maps legacy draft/new to planning', () => {
    assert.equal(coerceProjectLifecycleStatus('draft'), 'planning');
    assert.equal(coerceProjectLifecycleStatus('new'), 'planning');
    assert.equal(coerceProjectLifecycleStatus('created'), 'planning');
  });

  it('returns null for unknown', () => {
    assert.equal(coerceProjectLifecycleStatus('nope'), null);
    assert.equal(coerceProjectLifecycleStatus(''), null);
  });
});

describe('isProjectClosedStatus', () => {
  it('treats legacy cancelled as closed', () => {
    assert.equal(isProjectClosedStatus('closed'), true);
    assert.equal(isProjectClosedStatus('cancelled'), true);
    assert.equal(isProjectClosedStatus('in_development'), false);
  });
});
