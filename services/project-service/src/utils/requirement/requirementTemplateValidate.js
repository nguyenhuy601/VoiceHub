const {
  TEMPLATE_VERSION,
  COMPATIBLE_TEMPLATE_VERSIONS,
  MAX_FR_ROWS,
  FR_ROW_WARN_THRESHOLD,
  SHEETS,
  SHEET_COLUMNS,
  SHEET_REQUIRED_COLUMNS,
  REQUIRED_SHEETS,
  PRIORITIES,
  FR_LEVELS,
  FR_VALID_PARENT_LEVELS,
  OVERVIEW_FIELDS,
  INTEGRATION_DIRECTIONS,
} = require('../../constants/requirementTemplate.constants');
const {
  isFrDescRequiredLevel,
  normalizeFunctionalRequirementsLevels,
  isKnownFrLevel,
} = require('./requirementFrLevel');
const { parseDateValue } = require('./requirementDateUtils');
const { runRequirementQualityCheck } = require('./requirementQualityCheck');
const { normId } = require('./requirementTemplateTextNorm');

function issue({ code, sheet = '', row = null, column = '', message, severity = 'error' }) {
  return { code, sheet, row, column, message, severity };
}

function validateFileLayer({ fileName, fileSize, templateVersion }) {
  const issues = [];
  const name = String(fileName || '').toLowerCase();
  if (!name.endsWith('.xlsx')) {
    issues.push(issue({ code: 'REQ_FILE_INVALID_EXT', message: 'Chỉ chấp nhận file .xlsx' }));
  }
  if (templateVersion && !COMPATIBLE_TEMPLATE_VERSIONS.includes(String(templateVersion).trim())) {
    issues.push(
      issue({
        code: 'REQ_TEMPLATE_VERSION_MISMATCH',
        sheet: SHEETS.META,
        message: `Invalid template version. Expected: ${COMPATIBLE_TEMPLATE_VERSIONS.join(' or ')}. Uploaded: ${templateVersion}`,
      })
    );
  }
  if (Number(fileSize) > 5 * 1024 * 1024) {
    issues.push(issue({ code: 'REQ_FILE_TOO_LARGE', message: 'File vượt quá 5MB' }));
  }
  return issues;
}

function validateStructureLayer({ sheetNames, columnMaps = {} }) {
  const issues = [];
  const present = new Set(sheetNames || []);
  for (const sheet of REQUIRED_SHEETS) {
    if (!present.has(sheet)) {
      issues.push(
        issue({
          code: 'REQ_SHEET_MISSING',
          sheet,
          message: `Missing sheet: ${sheet}`,
        })
      );
    }
  }

  const checkSheetColumns = (sheet, map) => {
    if (!present.has(sheet)) return;
    const requiredCols = SHEET_REQUIRED_COLUMNS[sheet] || SHEET_COLUMNS[sheet] || [];
    for (const col of requiredCols) {
      if (!map || map[col] == null) {
        issues.push(
          issue({
            code: 'REQ_COLUMN_MISSING',
            sheet,
            column: col,
            message: `Missing column: ${col}`,
          })
        );
      }
    }
  };

  checkSheetColumns(SHEETS.CONTEXT, columnMaps.overview);
  checkSheetColumns(SHEETS.FUNCTIONAL, columnMaps.functional);
  checkSheetColumns(SHEETS.NFR, columnMaps.nfr);

  return issues;
}

function detectFrCycles(frList) {
  const byId = new Map(frList.map((r) => [String(r.externalId || '').trim(), r]));
  const issues = [];
  for (const row of frList) {
    const start = String(row.externalId || '').trim();
    if (!start) continue;
    const seen = new Set();
    let cur = start;
    let hops = 0;
    while (cur && hops < frList.length + 2) {
      if (seen.has(cur)) {
        issues.push(
          issue({
            code: 'REQ_FR_CYCLE',
            sheet: SHEETS.FUNCTIONAL,
            row: row._rowNumber,
            column: 'Parent ID',
            message: `Parent cycle detected involving ${start}`,
          })
        );
        break;
      }
      seen.add(cur);
      const node = byId.get(cur);
      cur = node ? String(node.parentExternalId || '').trim() : '';
      hops += 1;
    }
  }
  return issues;
}

