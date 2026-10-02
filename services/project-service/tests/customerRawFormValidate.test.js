/**
 * Customer Raw form validation — sheets + headers only (no content quota).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

const {
  CUSTOMER_RAW_SHEETS,
  CUSTOMER_RAW_SHEET_COLUMNS,
} = require('../src/constants/customerRawTemplate.constants');
const {
  validateCustomerRawForm,
} = require('../src/utils/requirement/customerRawFormValidate');
const {
  buildCustomerRawTemplateBuffer,
} = require('../src/utils/requirement/customerRawTemplateBuilder');
const {
  assertG4CanStart,
  emptyWorkbookDiagnostic,
} = require('../src/utils/requirement/workbookDiagnostic');
const {
  runSourceIngestEngine,
  resolveProjectionRows,
  coverageReason,
} = require('../src/utils/srsProposal/engines/engineHelpers');

function buildWorkbookBuffer(sheets) {
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function fullFormSheets({ dropColumn = null, omitSheet = null, nfrRows = null } = {}) {
  const sheets = [];
  for (const sheetName of Object.values(CUSTOMER_RAW_SHEETS)) {
    if (omitSheet && sheetName === omitSheet) continue;
    let cols = [...(CUSTOMER_RAW_SHEET_COLUMNS[sheetName] || [])];
    if (dropColumn && sheetName === dropColumn.sheet) {
      cols = cols.filter((c) => c !== dropColumn.col);
    }
    const rows = [cols];
    if (sheetName === CUSTOMER_RAW_SHEETS.META) {
      rows.push(['TemplateType', 'CustomerRaw']);
      rows.push(['TemplateVersion', '1.1-raw']);
    }
    if (sheetName === CUSTOMER_RAW_SHEETS.NFR && Array.isArray(nfrRows)) {
      rows.push(...nfrRows);
    }
    sheets.push({ name: sheetName, rows });
  }
  return buildWorkbookBuffer(sheets);
}

describe('validateCustomerRawForm', () => {
  it('T1a: full headers OK (headers only, NFR may be empty)', () => {
    const buf = fullFormSheets({ nfrRows: [] });
    const result = validateCustomerRawForm(buf);
    assert.equal(result.ok, true);
    assert.equal(result.recognizedAsCustomerRaw, true);
    assert.equal(result.missingSheets.length, 0);
    assert.deepEqual(result.missingHeadersBySheet, {});
  });

  it('T1b: drop one required column → form INVALID', () => {
    const buf = fullFormSheets({
      dropColumn: { sheet: CUSTOMER_RAW_SHEETS.REQUIREMENT, col: 'Requirement ID' },
    });
    const result = validateCustomerRawForm(buf);
    assert.equal(result.ok, false);
    assert.ok(result.missingHeadersBySheet[CUSTOMER_RAW_SHEETS.REQUIREMENT]?.includes('Requirement ID'));
  });

  it('T1c: missing required sheet → form INVALID', () => {
    const buf = fullFormSheets({ omitSheet: CUSTOMER_RAW_SHEETS.BUSINESS_REQUEST });
    const result = validateCustomerRawForm(buf);
    assert.equal(result.ok, false);
    assert.ok(result.missingSheets.includes(CUSTOMER_RAW_SHEETS.BUSINESS_REQUEST));
  });

  it('T2: official Customer Raw template buffer → form OK (StudentManagement-equivalent form)', async () => {
    const buf = Buffer.from(await buildCustomerRawTemplateBuffer());
    const result = validateCustomerRawForm(buf);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.templateType, 'CustomerRaw');
  });

  it('T2b: asset file if present → form OK', () => {
    const assetPath = path.join(
      __dirname,
      '../assets/Customer_Requirement_Raw.xlsx'
    );
    if (!fs.existsSync(assetPath)) {
      return;
    }
    const result = validateCustomerRawForm(fs.readFileSync(assetPath));
    assert.equal(result.ok, true);
  });

  it('empty buffer → not recognized', () => {
    const result = validateCustomerRawForm(Buffer.alloc(0));
    assert.equal(result.ok, false);
    assert.equal(result.recognizedAsCustomerRaw, false);
  });
});

describe('assertG4CanStart form gate', () => {
  it('T1: Raw form OK + validFr=0 → SOURCE_UNAVAILABLE (no silent G4)', () => {
    const pack = {
      functionalRequirements: [],
      aiAnalysis: {
        formValidation: { ok: true, recognizedAsCustomerRaw: true, templateType: 'CustomerRaw' },
        workbookDiagnostic: emptyWorkbookDiagnostic(),
      },
    };
    assert.throws(
      () => assertG4CanStart(pack, null),
      (err) => err.errorCode === 'SOURCE_UNAVAILABLE'
    );
  });

  it('T1b: Raw form OK + pack FR present → allow', () => {
    const pack = {
      functionalRequirements: [{ externalId: 'CR-001', name: 'Search' }],
      aiAnalysis: {
        formValidation: { ok: true, recognizedAsCustomerRaw: true, templateType: 'CustomerRaw' },
        workbookDiagnostic: emptyWorkbookDiagnostic(),
      },
    };
    assert.doesNotThrow(() => assertG4CanStart(pack, null));
  });

  it('Raw recognized form INVALID → CUSTOMER_RAW_FORM_INVALID', () => {
    const pack = {
      functionalRequirements: [],
      aiAnalysis: {
        formValidation: {
          ok: false,
          recognizedAsCustomerRaw: true,
          missingSheets: ['02_Business_Request'],
        },
        workbookDiagnostic: emptyWorkbookDiagnostic(),
      },
    };
    assert.throws(
      () => assertG4CanStart(pack, null),
      (err) => err.errorCode === 'CUSTOMER_RAW_FORM_INVALID'
    );
  });

  it('Raw intake via customerRawRows without FR → SOURCE_UNAVAILABLE', () => {
    const pack = {
      functionalRequirements: [],
      aiAnalysis: {
        customerRawRows: { businessRequests: [{ id: 'BRQ-1' }], references: [], requirementSources: [] },
        workbookDiagnostic: emptyWorkbookDiagnostic(),
      },
    };
    assert.throws(
      () => assertG4CanStart(pack, null),
      (err) => err.errorCode === 'SOURCE_UNAVAILABLE'
    );
  });

  it('Raw intake via workbookDiagnostic.intakeKind without FR → SOURCE_UNAVAILABLE', () => {
    const diag = emptyWorkbookDiagnostic();
    diag.intakeKind = 'customer_raw';
    const pack = {
      functionalRequirements: [],
      aiAnalysis: { workbookDiagnostic: diag },
    };
    assert.throws(
      () => assertG4CanStart(pack, null),
      (err) => err.errorCode === 'SOURCE_UNAVAILABLE'
    );
  });

  it('T3: Analysis path, no Raw, validFr=0 → REQUIREMENT_NOT_READY', () => {
    const pack = {
      functionalRequirements: [],
      aiAnalysis: {
        formValidation: { ok: false },
        workbookDiagnostic: emptyWorkbookDiagnostic(),
      },
    };
    assert.throws(
      () => assertG4CanStart(pack, null),
      (err) => err.errorCode === 'REQUIREMENT_NOT_READY'
    );
  });
});

describe('buildPhase1Readiness Raw form', () => {
  const { buildPhase1Readiness } = require('../src/services/requirementPhase1Pipeline.service');

  it('T4: formValidation.ok → requirementReadiness READY despite validFr=0', () => {
    const pack = {
      status: 'draft',
      aiAnalysis: {
        formValidation: { ok: true, recognizedAsCustomerRaw: true },
        workbookDiagnostic: emptyWorkbookDiagnostic(),
        intakeCorpus: { totalChars: 10, excerpts: [{}] },
        inputDocuments: [{ documentId: 'd1' }],
        skillCatalogStub: { skills: [] },
        sources: { skill_catalog: true },
      },
      aiAnalysisActiveSnapshotId: 'snap1',
    };
    const readiness = buildPhase1Readiness(pack, {
      intakeCorpusChars: 10,
      excerptsCount: 1,
    });
    assert.equal(readiness.requirementReadiness, 'READY');
    assert.equal(readiness.formValidation.ok, true);
  });
});

describe('empty source → SOURCE_SHEET_EMPTY|ABSENT (0 LLM ingest)', () => {
  it('absent projection → SOURCE_SHEET_ABSENT soft gap', () => {
    const input = { pack: {} };
    const resolved = resolveProjectionRows(input, ['businessGlossary']);
    assert.equal(resolved.absent, true);
    assert.equal(coverageReason(resolved), 'SOURCE_SHEET_ABSENT');
    const result = runSourceIngestEngine({
      engineId: 'test-gloss',
      section: 'businessGlossary',
      packKeys: ['businessGlossary'],
      mapRow: (row) => row,
      input,
    });
    assert.equal(result.items?.length || 0, 0);
    assert.equal(result.coverage?.reason, 'SOURCE_SHEET_ABSENT');
    assert.equal(result.coverage?.status, 'NO_DATA');
  });

  it('empty rows → SOURCE_SHEET_EMPTY soft gap', () => {
    const input = {
      pack: { businessGlossary: [] },
    };
    const resolved = resolveProjectionRows(input, ['businessGlossary']);
    assert.equal(resolved.empty || !resolved.rows.length, true);
    assert.equal(coverageReason(resolved), 'SOURCE_SHEET_EMPTY');
    const result = runSourceIngestEngine({
      engineId: 'test-gloss',
      section: 'businessGlossary',
      packKeys: ['businessGlossary'],
      mapRow: (row) => row,
      input,
    });
    assert.equal(result.items?.length || 0, 0);
    assert.equal(result.coverage?.reason, 'SOURCE_SHEET_EMPTY');
  });
});
