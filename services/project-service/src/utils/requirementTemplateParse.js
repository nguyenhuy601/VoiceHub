const XLSX = require('xlsx');
const {
  SHEETS,
  SHEET_COLUMNS,
  OVERVIEW_FIELDS,
  TEMPLATE_VERSION,
} = require('../constants/requirementTemplate.constants');
const {
  parseSkillsCsv,
  parseEstimateHours,
  normalizeRoleKey,
} = require('./requirementStaffingParse');

function normalizeHeader(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isBlankRow(cells) {
  if (!Array.isArray(cells)) return true;
  return cells.every((c) => String(c ?? '').trim() === '');
}

function sheetToMatrix(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return null;
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
}

function readMetaVersion(workbook) {
  const matrix = sheetToMatrix(workbook, SHEETS.META);
  if (!matrix) return '';
  for (let i = 1; i < matrix.length; i += 1) {
    const key = String(matrix[i]?.[0] || '').trim().toLowerCase();
    if (key === 'templateversion' || key === 'template version') {
      return String(matrix[i]?.[1] || '').trim();
    }
  }
  return '';
}

function mapRowsByHeader(matrix, expectedHeaders) {
  if (!matrix?.length) return { headers: [], rows: [], indexByKey: {} };
  const headerRow = matrix[0].map((h) => String(h || '').trim());
  const normalized = headerRow.map(normalizeHeader);
  const expectedNorm = expectedHeaders.map(normalizeHeader);
  const indexByKey = {};
  expectedNorm.forEach((h, idx) => {
    const found = normalized.indexOf(h);
    if (found >= 0) indexByKey[expectedHeaders[idx]] = found;
  });
  const rows = [];
  for (let r = 1; r < matrix.length; r += 1) {
    const line = matrix[r];
    if (isBlankRow(line)) continue;
    const obj = {};
    for (const col of expectedHeaders) {
      const idx = indexByKey[col];
      obj[col] = idx == null ? '' : String(line[idx] ?? '').trim();
    }
    obj._rowNumber = r + 1;
    rows.push(obj);
  }
  return { headers: headerRow, rows, indexByKey };
}

function parseOverview(rows) {
  const overview = {};
  const byLabel = new Map(OVERVIEW_FIELDS.map((f) => [normalizeHeader(f.label), f.key]));
  for (const row of rows) {
    const fieldLabel = normalizeHeader(row.Field);
    const key = byLabel.get(fieldLabel);
    if (!key) continue;
    overview[key] = String(row.Value || '').trim();
  }
  return overview;
}

function parseScope(rows) {
  return rows.map((row) => {
    const rawType = String(row['Scope Type'] || '').trim().toLowerCase();
    const type = rawType.includes('out') ? 'out' : 'in';
    return { type, description: String(row.Description || '').trim(), _rowNumber: row._rowNumber };
  });
}

function parseFunctional(rows) {
  return rows.map((row, index) => {
    const skillsRaw = String(row['Suggested Skills'] || '').trim();
    const hoursRaw = row['Effort Hours'];
    const roleRaw = row['Suggested Role'];
    return {
      externalId: String(row.ID || '').trim(),
      level: String(row.Level || '').trim(),
      parentExternalId: String(row['Parent ID'] || '').trim(),
      name: String(row.Name || '').trim(),
      description: String(row.Description || '').trim(),
      priority: String(row.Priority || 'Medium').trim(),
      acceptanceCriteria: String(row['Acceptance Criteria'] || '').trim(),
      suggestedSkills: skillsRaw ? parseSkillsCsv(skillsRaw) : [],
      estimateHours: parseEstimateHours(hoursRaw),
      suggestedRoleKey: roleRaw ? normalizeRoleKey(roleRaw) : '',
      sortOrder: index,
      _rowNumber: row._rowNumber,
    };
  });
}

function parseTableRows(rows, mapping) {
  return rows.map((row) => {
    const out = { _rowNumber: row._rowNumber };
    for (const [target, source] of Object.entries(mapping)) {
      out[target] = String(row[source] ?? '').trim();
    }
    return out;
  });
}

function parseRequirementWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetNames = workbook.SheetNames || [];
  const templateVersion = readMetaVersion(workbook) || TEMPLATE_VERSION;

  const overviewRows = mapRowsByHeader(
    sheetToMatrix(workbook, SHEETS.OVERVIEW),
    SHEET_COLUMNS[SHEETS.OVERVIEW]
  );
  const scopeRows = mapRowsByHeader(
    sheetToMatrix(workbook, SHEETS.SCOPE),
    SHEET_COLUMNS[SHEETS.SCOPE]
  );
  const frRows = mapRowsByHeader(
    sheetToMatrix(workbook, SHEETS.FUNCTIONAL),
    SHEET_COLUMNS[SHEETS.FUNCTIONAL]
  );
  const nfrRows = mapRowsByHeader(
    sheetToMatrix(workbook, SHEETS.NFR),
    SHEET_COLUMNS[SHEETS.NFR]
  );
  const techRows = mapRowsByHeader(
    sheetToMatrix(workbook, SHEETS.TECHNOLOGY),
    SHEET_COLUMNS[SHEETS.TECHNOLOGY]
  );
  const intRows = mapRowsByHeader(
    sheetToMatrix(workbook, SHEETS.INTEGRATION),
    SHEET_COLUMNS[SHEETS.INTEGRATION]
  );
  const constraintRows = mapRowsByHeader(
    sheetToMatrix(workbook, SHEETS.CONSTRAINTS),
    SHEET_COLUMNS[SHEETS.CONSTRAINTS]
  );
  const depRows = mapRowsByHeader(
    sheetToMatrix(workbook, SHEETS.DEPENDENCIES),
    SHEET_COLUMNS[SHEETS.DEPENDENCIES]
  );
  const asmRows = mapRowsByHeader(
    sheetToMatrix(workbook, SHEETS.ASSUMPTIONS),
    SHEET_COLUMNS[SHEETS.ASSUMPTIONS]
  );

  return {
    templateVersion,
    sheetNames,
    overview: parseOverview(overviewRows.rows),
    scope: parseScope(scopeRows.rows),
    functionalRequirements: parseFunctional(frRows.rows),
    nonFunctionalRequirements: parseTableRows(nfrRows.rows, {
      externalId: 'ID',
      category: 'Category',
      requirement: 'Requirement',
      target: 'Target',
      priority: 'Priority',
    }),
    technology: parseTableRows(techRows.rows, {
      category: 'Category',
      name: 'Technology',
      version: 'Version',
      mandatoryRaw: 'Mandatory',
      note: 'Note',
    }).map((row) => ({
      ...row,
      mandatory: ['yes', 'true', '1', 'y'].includes(String(row.mandatoryRaw || '').toLowerCase()),
    })),
    integration: parseTableRows(intRows.rows, {
      system: 'System',
      integrationType: 'Integration Type',
      direction: 'Direction',
      description: 'Description',
      requiredRaw: 'Required',
    }).map((row) => ({
      system: row.system,
      integrationType: row.integrationType,
      direction: row.direction,
      description: row.description,
      required: ['yes', 'true', '1', 'y'].includes(String(row.requiredRaw || '').toLowerCase()),
    })),
    constraints: parseTableRows(constraintRows.rows, {
      type: 'Type',
      description: 'Description',
    }),
    dependencies: parseTableRows(depRows.rows, {
      externalId: 'ID',
      dependency: 'Dependency',
      type: 'Type',
      requiredDateRaw: 'Required Date',
      impact: 'Impact',
    }),
    assumptions: parseTableRows(asmRows.rows, {
      externalId: 'ID',
      assumption: 'Assumption',
      impactIfInvalid: 'Impact if Invalid',
    }),
    columnMaps: {
      overview: overviewRows.indexByKey,
      scope: scopeRows.indexByKey,
      functional: frRows.indexByKey,
      nfr: nfrRows.indexByKey,
    },
  };
}

module.exports = {
  parseRequirementWorkbook,
  sheetToMatrix,
  mapRowsByHeader,
  normalizeHeader,
};
