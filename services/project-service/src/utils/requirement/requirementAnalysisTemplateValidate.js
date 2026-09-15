/**
 * Validate Requirement_Analysis.xlsx (BA WHAT) — separate from SRS.xlsx Standard validate.
 */

const {
  ANALYSIS_TEMPLATE_VERSION,
  ANALYSIS_SHEETS,
  ANALYSIS_REQUIRED_SHEETS,
  ANALYSIS_SHEET_REQUIRED_COLUMNS,
  ANALYSIS_FR_LEVELS,
  ANALYSIS_FR_VALID_PARENT_LEVELS,
  ANALYSIS_TRACE_RELATIONSHIPS,
  ANALYSIS_TYPES,
  ANALYSIS_PRIORITIES,
  MAX_FILE_BYTES = 5 * 1024 * 1024,
} = (() => {
  const c = require('../../constants/requirementAnalysisTemplate.constants');
  return { ...c, MAX_FILE_BYTES: 5 * 1024 * 1024 };
})();
const { normalizeAnalysisFrLevel } = require('./requirementAnalysisTemplateParse');
const { normId } = require('./requirementTemplateTextNorm');

function issue({ code, sheet = '', row = null, column = '', message, severity = 'error' }) {
  return { code, sheet, row, column, message, severity };
}

