/**
 * Requirement quality heuristics — warning/info only (never error).
 */

function issue({ code, sheet = '', row = null, column = '', message, severity = 'warning' }) {
  return { code, sheet, row, column, message, severity };
}

const SHORT_DESC = 20;
const SHORT_AC = 15;

/**
 * @param {object[]} frList normalized FR rows
 * @param {string} functionalSheetName
 */
function runRequirementQualityCheck(frList = [], functionalSheetName = '03_Functional_Requirements') {
  const issues = [];
  for (const row of frList) {
    if (String(row.level || '').trim() !== 'Requirement') continue;
    const { description, acceptanceCriteria, businessRules, exceptionFlow, _rowNumber } = row;

    if (description && String(description).length < SHORT_DESC) {
      issues.push(
        issue({
          code: 'REQ_QUALITY_DESC_SHORT',
          sheet: functionalSheetName,
          row: _rowNumber,
          column: 'Description',
          message: 'Description is very short — consider adding more detail',
          severity: 'warning',
        })
      );
    }

    if (acceptanceCriteria && String(acceptanceCriteria).length < SHORT_AC) {
      issues.push(
        issue({
          code: 'REQ_QUALITY_AC_SHORT',
          sheet: functionalSheetName,
          row: _rowNumber,
          column: 'Acceptance Criteria',
          message: 'Acceptance Criteria is very short',
          severity: 'warning',
        })
      );
    }

    if (!String(businessRules || '').trim()) {
      issues.push(
        issue({
          code: 'REQ_QUALITY_RULES_EMPTY',
          sheet: functionalSheetName,
          row: _rowNumber,
          column: 'Business Rules',
          message: 'Business Rules empty',
          severity: 'info',
        })
      );
    }

    if (!String(exceptionFlow || '').trim()) {
      issues.push(
        issue({
          code: 'REQ_QUALITY_EXCEPTION_EMPTY',
          sheet: functionalSheetName,
          row: _rowNumber,
          column: 'Exception Flow',
          message: 'Exception Flow empty',
          severity: 'info',
        })
      );
    }
  }
  return issues;
}

module.exports = {
  runRequirementQualityCheck,
};
