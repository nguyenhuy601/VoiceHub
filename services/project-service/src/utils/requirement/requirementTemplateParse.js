const XLSX = require('xlsx');
const {
  SHEETS,
  SHEET_COLUMNS,
  OVERVIEW_FIELDS,
  CONTEXT_SCOPE_LABELS,
  TEMPLATE_VERSION,
} = require('../../constants/requirementTemplate.constants');
const { normalizeFunctionalRequirementsLevels } = require('./requirementFrLevel');
const { normHeader, normId, normKey, normProse, isTruthyYes } = require('./requirementTemplateTextNorm');

function normalizeHeader(raw) {
  return normHeader(raw);
}

function isBlankRow(cells) {
  if (!Array.isArray(cells)) return true;
  return cells.every((c) => !normProse(c));
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
    const key = normHeader(matrix[i]?.[0]);
    if (key === 'templateversion' || key === 'template version') {
      return normProse(matrix[i]?.[1]);
    }
  }
  return '';
}

function mapRowsByHeader(matrix, expectedHeaders) {
  if (!matrix?.length) return { headers: [], rows: [], indexByKey: {} };
  const headerRow = matrix[0].map((h) => String(h || ''));
  const normalized = headerRow.map(normalizeHeader);
  const expectedNorm = expectedHeaders.map(normalizeHeader);
  const indexByKey = {};
  expectedNorm.forEach((h, idx) => {
    const found = normalized.indexOf(h);
    if (found >= 0) indexByKey[expectedHeaders[idx]] = found;
  });
  // Also index any header present (for flexible mapping)
  normalized.forEach((h, idx) => {
    if (!h) return;
    const original = headerRow[idx];
    if (original && indexByKey[original] == null) indexByKey[original] = idx;
  });
  const rows = [];
  for (let r = 1; r < matrix.length; r += 1) {
    const line = matrix[r];
    if (isBlankRow(line)) continue;
    const obj = {};
    for (const col of expectedHeaders) {
      const idx = indexByKey[col];
      obj[col] = idx == null ? '' : String(line[idx] ?? '');
    }
    obj._rowNumber = r + 1;
    rows.push(obj);
  }
  return { headers: headerRow, rows, indexByKey };
}

/** Alias labels → overview key (Standard Format + legacy). */
const OVERVIEW_LABEL_ALIASES = Object.freeze({
  'project objective': 'projectObjective',
  'business scope': 'businessScope',
  'expected users / scale': 'expectedUsers',
  'expected users': 'expectedUsers',
  'expected scale': 'expectedScale',
  platform: 'platform',
  priority: 'priority',
  deadline: 'deadline',
  budget: 'budget',
  'special notes': 'specialNotes',
  'requirement name': 'requirementName',
  'start date': 'startDate',
  'budget currency': 'budgetCurrency',
});

function parseOverview(rows) {
  const overview = {};
  const byLabel = new Map(OVERVIEW_FIELDS.map((f) => [normalizeHeader(f.label), f.key]));
  for (const [alias, key] of Object.entries(OVERVIEW_LABEL_ALIASES)) {
    if (!byLabel.has(alias)) byLabel.set(alias, key);
  }
  for (const row of rows) {
    const fieldLabel = normalizeHeader(row.Field);
    const key = byLabel.get(fieldLabel);
    if (!key) continue;
    if (key === 'priority') {
      overview[key] = normKey(row.Value, { kind: 'priority' }) || 'Medium';
    } else {
      overview[key] = normProse(row.Value);
    }
  }
  if (!overview.requirementName && overview.projectObjective) {
    overview.requirementName = overview.projectObjective;
  }
  return overview;
}

function parseScopeFromContextRows(rows) {
  const scope = [];
  const inLabel = normalizeHeader(CONTEXT_SCOPE_LABELS.in);
  const outLabel = normalizeHeader(CONTEXT_SCOPE_LABELS.out);
  for (const row of rows) {
    const fieldLabel = normalizeHeader(row.Field);
    if (fieldLabel === inLabel) {
      scope.push({
        type: 'in',
        description: normProse(row.Value),
        _rowNumber: row._rowNumber,
      });
    } else if (fieldLabel === outLabel) {
      scope.push({
        type: 'out',
        description: normProse(row.Value),
        _rowNumber: row._rowNumber,
      });
    }
  }
  return scope;
}