function validateAnalysisWorkbook({ fileName, fileSize, parsed }) {
  const issues = [];
  const name = String(fileName || '').toLowerCase();
  if (!name.endsWith('.xlsx')) {
    issues.push(issue({ code: 'RA_FILE_INVALID_EXT', message: 'Chỉ chấp nhận file .xlsx' }));
  }
  if (Number(fileSize) > MAX_FILE_BYTES) {
    issues.push(issue({ code: 'RA_FILE_TOO_LARGE', message: 'File vượt quá 5MB' }));
  }

  const version = String(parsed?.templateVersion || '').trim();
  if (version && version !== ANALYSIS_TEMPLATE_VERSION && !/^2\.\d+-analysis$/i.test(version)) {
    issues.push(
      issue({
        code: 'RA_TEMPLATE_VERSION_MISMATCH',
        sheet: ANALYSIS_SHEETS.META,
        message: `Expected TemplateVersion ${ANALYSIS_TEMPLATE_VERSION} (or 2.x-analysis). Uploaded: ${version}`,
      })
    );
  }

  const present = new Set(parsed?.sheetNames || []);
  for (const sheet of ANALYSIS_REQUIRED_SHEETS) {
    if (!present.has(sheet)) {
      issues.push(
        issue({
          code: 'RA_SHEET_MISSING',
          sheet,
          message: `Missing sheet: ${sheet}`,
        })
      );
    }
  }

  const columnMaps = parsed?.columnMaps || {};
  const sheetKeyByName = {
    [ANALYSIS_SHEETS.TRACEABILITY]: 'traceability',
    [ANALYSIS_SHEETS.BG]: 'bg',
    [ANALYSIS_SHEETS.BR]: 'br',
    [ANALYSIS_SHEETS.BPM]: 'bpm',
    [ANALYSIS_SHEETS.FR]: 'functional',
    [ANALYSIS_SHEETS.UC]: 'uc',
    [ANALYSIS_SHEETS.NFR]: 'nfr',
  };

  for (const sheet of Object.keys(ANALYSIS_SHEET_REQUIRED_COLUMNS)) {
    if (!present.has(sheet)) continue;
    const map = columnMaps[sheetKeyByName[sheet]] || {};
    for (const col of ANALYSIS_SHEET_REQUIRED_COLUMNS[sheet]) {
      if (map[col] == null) {
        issues.push(
          issue({
            code: 'RA_COLUMN_MISSING',
            sheet,
            column: col,
            message: `Missing column: ${col}`,
          })
        );
      }
    }
  }

  const frList = Array.isArray(parsed?.functionalRequirements) ? parsed.functionalRequirements : [];
  const frById = new Map();
  for (const row of frList) {
    const id = String(row.externalId || '').trim();
    if (!id) {
      issues.push(
        issue({
          code: 'RA_FR_ID_MISSING',
          sheet: ANALYSIS_SHEETS.FR,
          row: row._rowNumber,
          column: 'FR ID',
          message: 'FR ID is required',
        })
      );
      continue;
    }
    if (frById.has(id)) {
      issues.push(
        issue({
          code: 'RA_FR_ID_DUPLICATE',
          sheet: ANALYSIS_SHEETS.FR,
          row: row._rowNumber,
          column: 'FR ID',
          message: `Duplicate FR ID: ${id}`,
        })
      );
    }
    frById.set(id, row);

    const level = normalizeAnalysisFrLevel(row.level);
    if (!ANALYSIS_FR_LEVELS.includes(level)) {
      issues.push(
        issue({
          code: 'RA_FR_LEVEL_INVALID',
          sheet: ANALYSIS_SHEETS.FR,
          row: row._rowNumber,
          column: 'Level',
          message: `Invalid Level: ${row.level}. Expected Module|Capability|Feature|Requirement`,
        })
      );
    }

    if (level === 'Requirement' && !String(row.requirementText || row.description || '').trim()) {
      issues.push(
        issue({
          code: 'RA_FR_REQUIREMENT_EMPTY',
          sheet: ANALYSIS_SHEETS.FR,
          row: row._rowNumber,
          column: 'Requirement',
          message: 'Requirement text is required for Level=Requirement',
        })
      );
    }

    const pri = String(row.priority || '').trim();
    if (pri && !ANALYSIS_PRIORITIES.includes(pri)) {
      issues.push(
        issue({
          code: 'RA_FR_PRIORITY_INVALID',
          sheet: ANALYSIS_SHEETS.FR,
          row: row._rowNumber,
          column: 'Priority',
          message: `Invalid Priority: ${pri}`,
          severity: 'warning',
        })
      );
    }
  }

  for (const row of frList) {
    const level = normalizeAnalysisFrLevel(row.level);
    if (!ANALYSIS_FR_LEVELS.includes(level)) continue;
    const parentId = String(row.parentExternalId || '').trim();
    const allowedParents = ANALYSIS_FR_VALID_PARENT_LEVELS[level] || [];
    if (level === 'Module' && parentId) {
      issues.push(
        issue({
          code: 'RA_FR_PARENT_INVALID',
          sheet: ANALYSIS_SHEETS.FR,
          row: row._rowNumber,
          column: 'Parent ID',
          message: 'Module must not have Parent ID',
        })
      );
      continue;
    }
    if (level !== 'Module' && !parentId) {
      issues.push(
        issue({
          code: 'RA_FR_PARENT_REQUIRED',
          sheet: ANALYSIS_SHEETS.FR,
          row: row._rowNumber,
          column: 'Parent ID',
          message: `${level} requires Parent ID`,
        })
      );
      continue;
    }
    if (!parentId) continue;
    const parent = frById.get(parentId);
    if (!parent) {
      issues.push(
        issue({
          code: 'RA_FR_PARENT_MISSING',
          sheet: ANALYSIS_SHEETS.FR,
          row: row._rowNumber,
          column: 'Parent ID',
          message: `Parent ID not found: ${parentId}`,
        })
      );
      continue;
    }
    const parentLevel = normalizeAnalysisFrLevel(parent.level);
    if (allowedParents.length && !allowedParents.includes(parentLevel)) {
      issues.push(
        issue({
          code: 'RA_FR_PARENT_LEVEL',
          sheet: ANALYSIS_SHEETS.FR,
          row: row._rowNumber,
          column: 'Parent ID',
          message: `${level} parent must be ${allowedParents.join(' or ')} (got ${parentLevel})`,
        })
      );
    }
  }

  const nfrList = Array.isArray(parsed?.nonFunctionalRequirements)
    ? parsed.nonFunctionalRequirements
    : [];
  for (const row of nfrList) {
    if (!String(row.externalId || '').trim()) {
      issues.push(
        issue({
          code: 'RA_NFR_ID_MISSING',
          sheet: ANALYSIS_SHEETS.NFR,
          row: row._rowNumber,
          column: 'NFR ID',
          message: 'NFR ID is required',
        })
      );
    }
    if (!String(row.requirement || '').trim()) {
      issues.push(
        issue({
          code: 'RA_NFR_REQUIREMENT_EMPTY',
          sheet: ANALYSIS_SHEETS.NFR,
          row: row._rowNumber,
          column: 'Requirement',
          message: 'NFR Requirement is required',
        })
      );
    }
    if (String(row.target || '').trim() && !String(row.source || '').trim()) {
      issues.push(
        issue({
          code: 'RA_NFR_TARGET_NO_SOURCE',
          sheet: ANALYSIS_SHEETS.NFR,
          row: row._rowNumber,
          column: 'Source',
          message: 'NFR Target is set but Source is empty — do not invent targets',
          severity: 'warning',
        })
      );
    }
  }

  const artifactIds = new Set([
    ...frList.map((r) => r.externalId),
    ...(parsed?.businessGoals || []).map((r) => r.externalId),
    ...(parsed?.businessRules || []).map((r) => r.externalId),
    ...(parsed?.businessProcesses || []).map((r) => r.externalId),
    ...(parsed?.useCases || []).map((r) => r.externalId),
    ...nfrList.map((r) => r.externalId),
  ].filter(Boolean));

  const links = Array.isArray(parsed?.traceabilityLinks) ? parsed.traceabilityLinks : [];
  if (present.has(ANALYSIS_SHEETS.TRACEABILITY) && links.length === 0 && frList.length > 0) {
    issues.push(
      issue({
        code: 'RA_TRACE_EMPTY',
        sheet: ANALYSIS_SHEETS.TRACEABILITY,
        message: 'Traceability sheet has no data rows — map Analysis IDs to Customer Requirement IDs',
        severity: 'warning',
      })
    );
  }

  for (const row of links) {
    const analysisId = String(row.analysisId || '').trim();
    const crId = String(row.customerRequirementId || '').trim();
    const type = String(row.analysisType || '').trim().toUpperCase();
    if (!analysisId) {
      issues.push(
        issue({
          code: 'RA_TRACE_ID_MISSING',
          sheet: ANALYSIS_SHEETS.TRACEABILITY,
          row: row._rowNumber,
          column: 'Analysis ID',
          message: 'Analysis ID is required',
        })
      );
    } else if (!artifactIds.has(analysisId) && !artifactIds.has(normId(analysisId))) {
      issues.push(
        issue({
          code: 'RA_TRACE_ID_UNKNOWN',
          sheet: ANALYSIS_SHEETS.TRACEABILITY,
          row: row._rowNumber,
          column: 'Analysis ID',
          message: `Analysis ID ${analysisId} not found on BG/BR/BPM/FR/UC/NFR sheets`,
          severity: 'warning',
        })
      );
    }
    if (!crId) {
      issues.push(
        issue({
          code: 'RA_TRACE_CR_MISSING',
          sheet: ANALYSIS_SHEETS.TRACEABILITY,
          row: row._rowNumber,
          column: 'Customer Requirement ID',
          message: 'Customer Requirement ID is required',
        })
      );
    }
    if (type && !ANALYSIS_TYPES.includes(type)) {
      issues.push(
        issue({
          code: 'RA_TRACE_TYPE_INVALID',
          sheet: ANALYSIS_SHEETS.TRACEABILITY,
          row: row._rowNumber,
          column: 'Analysis Type',
          message: `Invalid Analysis Type: ${type}`,
        })
      );
    }
    const rel = String(row.relationship || '').trim();
    if (rel && !ANALYSIS_TRACE_RELATIONSHIPS.includes(rel)) {
      issues.push(
        issue({
          code: 'RA_TRACE_REL_INVALID',
          sheet: ANALYSIS_SHEETS.TRACEABILITY,
          row: row._rowNumber,
          column: 'Relationship',
          message: `Invalid Relationship: ${rel}`,
          severity: 'warning',
        })
      );
    }
  }

  if (frList.length === 0) {
    issues.push(
      issue({
        code: 'RA_FR_EMPTY',
        sheet: ANALYSIS_SHEETS.FR,
        message: '05_FR must contain at least one data row',
      })
    );
  }
  if (nfrList.length === 0) {
    issues.push(
      issue({
        code: 'RA_NFR_EMPTY',
        sheet: ANALYSIS_SHEETS.NFR,
        message: '07_NFR must contain at least one data row',
        severity: 'warning',
      })
    );
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  const byId = new Map();
  for (const node of frList) {
    if (!node.externalId) continue;
    byId.set(node.externalId, { ...node, children: [] });
  }
  const roots = [];
  for (const node of byId.values()) {
    const parentId = String(node.parentExternalId || '').trim();
    if (parentId && byId.has(parentId)) {
      byId.get(parentId).children.push(node);
    } else if (!parentId) {
      roots.push(node);
    }
  }

  return {
    issues,
    errorCount,
    warningCount,
    infoCount,
    valid: errorCount === 0,
    canRunAiAnalysis: false,
    previewTree: roots,
    summary: {
      functionalCount: frList.length,
      modules: frList.filter((r) => normalizeAnalysisFrLevel(r.level) === 'Module').length,
      capabilities: frList.filter((r) => normalizeAnalysisFrLevel(r.level) === 'Capability').length,
      features: frList.filter((r) => normalizeAnalysisFrLevel(r.level) === 'Feature').length,
      requirements: frList.filter((r) => normalizeAnalysisFrLevel(r.level) === 'Requirement').length,
      nfrCount: nfrList.length,
      traceabilityCount: links.length,
      scopeCount: 0,
    },
  };
}

module.exports = {
  validateAnalysisWorkbook,
};
