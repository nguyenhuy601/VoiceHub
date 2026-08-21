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
  NFR_CATEGORIES,
  OVERVIEW_FIELDS,
} = require('../constants/requirementTemplate.constants');
const { FR_LEAF_LEVEL } = require('../constants/requirementStaffing.constants');
const { normalizeHeader } = require('./requirementTemplateParse');
const { parseDateValue } = require('./requirementDateUtils');
const { isKnownSkill, isKnownProjectRole } = require('./requirementStaffingParse');

function issue({ code, sheet = '', row = null, column = '', message, severity = 'error' }) {
  return { code, sheet, row, column, message, severity };
}

function validateFileLayer({ fileName, fileSize, templateVersion }) {
  const issues = [];
  const name = String(fileName || '').toLowerCase();
  if (!name.endsWith('.xlsx')) {
    issues.push(
      issue({
        code: 'REQ_FILE_INVALID_EXT',
        message: 'Chỉ chấp nhận file .xlsx',
      })
    );
  }
  if (templateVersion && !COMPATIBLE_TEMPLATE_VERSIONS.includes(templateVersion)) {
    issues.push(
      issue({
        code: 'REQ_TEMPLATE_VERSION_MISMATCH',
        sheet: SHEETS.META,
        message: `Invalid template version. Expected: ${COMPATIBLE_TEMPLATE_VERSIONS.join(' or ')}. Uploaded: ${templateVersion}`,
      })
    );
  }
  if (Number(fileSize) > 5 * 1024 * 1024) {
    issues.push(
      issue({
        code: 'REQ_FILE_TOO_LARGE',
        message: 'File vượt quá 5MB',
      })
    );
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

  checkSheetColumns(SHEETS.OVERVIEW, columnMaps.overview);
  checkSheetColumns(SHEETS.SCOPE, columnMaps.scope);
  checkSheetColumns(SHEETS.FUNCTIONAL, columnMaps.functional);
  checkSheetColumns(SHEETS.NFR, columnMaps.nfr);

  return issues;
}

function validateBusinessLayer(parsed) {
  const issues = [];
  const overview = parsed?.overview || {};

  for (const field of OVERVIEW_FIELDS) {
    if (!field.required) continue;
    const val = overview[field.key];
    if (!String(val || '').trim()) {
      issues.push(
        issue({
          code: 'REQ_OVERVIEW_REQUIRED',
          sheet: SHEETS.OVERVIEW,
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
        sheet: SHEETS.OVERVIEW,
        column: 'Priority',
        message: `Priority must be one of: ${PRIORITIES.join(', ')}`,
      })
    );
  }

  if (overview.deadline && !parseDateValue(overview.deadline)) {
    issues.push(
      issue({
        code: 'REQ_OVERVIEW_INVALID_DATE',
        sheet: SHEETS.OVERVIEW,
        column: 'Deadline',
        message: 'Deadline must be YYYY-MM-DD',
      })
    );
  }

  if (overview.startDate && !parseDateValue(overview.startDate)) {
    issues.push(
      issue({
        code: 'REQ_OVERVIEW_INVALID_START_DATE',
        sheet: SHEETS.OVERVIEW,
        column: 'Start Date',
        message: 'Start Date must be YYYY-MM-DD',
        severity: 'warning',
      })
    );
  }

  const frList = parsed?.functionalRequirements || [];
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
    const { externalId, level, parentExternalId, name, description, priority, _rowNumber } = row;
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

    if (!FR_LEVELS.includes(level)) {
      issues.push(
        issue({
          code: 'REQ_FR_INVALID_LEVEL',
          sheet: SHEETS.FUNCTIONAL,
          row: _rowNumber,
          column: 'Level',
          message: `Level must be one of: ${FR_LEVELS.join(', ')}`,
        })
      );
      continue;
    }

    if (!String(name || '').trim()) {
      issues.push(
        issue({
          code: 'REQ_FR_NAME_REQUIRED',
          sheet: SHEETS.FUNCTIONAL,
          row: _rowNumber,
          column: 'Name',
          message: 'Name is required',
        })
      );
    }

    if (level === 'Requirement' && !String(description || '').trim()) {
      issues.push(
        issue({
          code: 'REQ_FR_DESC_REQUIRED',
          sheet: SHEETS.FUNCTIONAL,
          row: _rowNumber,
          column: 'Description',
          message: 'Description is required for Level=Requirement',
        })
      );
    } else if (level === 'Feature' && !String(description || '').trim()) {
      issues.push(
        issue({
          code: 'REQ_FR_DESC_EMPTY',
          sheet: SHEETS.FUNCTIONAL,
          row: _rowNumber,
          column: 'Description',
          message: 'Description empty at Feature level',
          severity: 'warning',
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
    } else if (!parent) {
      issues.push(
        issue({
          code: 'REQ_FR_PARENT_REQUIRED',
          sheet: SHEETS.FUNCTIONAL,
          row: _rowNumber,
          column: 'Parent ID',
          message: `${level} requires Parent ID`,
        })
      );
    }

    idToLevel.set(externalId, level);

    if (level === FR_LEAF_LEVEL) {
      const skills = row.suggestedSkills || [];
      if (skills.length === 0) {
        issues.push(
          issue({
            code: 'REQ_FR_LEAF_SKILLS_REQUIRED',
            sheet: SHEETS.FUNCTIONAL,
            row: _rowNumber,
            column: 'Suggested Skills',
            message: 'Requirement leaf requires Suggested Skills',
          })
        );
      }
      if (row.estimateHours == null || Number(row.estimateHours) <= 0) {
        issues.push(
          issue({
            code: 'REQ_FR_LEAF_HOURS_REQUIRED',
            sheet: SHEETS.FUNCTIONAL,
            row: _rowNumber,
            column: 'Effort Hours',
            message: 'Requirement leaf requires Effort Hours > 0',
          })
        );
      }
      if (!String(row.suggestedRoleKey || '').trim()) {
        issues.push(
          issue({
            code: 'REQ_FR_LEAF_ROLE_REQUIRED',
            sheet: SHEETS.FUNCTIONAL,
            row: _rowNumber,
            column: 'Suggested Role',
            message: 'Requirement leaf requires Suggested Role',
          })
        );
      }
    }

    if (row.estimateHours != null) {
      if (level !== FR_LEAF_LEVEL) {
        issues.push(
          issue({
            code: 'REQ_FR_EFFORT_NON_LEAF',
            sheet: SHEETS.FUNCTIONAL,
            row: _rowNumber,
            column: 'Effort Hours',
            message: 'Effort Hours is recommended only for Level=Requirement',
            severity: 'warning',
          })
        );
      }
    }

    for (const skill of row.suggestedSkills || []) {
      if (!isKnownSkill(skill)) {
        issues.push(
          issue({
            code: 'REQ_FR_UNKNOWN_SKILL',
            sheet: SHEETS.FUNCTIONAL,
            row: _rowNumber,
            column: 'Suggested Skills',
            message: `Unknown skill (not in whitelist): ${skill}`,
          })
        );
      }
    }

    if (row.suggestedRoleKey && !isKnownProjectRole(row.suggestedRoleKey)) {
      issues.push(
        issue({
          code: 'REQ_FR_UNKNOWN_ROLE',
          sheet: SHEETS.FUNCTIONAL,
          row: _rowNumber,
          column: 'Suggested Role',
          message: `Unknown project role key: ${row.suggestedRoleKey}`,
        })
      );
    }
  }

  for (const row of frList) {
    const { externalId, level, parentExternalId, _rowNumber } = row;
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

  for (const row of parsed?.nonFunctionalRequirements || []) {
    if (row.category && !NFR_CATEGORIES.includes(row.category)) {
      issues.push(
        issue({
          code: 'REQ_NFR_INVALID_CATEGORY',
          sheet: SHEETS.NFR,
          row: row._rowNumber,
          column: 'Category',
          message: `Unknown NFR category: ${row.category}`,
          severity: 'warning',
        })
      );
    }
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
  const layer1 = validateFileLayer({
    fileName,
    fileSize,
    templateVersion: parsed?.templateVersion,
  });
  const layer2 = validateStructureLayer({
    sheetNames: parsed?.sheetNames,
    columnMaps: parsed?.columnMaps || {},
  });
  const layer3 = validateBusinessLayer(parsed);
  const issues = [...layer1, ...layer2, ...layer3];
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const previewTree = buildFunctionalPreviewTree(parsed?.functionalRequirements || []);
  return {
    issues,
    errorCount,
    warningCount,
    valid: errorCount === 0,
    previewTree,
    summary: {
      functionalCount: (parsed?.functionalRequirements || []).length,
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
