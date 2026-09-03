const {
  SHEETS,
  OVERVIEW_FIELDS,
  SHEET_COLUMNS,
} = require('../constants/requirementTemplate.constants');
const { buildFunctionalPreviewTree } = require('./requirementTemplateValidate');
const { MAX_PREVIEW_ROWS } = require('./requirementExcelPreview');
const { isFrExecutionLeafLevel } = require('./requirementFrLevel');
const { rollupFrEstimateHours } = require('./requirementStaffingRollup');

function cell(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function matrixToSheet(name, matrix) {
  const truncated = matrix.length > MAX_PREVIEW_ROWS;
  const slice = truncated ? matrix.slice(0, MAX_PREVIEW_ROWS) : matrix;
  const colCount = slice.reduce((max, line) => Math.max(max, Array.isArray(line) ? line.length : 0), 0);
  const rows = slice.map((line, idx) => ({
    rowNumber: idx + 1,
    cells: Array.from({ length: colCount }, (_, c) => cell(Array.isArray(line) ? line[c] : '')),
  }));
  return {
    name,
    rowCount: rows.length,
    colCount,
    truncated,
    rows,
  };
}

function formatDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return cell(value);
  return d.toISOString().slice(0, 10);
}

function buildOverviewMatrix(overview = {}) {
  const header = SHEET_COLUMNS[SHEETS.OVERVIEW];
  const rows = [header];
  for (const field of OVERVIEW_FIELDS) {
    let value = overview[field.key];
    if (field.key === 'deadline' || field.key === 'startDate') {
      value = formatDate(value);
    } else if (field.key === 'platform') {
      value = Array.isArray(value) ? value.join(', ') : value;
    }
    rows.push([field.label, field.required ? 'Yes' : 'No', cell(value)]);
  }
  return rows;
}

function buildScopeMatrix(scope = []) {
  const header = SHEET_COLUMNS[SHEETS.SCOPE];
  const rows = [header];
  for (const row of scope) {
    const type = row.type === 'out' ? 'Out of Scope' : 'In Scope';
    rows.push([type, cell(row.description)]);
  }
  return rows;
}

function buildFunctionalMatrix(functionalRequirements = []) {
  const header = SHEET_COLUMNS[SHEETS.FUNCTIONAL];
  const rows = [header];
  const sorted = [...functionalRequirements].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const hoursById = rollupFrEstimateHours(sorted);
  for (const fr of sorted) {
    const externalId = String(fr.externalId || '').trim();
    const displayHours =
      !isFrExecutionLeafLevel(fr.level) && externalId && hoursById.has(externalId)
        ? hoursById.get(externalId)
        : fr.estimateHours;
    rows.push([
      cell(fr.externalId),
      cell(fr.level),
      cell(fr.parentExternalId),
      cell(fr.name),
      cell(fr.description),
      cell(fr.priority),
      cell(fr.acceptanceCriteria),
      Array.isArray(fr.suggestedSkills) ? fr.suggestedSkills.join(';') : '',
      displayHours != null ? cell(displayHours) : '',
      cell(fr.suggestedRoleKey),
    ]);
  }
  return rows;
}

function buildNfrMatrix(nfrs = []) {
  const header = SHEET_COLUMNS[SHEETS.NFR];
  const rows = [header];
  for (const nfr of nfrs) {
    rows.push([
      cell(nfr.externalId),
      cell(nfr.category),
      cell(nfr.requirement),
      cell(nfr.target),
      cell(nfr.priority),
    ]);
  }
  return rows;
}

function buildTechnologyMatrix(rowsIn = []) {
  const header = SHEET_COLUMNS[SHEETS.TECHNOLOGY];
  const rows = [header];
  for (const row of rowsIn) {
    rows.push([
      cell(row.category),
      cell(row.name),
      cell(row.version),
      row.mandatory ? 'Yes' : 'No',
      cell(row.note),
    ]);
  }
  return rows;
}

function buildIntegrationMatrix(rowsIn = []) {
  const header = SHEET_COLUMNS[SHEETS.INTEGRATION];
  const rows = [header];
  for (const row of rowsIn) {
    rows.push([
      cell(row.system),
      cell(row.integrationType),
      cell(row.direction),
      cell(row.description),
      row.required === false ? 'No' : 'Yes',
    ]);
  }
  return rows;
}

function buildConstraintsMatrix(rowsIn = []) {
  const header = SHEET_COLUMNS[SHEETS.CONSTRAINTS];
  const rows = [header];
  for (const row of rowsIn) {
    rows.push([cell(row.type), cell(row.description)]);
  }
  return rows;
}

