/**
 * Lazy prepare + G4 intake section guard (phase_what self-heal).
 */

const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');

const {
  countValidFr,
  assertRequiredIntakeSections,
  assertG4CanStart,
  emptyWorkbookDiagnostic,
} = require('../src/utils/requirement/workbookDiagnostic');

describe('countValidFr / assertRequiredIntakeSections', () => {
  it('prefers pack FR length when diagnostic validFr is stale zero', () => {
    const pack = {
      functionalRequirements: [{ externalId: 'CR-1' }, { externalId: 'CR-2' }],
      aiAnalysis: { workbookDiagnostic: emptyWorkbookDiagnostic() },
    };
    assert.equal(countValidFr(pack), 2);
  });

  it('rejects when FR required and validFr=0', () => {
    assert.throws(
      () => assertRequiredIntakeSections({ formOk: true, validFr: 0 }),
      (err) => err.errorCode === 'SOURCE_UNAVAILABLE'
    );
  });

  it('allows when validFr > 0 (NFR optional)', () => {
    assert.doesNotThrow(() =>
      assertRequiredIntakeSections({ formOk: true, validFr: 4, validNfr: 0 })
    );
  });
});

describe('ensurePreparedIntakeForWhat', () => {
  it('skips prepare when validFr already > 0', async () => {
    const { ensurePreparedIntakeForWhat } = require('../src/services/whatRequirementPhase.service');
    const pack = {
      functionalRequirements: [{ externalId: 'CR-001', name: 'A' }],
      aiAnalysis: {
        formValidation: { ok: true, recognizedAsCustomerRaw: true },
        workbookDiagnostic: emptyWorkbookDiagnostic(),
      },
    };
    const out = await ensurePreparedIntakeForWhat({
      pack,
      organizationId: 'org1',
      packId: 'pack1',
    });
    assert.equal(out.didPrepare, false);
    assert.equal(out.validFr, 1);
  });

  it('throws INTAKE_SOURCE_UNAVAILABLE when formOk + validFr=0 and no raw xlsx', async () => {
    const CustomerDocument = require('../src/models/CustomerDocument');
    mock.method(CustomerDocument, 'find', () => ({
      select() {
        return this;
      },
      lean: async () => [],
    }));

    const { ensurePreparedIntakeForWhat } = require('../src/services/whatRequirementPhase.service');
    const pack = {
      projectId: 'proj1',
      functionalRequirements: [],
      aiAnalysis: {
        formValidation: { ok: true, recognizedAsCustomerRaw: true },
        workbookDiagnostic: emptyWorkbookDiagnostic(),
      },
    };

    await assert.rejects(
      () =>
        ensurePreparedIntakeForWhat({
          pack,
          organizationId: 'org1',
          packId: 'pack1',
        }),
      (err) => err.errorCode === 'INTAKE_SOURCE_UNAVAILABLE'
    );

    mock.restoreAll();
  });
});

describe('assertG4CanStart after prepare contract', () => {
  it('diagnostic validFr alone is enough when pack FR empty (countValidFr max)', () => {
    const diag = emptyWorkbookDiagnostic();
    diag.status = 'SUCCESS';
    diag.rows.validFr = 3;
    diag.mappingDiagnostic = {
      status: 'COMPLETE',
      mapped: ['id', 'requirement'],
      missing: [],
    };
    const pack = {
      functionalRequirements: [],
      aiAnalysis: {
        formValidation: { ok: true, recognizedAsCustomerRaw: true },
        workbookDiagnostic: diag,
      },
    };
    assert.equal(countValidFr(pack), 3);
    assert.doesNotThrow(() => assertG4CanStart(pack, null));
  });
});
