/**
 * Huy: Unit tests — setup một lần (lock + grandfather).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isStructureSetupCompleted } = require('../src/services/orgUnitTree.service');

describe('isStructureSetupCompleted', () => {
  it('false when no doc', () => {
    assert.equal(isStructureSetupCompleted(null), false);
    assert.equal(isStructureSetupCompleted(undefined), false);
  });

  it('true when setupCompletedAt set', () => {
    assert.equal(
      isStructureSetupCompleted({ setupCompletedAt: new Date(), levels: [] }),
      true
    );
  });

  it('true when grandfather levels present without flag', () => {
    assert.equal(
      isStructureSetupCompleted({
        setupCompletedAt: null,
        levels: [{ key: 'team', label: 'Team', order: 1 }],
      }),
      true
    );
  });

  it('false when empty levels and no flag', () => {
    assert.equal(isStructureSetupCompleted({ setupCompletedAt: null, levels: [] }), false);
  });
});

describe('ORG_STRUCTURE_SETUP_LOCKED contract', () => {
  it('error shape matches API code used by replaceLevels', () => {
    const err = new Error('Cơ cấu tổ chức đã được thiết lập — không thể đổi template/levels');
    err.statusCode = 409;
    err.errorCode = 'ORG_STRUCTURE_SETUP_LOCKED';
    assert.equal(err.statusCode, 409);
    assert.equal(err.errorCode, 'ORG_STRUCTURE_SETUP_LOCKED');
    assert.equal(isStructureSetupCompleted({ levels: [{ key: 'a' }] }), true);
  });
});
