/**
 * One workbook FR diagnostic schema for project-service, UI, and the G4 guard.
 * Mapping failures stay on mappingDiagnostic. They are not workbook reason codes.
 */

const crypto = require('crypto');
const { normId, normProse } = require('./requirementTemplateTextNorm');

const PARSER_VERSION = 'workbook-fr-1';

const WORKBOOK_STATUS = Object.freeze(['SUCCESS', 'PARTIAL', 'NOT_READY', 'FAILED']);

const WORKBOOK_REASONS = Object.freeze([
  'SHEET_NOT_FOUND',
  'HEADER_NOT_FOUND',
  'REQUIREMENT_ROWS_EMPTY',
  'INVALID_ROWS',
  'MISSING_REQUIRED_ID',
  'DUPLICATE_ID',
  'AMBIGUOUS_SOURCE',
  'MULTIPLE_REQUIREMENT_TABLES',
  'UNSUPPORTED_WORKBOOK',
  'PARSER_ERROR',
  'SNAPSHOT_FR_MISMATCH',
]);

const MAPPING_FAILURES = Object.freeze([
  'MAPPING_EMPTY',
  'MAPPING_INCOMPLETE',
  'MAPPING_AMBIGUOUS',
  'MAPPING_INVALID',
]);

const BLOCKING_REASONS = Object.freeze([
  'SHEET_NOT_FOUND',
  'HEADER_NOT_FOUND',
  'REQUIREMENT_ROWS_EMPTY',
  'AMBIGUOUS_SOURCE',
  'UNSUPPORTED_WORKBOOK',
  'PARSER_ERROR',
  'SNAPSHOT_FR_MISMATCH',
]);

const CANONICAL_FR_KEYS = Object.freeze([
  'externalId',
  'name',
  'description',
  'moduleLabel',
  'actor',
  'acceptanceCriteria',
]);

function emptyMappingDiagnostic() {
  return {
    status: 'EMPTY',
    required: ['id', 'requirement'],
    mapped: [],
    missing: ['id', 'requirement'],
    candidates: [],
    failureReason: 'MAPPING_EMPTY',
  };
}

function emptyWorkbookDiagnostic(fileName) {
  return {
    parserVersion: PARSER_VERSION,
    status: 'NOT_READY',
    reasonCodes: [],
    workbook: {
      fileName: fileName || undefined,
      sheetsDetected: 0,
      sheetsScanned: 0,
    },
    sheetSelection: { candidates: [], selected: undefined, ambiguous: false },
    tableSelection: { candidates: [], selectedHeaderRow: undefined },
    header: { candidateRows: [], selectedRow: undefined, columnsDetected: 0 },
    mapping: {},
    mappingDiagnostic: emptyMappingDiagnostic(),
    rows: {
      rowsDetected: 0,
      frCandidates: 0,
      validFr: 0,
      invalidRows: 0,
      missingId: 0,
      duplicateFr: 0,
    },
    warnings: {
      hiddenSheets: 0,
      formulaCellsDetected: 0,
      mergedCellsDetected: 0,
      blankRowsSkipped: 0,
      tablesDetected: 0,
    },
    frSourceMap: [],
    samples: { invalidRows: [], duplicateIds: [] },
  };
}

function failedDiagnostic(code, message, fileName) {
  const diagnostic = emptyWorkbookDiagnostic(fileName);
  diagnostic.status = 'FAILED';
  diagnostic.reasonCodes = [code];
  diagnostic.mappingDiagnostic = {
    status: 'EMPTY',
    required: ['id', 'requirement'],
    mapped: [],
    missing: ['id', 'requirement'],
    candidates: [],
  };
  diagnostic.error = { code, message: String(message || code).slice(0, 300) };
  return diagnostic;
}

/**
 * Requirement is ready only from the full diagnostic, including mappingDiagnostic.
 * Mapping failures are not workbook reason codes, so reasonCodes alone is not enough.
 */
function isRequirementReady(diagnostic) {
  if (!diagnostic || typeof diagnostic !== 'object') return false;
  if (diagnostic.status !== 'SUCCESS' && diagnostic.status !== 'PARTIAL') return false;
  if (!(Number(diagnostic.rows?.validFr) > 0)) return false;
  const mapping = diagnostic.mappingDiagnostic;
  if (!mapping || mapping.status !== 'COMPLETE' || mapping.failureReason) return false;
  const reasons = Array.isArray(diagnostic.reasonCodes) ? diagnostic.reasonCodes : [];
  if (reasons.some((code) => BLOCKING_REASONS.includes(code))) return false;
  if (
    reasons.includes('MULTIPLE_REQUIREMENT_TABLES') &&
    diagnostic.tableSelection?.selectedHeaderRow == null
  ) {
    return false;
  }
  return true;
}

function textField(value) {
  return normProse(value || '');
}

/**
 * SHA-256 of persisted FR rows. level is excluded because projections do not share one type.
 */
function hashFunctionalRequirements(rows) {
  const canonical = (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const item = {};
      item.externalId = normId(row?.externalId || '');
      item.name = textField(row?.name);
      item.description = textField(row?.description);
      item.moduleLabel = textField(row?.moduleLabel);
      item.actor = textField(row?.actor);
      item.acceptanceCriteria = textField(row?.acceptanceCriteria);
      return item;
    })
    .sort((a, b) => a.externalId.localeCompare(b.externalId));
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function assertSnapshotFrAlignment(packFr, snapshot) {
  const srs = snapshot?.projected?.srs?.functionalRequirements || [];
  const left = hashFunctionalRequirements(packFr);
  const right = hashFunctionalRequirements(srs);
  const stored = snapshot?.ingestionValidation?.functionalRequirementHash;
  const storedCount = snapshot?.ingestionValidation?.functionalRequirementCount;
  const countMismatch = (Array.isArray(packFr) ? packFr.length : 0) !== srs.length;
  const storedCountMismatch = storedCount != null && Number(storedCount) !== srs.length;
  if (countMismatch || left !== right || (stored && stored !== right) || storedCountMismatch) {
    const err = new Error('Functional requirement snapshot does not match the pack');
    err.statusCode = 422;
    err.errorCode = 'SNAPSHOT_FR_MISMATCH';
    err.reasonCodes = ['SNAPSHOT_FR_MISMATCH'];
    throw err;
  }
}

function assertG4CanStart(pack, snapshot) {
  const diagnostic = pack?.aiAnalysis?.workbookDiagnostic;
  if (!isRequirementReady(diagnostic)) {
    const err = new Error('Requirement workbook is not ready for G4');
    err.statusCode = 422;
    err.errorCode = 'REQUIREMENT_NOT_READY';
    err.reasonCodes = Array.isArray(diagnostic?.reasonCodes) ? diagnostic.reasonCodes : [];
    err.mappingFailure = diagnostic?.mappingDiagnostic?.failureReason || null;
    throw err;
  }
  if (snapshot) assertSnapshotFrAlignment(pack?.functionalRequirements || [], snapshot);
}

module.exports = {
  PARSER_VERSION,
  WORKBOOK_STATUS,
  WORKBOOK_REASONS,
  MAPPING_FAILURES,
  BLOCKING_REASONS,
  CANONICAL_FR_KEYS,
  emptyWorkbookDiagnostic,
  failedDiagnostic,
  isRequirementReady,
  hashFunctionalRequirements,
  assertSnapshotFrAlignment,
  assertG4CanStart,
};
