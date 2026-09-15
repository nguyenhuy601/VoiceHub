/**
 * Parse Requirement_Analysis.xlsx (TemplateType=RequirementAnalysis).
 */

const XLSX = require('xlsx');
const {
  ANALYSIS_TEMPLATE_TYPE,
  ANALYSIS_TEMPLATE_VERSION,
  ANALYSIS_SHEETS,
  ANALYSIS_SHEET_COLUMNS,
  ANALYSIS_FR_LEVELS,
} = require('../../constants/requirementAnalysisTemplate.constants');
const {
  normHeader,
  normId,
  normKey,
  normProse,
} = require('./requirementTemplateTextNorm');

const FR_LEVEL_MAP = Object.freeze({
  module: 'Module',
  capability: 'Capability',
  feature: 'Feature',
  requirement: 'Requirement',
});

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

function readMeta(workbook) {
  const matrix = sheetToMatrix(workbook, ANALYSIS_SHEETS.META);
  const meta = { templateType: '', templateVersion: '' };
  if (!matrix) return meta;
  for (let i = 1; i < matrix.length; i += 1) {
    const key = normalizeHeader(matrix[i]?.[0]);
    const value = normProse(matrix[i]?.[1]);
    if (key === 'templatetype' || key === 'template type') meta.templateType = value;
    if (key === 'templateversion' || key === 'template version') meta.templateVersion = value;
  }
  return meta;
}

