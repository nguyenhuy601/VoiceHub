/**
 * aggregateWorkbookResults — deterministic multi-file merge.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  aggregateWorkbookResults,
  computeAggregateStatus,
  compareWorkbookMeta,
} = require('../src/utils/requirement/aggregateWorkbookResults');
const { emptyWorkbookDiagnostic } = require('../src/utils/requirement/workbookDiagnostic');

function frResult({
  documentId,
  createdAt,
  status,
  frs = [],
  filename = 'a.xlsx',
}) {
  const diagnostic = emptyWorkbookDiagnostic(filename);
  diagnostic.status = status;
  diagnostic.rows.validFr = frs.length;
  diagnostic.frSourceMap = frs.map((row, index) => ({
    externalId: row.externalId,
    sheet: '03_Requirement',
    row: index + 2,
  }));
  if (status === 'SUCCESS' || status === 'PARTIAL') {
    diagnostic.mappingDiagnostic = {
      status: 'COMPLETE',
      required: ['id', 'requirement'],
      mapped: ['id', 'requirement'],
      missing: [],
      candidates: [],
    };
  }
  if (status === 'NOT_READY') {
    diagnostic.reasonCodes = ['REQUIREMENT_ROWS_EMPTY'];
  }
  if (status === 'FAILED') {
    diagnostic.reasonCodes = ['PARSER_ERROR'];
  }
  return {
    functionalRequirements: frs,
    nonFunctionalRequirements: [],
    customerRawRows: {
      businessRequests: [],
      references: [],
      requirementSources: [],
    },
    workbookDiagnostic: diagnostic,
    overview: {},
    scope: [],
    meta: { documentId, filename, createdAt, applied: frs.length > 0 },
  };
}

describe('aggregateWorkbookResults', () => {
  it('sorts by createdAt then documentId when timestamps match', () => {
    assert.ok(
      compareWorkbookMeta(
        { createdAt: '2020-01-01T00:00:00.000Z', documentId: 'a' },
        { createdAt: '2020-01-01T00:00:00.000Z', documentId: 'b' }
      ) < 0
    );
  });

  it('keeps the earlier documentId when externalIds collide at the same createdAt', () => {
    const a = frResult({
      documentId: 'doc-a',
      createdAt: '2020-01-01T00:00:00.000Z',
      status: 'SUCCESS',
      frs: [{ externalId: 'CR-001', name: 'From A', level: 'Requirement' }],
    });
    const b = frResult({
      documentId: 'doc-b',
      createdAt: '2020-01-01T00:00:00.000Z',
      status: 'SUCCESS',
      frs: [{ externalId: 'CR-001', name: 'From B', level: 'Requirement' }],
    });
    // Pass B first to prove sort is not input order
    const out = aggregateWorkbookResults([b, a]);
    assert.equal(out.functionalRequirements.length, 1);
    assert.equal(out.functionalRequirements[0].name, 'From A');
  });

  it('marks PARTIAL when one file is SUCCESS and another is NOT_READY', () => {
    const a = frResult({
      documentId: 'doc-a',
      createdAt: 1,
      status: 'SUCCESS',
      frs: [{ externalId: 'CR-001', name: 'Kept', level: 'Requirement' }],
    });
    const b = frResult({
      documentId: 'doc-b',
      createdAt: 2,
      status: 'NOT_READY',
      frs: [],
    });
    const out = aggregateWorkbookResults([a, b]);
    assert.equal(out.workbookDiagnostic.status, 'PARTIAL');
    assert.equal(out.functionalRequirements.length, 1);
    assert.equal(out.functionalRequirements[0].externalId, 'CR-001');
    assert.equal(out.workbookDiagnostics.length, 2);
  });

  it('marks FAILED when every file FAILED', () => {
    const a = frResult({ documentId: 'a', createdAt: 1, status: 'FAILED' });
    const b = frResult({ documentId: 'b', createdAt: 2, status: 'FAILED' });
    const out = aggregateWorkbookResults([a, b]);
    assert.equal(out.workbookDiagnostic.status, 'FAILED');
    assert.equal(out.functionalRequirements.length, 0);
  });

  it('marks NOT_READY when validFr is zero and not every file FAILED', () => {
    const a = frResult({ documentId: 'a', createdAt: 1, status: 'NOT_READY' });
    const b = frResult({ documentId: 'b', createdAt: 2, status: 'FAILED' });
    const out = aggregateWorkbookResults([a, b]);
    assert.equal(out.workbookDiagnostic.status, 'NOT_READY');
  });

  it('marks SUCCESS when every file is SUCCESS', () => {
    const a = frResult({
      documentId: 'a',
      createdAt: 1,
      status: 'SUCCESS',
      frs: [{ externalId: 'CR-001', name: 'A', level: 'Requirement' }],
    });
    const b = frResult({
      documentId: 'b',
      createdAt: 2,
      status: 'SUCCESS',
      frs: [{ externalId: 'CR-002', name: 'B', level: 'Requirement' }],
    });
    const out = aggregateWorkbookResults([a, b]);
    assert.equal(out.workbookDiagnostic.status, 'SUCCESS');
    assert.equal(out.functionalRequirements.length, 2);
  });

  it('computeAggregateStatus matches RULE-AGG-01', () => {
    assert.equal(computeAggregateStatus([{ status: 'FAILED' }, { status: 'FAILED' }], 0), 'FAILED');
    assert.equal(computeAggregateStatus([{ status: 'NOT_READY' }], 0), 'NOT_READY');
    assert.equal(
      computeAggregateStatus([{ status: 'SUCCESS' }, { status: 'NOT_READY' }], 1),
      'PARTIAL'
    );
    assert.equal(computeAggregateStatus([{ status: 'SUCCESS' }], 1), 'SUCCESS');
  });
});