function buildDependenciesMatrix(rowsIn = []) {
  const header = SHEET_COLUMNS[SHEETS.DEPENDENCIES];
  const rows = [header];
  for (const row of rowsIn) {
    rows.push([
      cell(row.externalId),
      cell(row.dependency),
      cell(row.type),
      formatDate(row.requiredDate),
      cell(row.impact),
    ]);
  }
  return rows;
}

function buildAssumptionsMatrix(rowsIn = []) {
  const header = SHEET_COLUMNS[SHEETS.ASSUMPTIONS];
  const rows = [header];
  for (const row of rowsIn) {
    rows.push([cell(row.externalId), cell(row.assumption), cell(row.impactIfInvalid)]);
  }
  return rows;
}

function hasDataRows(matrix) {
  return Array.isArray(matrix) && matrix.length > 1;
}

/**
 * Build synthetic excelPreview snapshot from persisted pack fields (legacy packs).
 */
function buildSyntheticExcelPreviewFromPack(pack = {}) {
  const sheets = [];
  const overviewMatrix = buildOverviewMatrix(pack.overview || {});
  sheets.push(matrixToSheet(SHEETS.OVERVIEW, overviewMatrix));

  const scopeMatrix = buildScopeMatrix(pack.scope || []);
  if (hasDataRows(scopeMatrix)) sheets.push(matrixToSheet(SHEETS.SCOPE, scopeMatrix));

  const frMatrix = buildFunctionalMatrix(pack.functionalRequirements || []);
  if (hasDataRows(frMatrix)) sheets.push(matrixToSheet(SHEETS.FUNCTIONAL, frMatrix));

  const nfrMatrix = buildNfrMatrix(pack.nonFunctionalRequirements || []);
  if (hasDataRows(nfrMatrix)) sheets.push(matrixToSheet(SHEETS.NFR, nfrMatrix));

  const techMatrix = buildTechnologyMatrix(pack.technology || []);
  if (hasDataRows(techMatrix)) sheets.push(matrixToSheet(SHEETS.TECHNOLOGY, techMatrix));

  const intMatrix = buildIntegrationMatrix(pack.integration || []);
  if (hasDataRows(intMatrix)) sheets.push(matrixToSheet(SHEETS.INTEGRATION, intMatrix));

  const constraintMatrix = buildConstraintsMatrix(pack.constraints || []);
  if (hasDataRows(constraintMatrix)) sheets.push(matrixToSheet(SHEETS.CONSTRAINTS, constraintMatrix));

  const depMatrix = buildDependenciesMatrix(pack.dependencies || []);
  if (hasDataRows(depMatrix)) sheets.push(matrixToSheet(SHEETS.DEPENDENCIES, depMatrix));

  const asmMatrix = buildAssumptionsMatrix(pack.assumptions || []);
  if (hasDataRows(asmMatrix)) sheets.push(matrixToSheet(SHEETS.ASSUMPTIONS, asmMatrix));

  const totalRows = sheets.reduce((sum, s) => sum + (s.rowCount || 0), 0);
  return {
    fileName: String(pack.sourceFileName || pack.overview?.requirementName || '').slice(0, 255),
    sheetCount: sheets.length,
    totalRows,
    derivedFromPack: true,
    sheets,
  };
}

function needsPreviewTree(pack) {
  return !Array.isArray(pack?.previewTree) || pack.previewTree.length === 0;
}

function needsExcelPreview(pack) {
  const ep = pack?.excelPreview;
  if (!ep || typeof ep !== 'object') return true;
  return !Array.isArray(ep.sheets) || ep.sheets.length === 0;
}

/**
 * In-memory enrich pack for review UI. Does not mutate Mongo.
 */
function ensurePackPreviewViews(pack) {
  if (!pack || typeof pack !== 'object') return pack;
  const next = { ...pack };

  if (needsPreviewTree(next)) {
    next.previewTree = buildFunctionalPreviewTree(next.functionalRequirements || []);
  }

  if (needsExcelPreview(next)) {
    next.excelPreview = buildSyntheticExcelPreviewFromPack(next);
  }

  if ((next.functionalRequirements || []).length) {
    const { buildPackPlanningPreview } = require('./requirementPackPlanningPreview');
    next.planningPreview = buildPackPlanningPreview(next);
    if (next.planningPreview?.excelPreview) {
      next.excelPreview = next.planningPreview.excelPreview;
    }
  }

  return next;
}

module.exports = {
  ensurePackPreviewViews,
  buildSyntheticExcelPreviewFromPack,
  needsPreviewTree,
  needsExcelPreview,
};