function validateBusinessLayer(parsed) {
  const issues = [];
  const overview = parsed?.overview || {};

  const seenRequiredKeys = new Set();
  for (const field of OVERVIEW_FIELDS) {
    if (!field.required) continue;
    if (seenRequiredKeys.has(field.key)) continue;
    seenRequiredKeys.add(field.key);
    const val = overview[field.key];
    if (!String(val || '').trim()) {
      issues.push(
        issue({
          code: 'REQ_OVERVIEW_REQUIRED',
          sheet: SHEETS.CONTEXT,
          column: field.label,
          message: `${field.label} is required`,
        })
      );
    }
  }

  if (overview.priority && !PRIORITIES.includes(overview.priority)) {
    issues.push(
      issue({
        code: 'REQ_OVERVIEW_INVALID_PRIORITY',
        sheet: SHEETS.CONTEXT,
        column: 'Priority',
        message: `Priority must be one of: ${PRIORITIES.join(', ')}`,
      })
    );
  }

  if (overview.deadline && !parseDateValue(overview.deadline)) {
    issues.push(
      issue({
        code: 'REQ_OVERVIEW_INVALID_DATE',
        sheet: SHEETS.CONTEXT,
        column: 'Deadline',
        message: 'Deadline must be YYYY-MM-DD',
      })
    );
  }

  if (overview.startDate && !parseDateValue(overview.startDate)) {
    issues.push(
      issue({
        code: 'REQ_OVERVIEW_INVALID_START_DATE',
        sheet: SHEETS.CONTEXT,
        column: 'Start Date',
        message: 'Start Date must be YYYY-MM-DD',
        severity: 'warning',
      })
    );
  }

  const frList = normalizeFunctionalRequirementsLevels(parsed?.functionalRequirements || []);
  if (frList.length > MAX_FR_ROWS) {
    issues.push(
      issue({
        code: 'REQ_FR_TOO_MANY',
        sheet: SHEETS.FUNCTIONAL,
        message: `Functional requirements exceed ${MAX_FR_ROWS} rows`,
      })
    );
  } else if (frList.length > FR_ROW_WARN_THRESHOLD) {
    issues.push(
      issue({
        code: 'REQ_FR_LARGE',
        sheet: SHEETS.FUNCTIONAL,
        message: `Functional requirements count (${frList.length}) exceeds recommended ${FR_ROW_WARN_THRESHOLD}`,
        severity: 'warning',
      })
    );
  }

  const idToLevel = new Map();
  const seenIds = new Set();

  for (const row of frList) {
    const {
      externalId,
      level,
      parentExternalId,
      name,
      description,
      priority,
      actor,
      acceptanceCriteria,
      moduleLabel,
      featureLabel,
      _rowNumber,
    } = row;

    if (!externalId) {
      issues.push(
        issue({
          code: 'REQ_FR_ID_REQUIRED',
          sheet: SHEETS.FUNCTIONAL,
          row: _rowNumber,
          column: 'ID',
          message: 'ID is required',
        })
      );
      continue;
    }
    if (seenIds.has(externalId)) {
      issues.push(
        issue({
          code: 'REQ_FR_DUPLICATE_ID',
          sheet: SHEETS.FUNCTIONAL,
          row: _rowNumber,
          column: 'ID',
          message: `Duplicate ID: ${externalId}`,
        })
      );
    }
    seenIds.add(externalId);

    if (!isKnownFrLevel(level) || !FR_LEVELS.includes(level)) {
      issues.push(
        issue({
          code: 'REQ_FR_INVALID_LEVEL',
          sheet: SHEETS.FUNCTIONAL,
          row: _rowNumber,
          column: 'Level',
          message: `Level must be one of: ${FR_LEVELS.join(', ')} (Epic/Story/Task not allowed)`,
        })
      );
      continue;
    }

    if (!String(moduleLabel || name || '').trim()) {
      issues.push(
        issue({
          code: 'REQ_FR_MODULE_REQUIRED',
          sheet: SHEETS.FUNCTIONAL,
          row: _rowNumber,
          column: 'Module',
          message: 'Module is required',
        })
      );
    }

    if (!String(name || '').trim()) {
      issues.push(
        issue({
          code: 'REQ_FR_NAME_REQUIRED',
          sheet: SHEETS.FUNCTIONAL,
          row: _rowNumber,
          column: level === 'Requirement' ? 'Requirement' : level === 'Feature' ? 'Feature' : 'Module',
          message: `${level} title is required`,
        })
      );
    }

    if (priority && !PRIORITIES.includes(priority)) {
      issues.push(
        issue({
          code: 'REQ_FR_INVALID_PRIORITY',
          sheet: SHEETS.FUNCTIONAL,
          row: _rowNumber,
          column: 'Priority',
          message: `Priority must be one of: ${PRIORITIES.join(', ')}`,
        })
      );
    }

    const parent = String(parentExternalId || '').trim();
    const hasFlatLabels =
      Boolean(String(moduleLabel || '').trim()) && Boolean(String(featureLabel || '').trim());

    if (level === 'Module') {
      if (parent) {
        issues.push(
          issue({
            code: 'REQ_FR_MODULE_PARENT',
            sheet: SHEETS.FUNCTIONAL,
            row: _rowNumber,
            column: 'Parent ID',
            message: 'Module must not have Parent ID',
          })
        );
      }
    } else if (level === 'Feature') {
      if (!parent) {
        issues.push(
          issue({
            code: 'REQ_FR_PARENT_REQUIRED',
            sheet: SHEETS.FUNCTIONAL,
            row: _rowNumber,
            column: 'Parent ID',
            message: 'Feature requires Parent ID (Module)',
          })
        );
      }
    } else if (level === 'Requirement') {
      // Flat Standard Format: Requirement without Parent OK when Module+Feature columns filled
      if (!parent && !hasFlatLabels) {
        issues.push(
          issue({
            code: 'REQ_FR_PARENT_REQUIRED',
            sheet: SHEETS.FUNCTIONAL,
            row: _rowNumber,
            column: 'Parent ID',
            message:
              'Requirement requires Parent ID (Feature) or Module + Feature columns filled',
          })
        );
      }
    }

    if (level === 'Requirement') {
      // Soft WHAT quality — not Role/Skill/Hours; empty sample rows stay non-blocking
      if (isFrDescRequiredLevel(level) && !String(description || '').trim()) {
        issues.push(
          issue({
            code: 'REQ_FR_DESC_REQUIRED',
            sheet: SHEETS.FUNCTIONAL,
            row: _rowNumber,
            column: 'Description',
            message: 'Description is empty for Level=Requirement',
            severity: 'warning',
          })
        );
      }
      if (!String(actor || '').trim()) {
        issues.push(
          issue({
            code: 'REQ_FR_ACTOR_REQUIRED',
            sheet: SHEETS.FUNCTIONAL,
            row: _rowNumber,
            column: 'Actor',
            message: 'Actor is empty for Level=Requirement',
            severity: 'warning',
          })
        );
      }
      if (!String(acceptanceCriteria || '').trim()) {
        issues.push(
          issue({
            code: 'REQ_FR_AC_REQUIRED',
            sheet: SHEETS.FUNCTIONAL,
            row: _rowNumber,
            column: 'Acceptance Criteria',
            message: 'Acceptance Criteria is empty for Level=Requirement',
            severity: 'warning',
          })
        );
      }
      if (!String(row.mainFlow || '').trim()) {
        issues.push(
          issue({
            code: 'REQ_FR_MAIN_FLOW_EMPTY',
            sheet: SHEETS.FUNCTIONAL,
            row: _rowNumber,
            column: 'Main Flow',
            message: 'Main Flow is empty',
            severity: 'warning',
          })
        );
      }
    }

    idToLevel.set(externalId, level);
  }

  for (const row of frList) {
    const { level, parentExternalId, _rowNumber } = row;
    const parent = String(parentExternalId || '').trim();
    if (!parent || level === 'Module') continue;

    const parentLevel = idToLevel.get(parent);
    if (!parentLevel) {
      issues.push(
        issue({
          code: 'REQ_FR_ORPHAN_PARENT',
          sheet: SHEETS.FUNCTIONAL,
          row: _rowNumber,
          column: 'Parent ID',
          message: `Parent ID ${parent} does not exist`,
        })
      );
      continue;
    }

    const allowed = FR_VALID_PARENT_LEVELS[level] || [];
    if (!allowed.includes(parentLevel)) {
      issues.push(
        issue({
          code: 'REQ_FR_INVALID_HIERARCHY',
          sheet: SHEETS.FUNCTIONAL,
          row: _rowNumber,
          column: 'Parent ID',
          message: `${level} cannot have parent ${parent} (${parentLevel})`,
        })
      );
    }
  }

  issues.push(...detectFrCycles(frList));

  const nfrList = parsed?.nonFunctionalRequirements || [];
  if (!nfrList.length) {
    issues.push(
      issue({
        code: 'REQ_NFR_SHEET_EMPTY',
        sheet: SHEETS.NFR,
        message: 'Non-functional sheet has no rows',
        severity: 'warning',
      })
    );
  }
  for (const row of nfrList) {
    if (!String(row.externalId || '').trim()) {
      issues.push(
        issue({
          code: 'REQ_NFR_ID_REQUIRED',
          sheet: SHEETS.NFR,
          row: row._rowNumber,
          column: 'ID',
          message: 'NFR ID is required',
        })
      );
    }
    if (!String(row.requirement || '').trim()) {
      issues.push(
        issue({
          code: 'REQ_NFR_REQUIREMENT_REQUIRED',
          sheet: SHEETS.NFR,
          row: row._rowNumber,
          column: 'Requirement',
          message: 'NFR Requirement is required',
        })
      );
    }
  }

  for (const row of parsed?.integration || []) {
    if (row.required && !String(row.system || '').trim()) {
      issues.push(
        issue({
          code: 'REQ_INTEGRATION_SYSTEM_REQUIRED',
          sheet: SHEETS.INTEGRATION,
          row: row._rowNumber,
          column: 'System',
          message: 'System is required when Required=Yes',
        })
      );
    }
    if (row.direction && !INTEGRATION_DIRECTIONS.includes(row.direction)) {
      issues.push(
        issue({
          code: 'REQ_INTEGRATION_INVALID_DIRECTION',
          sheet: SHEETS.INTEGRATION,
          row: row._rowNumber,
          column: 'Direction',
          message: `Direction must be one of: ${INTEGRATION_DIRECTIONS.join(', ')}`,
          severity: 'warning',
        })
      );
    }
  }

  const frIdSet = new Set(frList.map((r) => r.externalId).filter(Boolean));
  for (const row of parsed?.requirementMetadata || []) {
    const rid = normId(row.requirementId);
    if (rid && !frIdSet.has(rid)) {
      issues.push(
        issue({
          code: 'REQ_METADATA_ORPHAN_FR',
          sheet: SHEETS.METADATA,
          row: row._rowNumber,
          column: 'Requirement ID',
          message: `Metadata Requirement ID ${rid} not found in FR sheet`,
          severity: 'warning',
        })
      );
    }
  }

  if (Number(parsed?.aiOutputRowCount) > 0) {
    issues.push(
      issue({
        code: 'REQ_AI_OUTPUT_SHEET_IGNORED',
        sheet: SHEETS.AI_OUTPUT,
        message: 'Sheet 11 AI Analysis Output has data — ignored on import (AI will overwrite)',
        severity: 'info',
      })
    );
  }

  return issues;
}