function parseScope(rows) {
  return rows.map((row) => {
    const rawType = normHeader(row['Scope Type']);
    const type = rawType.includes('out') ? 'out' : 'in';
    return { type, description: normProse(row.Description), _rowNumber: row._rowNumber };
  });
}

function resolveFrName(level, row) {
  if (level === 'Module') {
    return normProse(row.Module) || normProse(row.Name) || normProse(row.Requirement);
  }
  if (level === 'Feature') {
    return (
      normProse(row.Feature) ||
      normProse(row.Requirement) ||
      normProse(row.Name) ||
      normProse(row.Module)
    );
  }
  return (
    normProse(row.Requirement) ||
    normProse(row.Name) ||
    normProse(row.Feature) ||
    normProse(row.Module)
  );
}

function parseFunctional(rows) {
  return rows.map((row, index) => {
    const level = normKey(row.Level, { kind: 'level' });
    const exceptionFlow =
      normProse(row['Alternative / Exception Flow']) || normProse(row['Exception Flow']);
    return {
      externalId: normId(row.ID),
      level,
      parentExternalId: normId(row['Parent ID']),
      moduleLabel: normProse(row.Module),
      featureLabel: normProse(row.Feature),
      name: resolveFrName(level, row),
      description: normProse(row.Description),
      actor: normProse(row.Actor),
      priority: normKey(row.Priority, { kind: 'priority' }) || 'Medium',
      acceptanceCriteria: normProse(row['Acceptance Criteria']),
      mainFlow: normProse(row['Main Flow']),
      exceptionFlow,
      businessRules: normProse(row['Business Rules']),
      trigger: normProse(row.Trigger),
      preconditions: normProse(row.Preconditions),
      input: normProse(row.Input),
      output: normProse(row.Output),
      dataEntities: normProse(row['Data / Entities']),
      frDependencies: normProse(row.Dependencies),
      constraintsNotes: normProse(row['Constraints / Notes']),
      suggestedSkills: [],
      estimateHours: null,
      suggestedRoleKey: '',
      sortOrder: index,
      _rowNumber: row._rowNumber,
    };
  });
}

function parseTableRows(rows, mapping, { idFields = [], proseFields = [] } = {}) {
  const idSet = new Set(idFields);
  const proseSet = new Set(proseFields);
  return rows.map((row) => {
    const out = { _rowNumber: row._rowNumber };
    for (const [target, source] of Object.entries(mapping)) {
      const raw = row[source] ?? '';
      if (idSet.has(target)) out[target] = normId(raw);
      else if (proseSet.has(target) || target === 'description' || target === 'requirement') {
        out[target] = normProse(raw);
      } else if (target === 'priority') {
        out[target] = normKey(raw, { kind: 'priority' }) || normProse(raw);
      } else {
        out[target] = normProse(raw);
      }
    }
    return out;
  });
}

function countAiOutputRows(workbook) {
  const matrix = sheetToMatrix(workbook, SHEETS.AI_OUTPUT);
  if (!matrix || matrix.length < 2) return 0;
  let n = 0;
  for (let r = 1; r < matrix.length; r += 1) {
    if (!isBlankRow(matrix[r])) n += 1;
  }
  return n;
}

function parseRequirementWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetNames = workbook.SheetNames || [];
  const templateVersion = readMetaVersion(workbook) || TEMPLATE_VERSION;

  const contextMatrix =
    sheetToMatrix(workbook, SHEETS.CONTEXT) || sheetToMatrix(workbook, '01_Project_Overview');
  const overviewRows = mapRowsByHeader(contextMatrix, SHEET_COLUMNS[SHEETS.CONTEXT]);

  const scopeMatrix = sheetToMatrix(workbook, SHEETS.SCOPE);
  const scopeRows = mapRowsByHeader(scopeMatrix, SHEET_COLUMNS[SHEETS.SCOPE] || []);
  const scopeFromLegacy = parseScope(scopeRows.rows);
  const scopeFromContext = parseScopeFromContextRows(overviewRows.rows);
  const scope = scopeFromLegacy.length ? scopeFromLegacy : scopeFromContext;

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
  const metaRows = mapRowsByHeader(
    sheetToMatrix(workbook, SHEETS.METADATA),
    SHEET_COLUMNS[SHEETS.METADATA]
  );

  const aiOutputRowCount = countAiOutputRows(workbook);

  const technology = parseTableRows(techRows.rows, {
    category: 'Category',
    name: 'Technology',
    version: 'Version',
    mandatoryRaw: 'Mandatory',
    note: 'Purpose / Note',
    noteAlt: 'Note',
  }).map((row) => ({
    category: String(row.category || '').slice(0, 128),
    name: row.name,
    version: row.version,
    mandatory: isTruthyYes(row.mandatoryRaw),
    note: row.note || row.noteAlt || '',
    _rowNumber: row._rowNumber,
  }));

  return {
    templateVersion,
    sheetNames,
    overview: parseOverview(overviewRows.rows),
    scope,
    functionalRequirements: normalizeFunctionalRequirementsLevels(parseFunctional(frRows.rows), {
      templateVersion,
    }),
    nonFunctionalRequirements: parseTableRows(
      nfrRows.rows,
      {
        externalId: 'ID',
        category: 'Category',
        requirement: 'Requirement',
        target: 'Target',
        priority: 'Priority',
        verification: 'Verification / Acceptance',
      },
      { idFields: ['externalId'], proseFields: ['requirement', 'target', 'category', 'verification'] }
    ).map((row) => ({
      ...row,
      category: String(row.category || '').slice(0, 64),
    })),
    technology,
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
      required: isTruthyYes(row.requiredRaw),
      _rowNumber: row._rowNumber,
    })),
    constraints: parseTableRows(constraintRows.rows, {
      externalId: 'ID',
      type: 'Type',
      description: 'Description',
      priority: 'Priority',
    }),
    dependencies: parseTableRows(
      depRows.rows,
      {
        externalId: 'ID',
        dependency: 'Dependency',
        type: 'Type',
        description: 'Description',
        requiredDateRaw: 'Required Date',
        impact: 'Impact if Unavailable',
        impactAlt: 'Impact',
        requiredRaw: 'Required',
      },
      { idFields: ['externalId'] }
    ).map((row) => ({
      externalId: row.externalId,
      dependency: row.dependency,
      type: row.type,
      description: row.description,
      requiredDateRaw: row.requiredDateRaw,
      impact: row.impact || row.impactAlt || '',
      required: isTruthyYes(row.requiredRaw),
      _rowNumber: row._rowNumber,
    })),
    assumptions: parseTableRows(
      asmRows.rows,
      {
        externalId: 'ID',
        assumption: 'Assumption',
        impactIfInvalid: 'Impact if Invalid',
        rationale: 'Rationale / Context',
        validationStatus: 'Validation Status',
      },
      { idFields: ['externalId'] }
    ).map((row) => ({
      externalId: row.externalId,
      assumption: row.assumption,
      impactIfInvalid: row.impactIfInvalid || row.validationStatus || '',
      rationale: row.rationale || '',
      _rowNumber: row._rowNumber,
    })),
    requirementMetadata: parseTableRows(
      metaRows.rows,
      {
        requirementId: 'Requirement ID',
        field: 'Field',
        value: 'Value',
        businessPriorityRationale: 'Business Priority Rationale',
        knownComplexityHint: 'Known Complexity Hint',
        dataSensitivity: 'Data Sensitivity',
        expectedFrequency: 'Expected Frequency / Volume',
        openQuestion: 'Open Question',
        sourceReference: 'Source / Reference',
      },
      { idFields: ['requirementId'], proseFields: ['field', 'value'] }
    ),
    aiOutputRowCount,
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
  parseOverview,
  parseScopeFromContextRows,
};