function mapRowsByHeader(matrix, expectedHeaders) {
  if (!matrix?.length) return { headers: [], rows: [], indexByKey: {}, present: false };
  const headerRow = matrix[0].map((h) => String(h || ''));
  const normalized = headerRow.map(normalizeHeader);
  const indexByKey = {};
  expectedHeaders.forEach((col) => {
    const found = normalized.indexOf(normalizeHeader(col));
    if (found >= 0) indexByKey[col] = found;
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
  return { headers: headerRow, rows, indexByKey, present: true };
}

function splitIds(raw) {
  return String(raw || '')
    .split(/[,;|/]+/)
    .map((s) => normId(s.trim()) || normProse(s.trim()))
    .filter(Boolean);
}

function normalizeAnalysisFrLevel(raw) {
  const token = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  return FR_LEVEL_MAP[token] || normKey(raw, { kind: 'level' }) || String(raw || '').trim();
}

function resolveFrName(level, row) {
  if (level === 'Module') {
    return normProse(row.Module) || normProse(row.Requirement);
  }
  if (level === 'Capability') {
    return normProse(row.Capability) || normProse(row.Module) || normProse(row.Requirement);
  }
  if (level === 'Feature') {
    return normProse(row.Feature) || normProse(row.Requirement) || normProse(row.Capability);
  }
  return (
    normProse(row.Requirement) ||
    normProse(row.Feature) ||
    normProse(row.Capability) ||
    normProse(row.Module)
  );
}

function parseAnalysisWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetNames = workbook.SheetNames || [];
  const meta = readMeta(workbook);
  const templateVersion = meta.templateVersion || ANALYSIS_TEMPLATE_VERSION;
  const templateType = meta.templateType || ANALYSIS_TEMPLATE_TYPE;

  const mapSheet = (sheetKey) =>
    mapRowsByHeader(sheetToMatrix(workbook, sheetKey), ANALYSIS_SHEET_COLUMNS[sheetKey] || []);

  const trace = mapSheet(ANALYSIS_SHEETS.TRACEABILITY);
  const bg = mapSheet(ANALYSIS_SHEETS.BG);
  const br = mapSheet(ANALYSIS_SHEETS.BR);
  const bpm = mapSheet(ANALYSIS_SHEETS.BPM);
  const fr = mapSheet(ANALYSIS_SHEETS.FR);
  const uc = mapSheet(ANALYSIS_SHEETS.UC);
  const nfr = mapSheet(ANALYSIS_SHEETS.NFR);

  const traceabilityLinks = trace.rows.map((row) => ({
    analysisId: normId(row['Analysis ID']),
    analysisType: String(row['Analysis Type'] || '')
      .trim()
      .toUpperCase(),
    customerRequirementId: normId(row['Customer Requirement ID']),
    sourceReference: normProse(row['Source Reference']),
    relationship: normProse(row.Relationship),
    analysisStatus: normProse(row['Analysis Status']),
    baNote: normProse(row['BA Note']),
    _rowNumber: row._rowNumber,
  }));

  const businessGoals = bg.rows.map((row) => ({
    externalId: normId(row['BG ID']),
    title: normProse(row.Goal),
    statement: normProse(row.Goal),
    businessProblem: normProse(row['Business Problem']),
    expectedBusinessOutcome: normProse(row['Expected Business Outcome']),
    successMetric: normProse(row['Success Criteria']),
    priority: normKey(row.Priority, { kind: 'priority' }) || 'Medium',
    stakeholder: normProse(row.Stakeholder),
    assumption: normProse(row.Assumption),
    constraint: normProse(row.Constraint),
    status: normProse(row.Status) || 'Draft',
    baNote: normProse(row['BA Note']),
    customerRequirementIds: splitIds(row['Customer Requirement IDs']),
    _rowNumber: row._rowNumber,
  }));

  const businessRules = br.rows.map((row) => ({
    externalId: normId(row['BR ID']),
    relatedBg: normId(row['BG ID']),
    title: normProse(row['Business Requirement']).slice(0, 240),
    description: normProse(row['Business Requirement']),
    businessRule: normProse(row['Business Rule']),
    whenApplies: '',
    exception: '',
    stakeholder: normProse(row.Stakeholder),
    priority: normKey(row.Priority, { kind: 'priority' }) || 'Medium',
    successCriteria: normProse(row['Success Criteria']),
    dependency: normProse(row.Dependency),
    assumption: normProse(row.Assumption),
    constraint: normProse(row.Constraint),
    status: normProse(row.Status) || 'Draft',
    baNote: normProse(row['BA Note']),
    customerRequirementIds: splitIds(row['Customer Requirement IDs']),
    _rowNumber: row._rowNumber,
  }));

  const businessProcesses = bpm.rows.map((row) => ({
    externalId: normId(row['BPM ID']),
    relatedBr: normId(row['BR ID']),
    processName: normProse(row['Process Name']),
    processDescription: normProse(row['Process Description']),
    trigger: normProse(row.Trigger),
    actor: normProse(row['Actor / Role']),
    precondition: normProse(row.Precondition),
    step: normProse(row['Step No']),
    action: normProse(row['Process Step']),
    input: normProse(row.Input),
    output: normProse(row.Output),
    businessRule: normProse(row['Business Rule']),
    exception: normProse(row.Exception),
    relatedCr: normProse(row['Related CR']),
    relatedSystems: '',
    status: normProse(row.Status) || 'Draft',
    baNote: normProse(row['BA Note']),
    _rowNumber: row._rowNumber,
  }));

  const functionalRequirements = fr.rows.map((row, index) => {
    const level = normalizeAnalysisFrLevel(row.Level);
    return {
      externalId: normId(row['FR ID']),
      level,
      parentExternalId: normId(row['Parent ID']),
      moduleLabel: normProse(row.Module),
      capabilityLabel: normProse(row.Capability),
      featureLabel: normProse(row.Feature),
      name: resolveFrName(level, row),
      description: normProse(row.Requirement) || normProse(row['Main Behavior']),
      requirementText: normProse(row.Requirement),
      actor: normProse(row.Actor),
      trigger: normProse(row.Trigger),
      preconditions: normProse(row.Precondition),
      mainFlow: normProse(row['Main Behavior']),
      businessRules: normProse(row['Business Rule']),
      input: normProse(row.Input),
      output: normProse(row.Output),
      exceptionFlow: normProse(row.Exception),
      acceptanceCriteria: normProse(row['Acceptance Criteria']),
      priority: normKey(row.Priority, { kind: 'priority' }) || 'Medium',
      frDependencies: normProse(row.Dependency),
      assumption: normProse(row.Assumption),
      constraintsNotes: normProse(row.Constraint),
      status: normProse(row.Status) || 'Draft',
      baNote: normProse(row['BA Note']),
      customerRequirementIds: splitIds(row['Customer Requirement IDs']),
      brIds: splitIds(row['BR IDs']),
      bpmIds: splitIds(row['BPM IDs']),
      suggestedSkills: [],
      estimateHours: null,
      suggestedRoleKey: '',
      sortOrder: index,
      _rowNumber: row._rowNumber,
    };
  });

  const useCases = uc.rows.map((row) => ({
    externalId: normId(row['UC ID']),
    title: normProse(row['Use Case Name']),
    goal: normProse(row.Goal),
    actor: normProse(row['Primary Actor']),
    secondaryActor: normProse(row['Secondary Actor']),
    trigger: normProse(row.Trigger),
    precondition: normProse(row.Preconditions),
    postconditions: normProse(row.Postconditions),
    mainFlow: normProse(row['Main Flow']),
    alternativeFlow: normProse(row['Alternative Flow']),
    exceptionFlow: normProse(row['Exception Flow']),
    businessRules: normProse(row['Business Rules']),
    input: normProse(row.Input),
    output: normProse(row.Output),
    relatedFr: splitIds(row['FR IDs']).join(';'),
    relatedFrIds: splitIds(row['FR IDs']),
    brIds: splitIds(row['BR IDs']),
    customerRequirementIds: splitIds(row['Customer Requirement IDs']),
    priority: normKey(row.Priority, { kind: 'priority' }) || 'Medium',
    status: normProse(row.Status) || 'Draft',
    baNote: normProse(row['BA Note']),
    _rowNumber: row._rowNumber,
  }));

  const nonFunctionalRequirements = nfr.rows.map((row) => ({
    externalId: normId(row['NFR ID']),
    category: normProse(row.Category),
    requirement: normProse(row.Requirement),
    target: normProse(row.Target),
    measurement: normProse(row.Measurement),
    priority: normKey(row.Priority, { kind: 'priority' }) || 'Medium',
    scope: normProse(row.Scope),
    constraint: normProse(row.Constraint),
    acceptanceCriteria: normProse(row['Acceptance Criteria']),
    source: normProse(row.Source),
    status: normProse(row.Status) || 'Draft',
    baNote: normProse(row['BA Note']),
    customerRequirementIds: splitIds(row['Customer Requirement IDs']),
    verification: normProse(row['Acceptance Criteria']),
    _rowNumber: row._rowNumber,
  }));

  const firstBg = businessGoals[0] || {};
  const overview = {
    requirementName: firstBg.title || 'Requirement Analysis',
    projectObjective: firstBg.statement || firstBg.title || 'Requirement Analysis import',
    businessScope: firstBg.businessProblem || firstBg.expectedBusinessOutcome || '',
    expectedUsers: firstBg.stakeholder || 'TBD',
    expectedScale: '',
    platform: 'Web',
    priority: firstBg.priority || 'Medium',
    deadline: '',
    budget: '',
    specialNotes: 'Imported from Requirement_Analysis.xlsx (BA workbook)',
  };

  return {
    isRequirementAnalysis: true,
    templateType,
    templateVersion,
    sheetNames,
    overview,
    scope: [],
    functionalRequirements,
    nonFunctionalRequirements,
    technology: [],
    integration: [],
    constraints: [],
    dependencies: [],
    assumptions: [],
    requirementMetadata: [],
    businessGoals,
    businessRules,
    businessProcesses,
    useCases,
    traceabilityLinks,
    aiOutputRowCount: 0,
    columnMaps: {
      traceability: trace.indexByKey,
      bg: bg.indexByKey,
      br: br.indexByKey,
      bpm: bpm.indexByKey,
      functional: fr.indexByKey,
      uc: uc.indexByKey,
      nfr: nfr.indexByKey,
    },
    sheetPresent: {
      traceability: trace.present || sheetNames.includes(ANALYSIS_SHEETS.TRACEABILITY),
      bg: bg.present || sheetNames.includes(ANALYSIS_SHEETS.BG),
      br: br.present || sheetNames.includes(ANALYSIS_SHEETS.BR),
      bpm: bpm.present || sheetNames.includes(ANALYSIS_SHEETS.BPM),
      fr: fr.present || sheetNames.includes(ANALYSIS_SHEETS.FR),
      uc: uc.present || sheetNames.includes(ANALYSIS_SHEETS.UC),
      nfr: nfr.present || sheetNames.includes(ANALYSIS_SHEETS.NFR),
    },
    analysisFrLevels: ANALYSIS_FR_LEVELS,
  };
}

function isAnalysisTemplateType(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '') === 'requirementanalysis';
}

function peekWorkbookTemplateType(buffer) {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    return readMeta(workbook).templateType;
  } catch {
    return '';
  }
}

module.exports = {
  parseAnalysisWorkbook,
  isAnalysisTemplateType,
  peekWorkbookTemplateType,
  readMeta,
  sheetToMatrix,
  mapRowsByHeader,
  normalizeAnalysisFrLevel,
  splitIds,
};