function buildFunctionalPreviewTree(functionalRequirements = []) {
  const byId = new Map();
  for (const node of functionalRequirements) {
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
  const sortChildren = (list) => {
    list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    for (const n of list) sortChildren(n.children || []);
  };
  sortChildren(roots);
  return roots;
}

function validateRequirementWorkbook({ fileName, fileSize, parsed }) {
  const frList = normalizeFunctionalRequirementsLevels(parsed?.functionalRequirements || []);
  const layer1 = validateFileLayer({
    fileName,
    fileSize,
    templateVersion: parsed?.templateVersion,
  });
  const layer2 = validateStructureLayer({
    sheetNames: parsed?.sheetNames,
    columnMaps: parsed?.columnMaps || {},
  });
  const layer3 = validateBusinessLayer({ ...parsed, functionalRequirements: frList });
  const layer4 = runRequirementQualityCheck(frList, SHEETS.FUNCTIONAL);
  const issues = [...layer1, ...layer2, ...layer3, ...layer4];
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;
  const previewTree = buildFunctionalPreviewTree(frList);
  const canRunAiAnalysis = errorCount === 0;
  return {
    issues,
    errorCount,
    warningCount,
    infoCount,
    valid: errorCount === 0,
    canRunAiAnalysis,
    previewTree,
    summary: {
      functionalCount: frList.length,
      modules: frList.filter((r) => r.level === 'Module').length,
      features: frList.filter((r) => r.level === 'Feature').length,
      requirements: frList.filter((r) => r.level === 'Requirement').length,
      nfrCount: (parsed?.nonFunctionalRequirements || []).length,
      scopeCount: (parsed?.scope || []).length,
    },
  };
}

module.exports = {
  validateRequirementWorkbook,
  validateFileLayer,
  validateStructureLayer,
  validateBusinessLayer,
  buildFunctionalPreviewTree,
  parseDateValue,
};
