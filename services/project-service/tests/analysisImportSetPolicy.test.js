/**
 * T1 — Analysis Import Set pure policy (no DB).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  IMPORT_SET_ERROR_CODES,
  assertCanAttachRaw,
  assertCanAttachAnalysis,
  assertCanActivate,
  assertCanRestore,
  planActivateSwap,
  planRestoreSwap,
  assertDocumentBelongsToSetOrEmpty,
} = require('../src/constants/analysisImportSet');

describe('analysisImportSetPolicy', () => {
  it('rejects second Raw on same set', () => {
    assert.throws(
      () => assertCanAttachRaw({ rawDocumentId: 'doc1' }),
      (err) => err.errorCode === IMPORT_SET_ERROR_CODES.SLOT_RAW_TAKEN && err.statusCode === 409
    );
    assert.doesNotThrow(() => assertCanAttachRaw({ rawDocumentId: null }));
  });

  it('rejects second Analysis on same set', () => {
    assert.throws(
      () => assertCanAttachAnalysis({ analysisDocumentId: 'doc2' }),
      (err) => err.errorCode === IMPORT_SET_ERROR_CODES.SLOT_ANALYSIS_TAKEN && err.statusCode === 409
    );
  });

  it('activate requires Raw + Analysis + Pack', () => {
    assert.throws(
      () => assertCanActivate({ analysisDocumentId: 'a', packId: 'p' }),
      (err) => err.errorCode === IMPORT_SET_ERROR_CODES.MISSING_RAW
    );
    assert.throws(
      () => assertCanActivate({ rawDocumentId: 'r', packId: 'p' }),
      (err) => err.errorCode === IMPORT_SET_ERROR_CODES.MISSING_ANALYSIS
    );
    assert.throws(
      () => assertCanActivate({ rawDocumentId: 'r', analysisDocumentId: 'a' }),
      (err) => err.errorCode === IMPORT_SET_ERROR_CODES.MISSING_PACK
    );
    assert.doesNotThrow(() =>
      assertCanActivate({ rawDocumentId: 'r', analysisDocumentId: 'a', packId: 'p' })
    );
  });

  it('restore only from complete trashed set', () => {
    assert.throws(
      () =>
        assertCanRestore({
          status: 'active',
          rawDocumentId: 'r',
          analysisDocumentId: 'a',
          packId: 'p',
        }),
      (err) => err.errorCode === IMPORT_SET_ERROR_CODES.NOT_TRASHED
    );
    assert.throws(
      () =>
        assertCanRestore({
          status: 'trashed',
          rawDocumentId: 'r',
          analysisDocumentId: null,
          packId: 'p',
        }),
      (err) => err.errorCode === IMPORT_SET_ERROR_CODES.INCOMPLETE_FOR_RESTORE
    );
    assert.doesNotThrow(() =>
      assertCanRestore({
        status: 'trashed',
        rawDocumentId: 'r',
        analysisDocumentId: 'a',
        packId: 'p',
      })
    );
  });

  it('activate/restore swap trashes previous active', () => {
    assert.deepEqual(planActivateSwap({ activatingSetId: 's2', currentActiveSetId: 's1' }), {
      activateId: 's2',
      trashIds: ['s1'],
    });
    assert.deepEqual(planActivateSwap({ activatingSetId: 's1', currentActiveSetId: 's1' }), {
      activateId: 's1',
      trashIds: [],
    });
    assert.deepEqual(planRestoreSwap({ restoreSetId: 's1', currentActiveSetId: 's2' }), {
      activateId: 's1',
      trashIds: ['s2'],
    });
  });

  it('forbids mixing documents across sets', () => {
    assert.throws(
      () => assertDocumentBelongsToSetOrEmpty({ importSetId: 'setA' }, 'setB'),
      (err) => err.errorCode === IMPORT_SET_ERROR_CODES.MIX_FORBIDDEN
    );
    assert.doesNotThrow(() =>
      assertDocumentBelongsToSetOrEmpty({ importSetId: 'setA' }, 'setA')
    );
    assert.doesNotThrow(() => assertDocumentBelongsToSetOrEmpty({}, 'setA'));
  });
});
