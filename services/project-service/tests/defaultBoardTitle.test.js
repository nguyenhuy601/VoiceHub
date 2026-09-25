const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  FALLBACK_BOARD_TITLE,
  resolveDefaultBoardTitle,
  resolveBoardTitle,
} = require('../src/utils/project/defaultBoardTitle');

describe('defaultBoardTitle', () => {
  it('resolveDefaultBoardTitle: uses projectCode', () => {
    assert.equal(resolveDefaultBoardTitle('SM'), 'SM');
    assert.equal(resolveDefaultBoardTitle('  CRM-1  '), 'CRM-1');
  });

  it('resolveDefaultBoardTitle: empty → PRJ', () => {
    assert.equal(resolveDefaultBoardTitle(''), FALLBACK_BOARD_TITLE);
    assert.equal(resolveDefaultBoardTitle(null), FALLBACK_BOARD_TITLE);
    assert.equal(resolveDefaultBoardTitle(undefined), FALLBACK_BOARD_TITLE);
    assert.equal(resolveDefaultBoardTitle('   '), FALLBACK_BOARD_TITLE);
  });

  it('resolveBoardTitle: explicit title wins', () => {
    assert.equal(resolveBoardTitle({ title: 'Sprint Board', projectCode: 'SM' }), 'Sprint Board');
    assert.equal(resolveBoardTitle({ title: '  Sprint  ', projectCode: 'SM' }), 'Sprint');
  });

  it('resolveBoardTitle: empty title → projectCode', () => {
    assert.equal(resolveBoardTitle({ title: '', projectCode: 'SM' }), 'SM');
    assert.equal(resolveBoardTitle({ title: '   ', projectCode: 'CRM' }), 'CRM');
    assert.equal(resolveBoardTitle({ projectCode: 'BH-01' }), 'BH-01');
  });

  it('resolveBoardTitle: no title and no code → PRJ', () => {
    assert.equal(resolveBoardTitle({}), FALLBACK_BOARD_TITLE);
    assert.equal(resolveBoardTitle({ title: '', projectCode: '' }), FALLBACK_BOARD_TITLE);
  });
});
