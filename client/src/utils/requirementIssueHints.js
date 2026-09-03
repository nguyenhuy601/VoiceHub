/** @typedef {{ code?: string, sheet?: string, row?: number|null, column?: string, message?: string, severity?: string }} ValidationIssue */

export function normalizeSheetKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function normalizeHeader(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * @param {ValidationIssue[]} issues
 * @param {'error'|'warning'|'info'} severityFilter
 */
export function filterIssuesBySeverity(issues, severityFilter) {
  return (issues || []).filter((issue) => {
    const sev =
      issue?.severity === 'warning'
        ? 'warning'
        : issue?.severity === 'info'
          ? 'info'
          : 'error';
    return sev === severityFilter;
  });
}

/**
 * @param {ValidationIssue[]} issues
 * @param {'error'|'warning'} severityFilter
 * @returns {Map<string, ValidationIssue[]>}
 */
export function groupIssuesBySheet(issues, severityFilter = 'error') {
  const map = new Map();
  for (const issue of filterIssuesBySeverity(issues, severityFilter)) {
    const sheet = String(issue?.sheet || '').trim() || '_file';
    if (!map.has(sheet)) map.set(sheet, []);
    map.get(sheet).push(issue);
  }
  return map;
}

/**
 * @param {ValidationIssue[]} issues
 * @param {string} sheetName
 * @param {'error'|'warning'} severityFilter
 * @returns {Set<number>}
 */
export function rowsWithIssues(issues, sheetName, severityFilter = 'error') {
  const rows = new Set();
  const sheetKey = normalizeSheetKey(sheetName);
  for (const issue of filterIssuesBySeverity(issues, severityFilter)) {
    const issueSheet = String(issue?.sheet || '').trim();
    if (issueSheet && normalizeSheetKey(issueSheet) !== sheetKey && sheetName !== '_file') {
      continue;
    }
    const row = Number(issue?.row);
    if (Number.isFinite(row) && row >= 1) rows.add(row);
  }
  return rows;
}

/**
 * Sheet-level issues (no row number).
 * @param {ValidationIssue[]} issues
 * @param {string} sheetName
 * @param {'error'|'warning'} severityFilter
 */
export function sheetLevelIssues(issues, sheetName, severityFilter = 'error') {
  const sheetKey = normalizeSheetKey(sheetName);
  return filterIssuesBySeverity(issues, severityFilter).filter((issue) => {
    const issueSheet = String(issue?.sheet || '').trim();
    if (issueSheet && normalizeSheetKey(issueSheet) !== sheetKey) return false;
    const row = Number(issue?.row);
    return !Number.isFinite(row) || row < 1;
  });
}

/**
 * @param {ValidationIssue[]} issues
 * @param {string} sheetName
 * @param {number} rowNumber
 * @param {'error'|'warning'} severityFilter
 */
export function issuesForRow(issues, sheetName, rowNumber, severityFilter = 'error') {
  const sheetKey = normalizeSheetKey(sheetName);
  return filterIssuesBySeverity(issues, severityFilter).filter((issue) => {
    const issueSheet = String(issue?.sheet || '').trim();
    if (issueSheet && normalizeSheetKey(issueSheet) !== sheetKey) return false;
    return Number(issue?.row) === rowNumber;
  });
}

/**
 * @param {ValidationIssue[]} issues
 * @param {string} sheetName
 * @param {number} rowNumber
 * @param {number} colIdx
 * @param {string[]} headerCells
 * @param {'error'|'warning'} severityFilter
 */
export function issuesForCell(issues, sheetName, rowNumber, colIdx, headerCells, severityFilter = 'error') {
  const colName = normalizeHeader(headerCells?.[colIdx]);
  if (!colName) return [];
  return issuesForRow(issues, sheetName, rowNumber, severityFilter).filter((issue) => {
    const issueCol = normalizeHeader(issue?.column);
    return issueCol && issueCol === colName;
  });
}

/**
 * Ordered sheet names that have at least one issue for the severity filter.
 * @param {ValidationIssue[]} issues
 * @param {{ sheets?: Array<{ name?: string }> }} excelPreview
 * @param {'error'|'warning'} severityFilter
 */
export function listIssueSheetNames(issues, excelPreview, severityFilter = 'error') {
  const grouped = groupIssuesBySheet(issues, severityFilter);
  const fromIssues = [...grouped.keys()].filter((k) => k !== '_file');
  const previewNames = (excelPreview?.sheets || []).map((s) => String(s.name || '').trim()).filter(Boolean);
  const ordered = [];
  const seen = new Set();
  for (const name of previewNames) {
    if (grouped.has(name) && !seen.has(name)) {
      ordered.push(name);
      seen.add(name);
    }
  }
  for (const name of fromIssues) {
    if (!seen.has(name)) {
      ordered.push(name);
      seen.add(name);
    }
  }
  if (grouped.has('_file') && !seen.has('_file')) {
    ordered.push('_file');
  }
  return ordered;
}

/**
 * @param {string} code
 * @param {(key: string, opts?: object) => string} t
 */
export function getIssueFixHint(code, t) {
  const key = String(code || '').trim();
  if (!key) {
    return t('requirements.issueHints._default');
  }
  const hintKey = `requirements.issueHints.${key}`;
  const hint = t(hintKey);
  if (hint && hint !== hintKey) return hint;
  return t('requirements.issueHints._default');
}

/**
 * Dedupe issues by code for hint display.
 * @param {ValidationIssue[]} rowIssues
 * @param {(key: string, opts?: object) => string} t
 */
export function formatRowIssueHints(rowIssues, t) {
  const seen = new Set();
  const lines = [];
  for (const issue of rowIssues || []) {
    const code = String(issue?.code || '').trim() || '_';
    if (seen.has(code)) continue;
    seen.add(code);
    const message = String(issue?.message || '').trim();
    const hint = getIssueFixHint(code, t);
    if (message && hint) {
      lines.push({ code, message, hint });
    } else if (message) {
      lines.push({ code, message, hint: '' });
    } else if (hint) {
      lines.push({ code, message: '', hint });
    }
  }
  return lines;
}

/**
 * Resolve severity filter from error/warning/info counts.
 * @param {number} errorCount
 * @param {number} warningCount
 * @param {number} [infoCount]
 * @returns {'error'|'warning'|'info'|null}
 */
export function resolveSeverityFilter(errorCount, warningCount, infoCount = 0) {
  if (Number(errorCount) > 0) return 'error';
  if (Number(warningCount) > 0) return 'warning';
  if (Number(infoCount) > 0) return 'info';
  return null;
}
