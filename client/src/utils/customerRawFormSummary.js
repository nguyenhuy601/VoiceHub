/**
 * Format Customer Raw formValidation for UI / tooltip.
 */

export function isCustomerRawFormOk(formValidation) {
  return Boolean(formValidation && formValidation.ok === true);
}

export function formatCustomerRawFormIssues(formValidation, t) {
  if (!formValidation || formValidation.ok) return [];
  const issues = [];
  if (!formValidation.recognizedAsCustomerRaw) {
    issues.push(
      t('workspace.phase1RawFormNotRecognized') ||
        'Không nhận diện được template Customer Requirement Raw'
    );
  }
  for (const sheet of formValidation.missingSheets || []) {
    issues.push(
      (t('workspace.phase1RawFormMissingSheet') || 'Thiếu sheet: {sheet}').replace(
        '{sheet}',
        sheet
      )
    );
  }
  const bySheet = formValidation.missingHeadersBySheet || {};
  for (const [sheet, cols] of Object.entries(bySheet)) {
    issues.push(
      (t('workspace.phase1RawFormMissingCols') || '{sheet}: thiếu cột {cols}')
        .replace('{sheet}', sheet)
        .replace('{cols}', (cols || []).join(', '))
    );
  }
  return issues;
}

export function formatCustomerRawFormTooltip(formValidation, t) {
  if (isCustomerRawFormOk(formValidation)) {
    return t('workspace.phase1RawFormOkTooltip') || 'File Raw đúng form template';
  }
  const issues = formatCustomerRawFormIssues(formValidation, t);
  if (!issues.length) {
    return (
      t('workspace.phase1RawFormInvalidTooltip') ||
      'File Raw sai form template — không thể chạy AI'
    );
  }
  return issues.join('; ');
}

/**
 * LLM insufficient reasons (runtime empty source).
 */
export function isLlmInsufficientReason(reason) {
  const r = String(reason || '').toUpperCase();
  return r === 'SOURCE_SHEET_EMPTY' || r === 'SOURCE_SHEET_ABSENT' || r === 'SOURCE_UNAVAILABLE';
}

export function labelLlmInsufficientReason(reason, t) {
  const r = String(reason || '').toUpperCase();
  if (r === 'SOURCE_SHEET_ABSENT') {
    return (
      t('requirements.phase1LlmInsufficientAbsent') ||
      'Thiếu nguồn / không có sheet — không đủ dữ liệu để LLM phân tích'
    );
  }
  if (r === 'SOURCE_SHEET_EMPTY' || r === 'SOURCE_UNAVAILABLE') {
    return (
      t('requirements.phase1LlmInsufficientEmpty') ||
      'Không đủ dữ liệu để LLM phân tích (sheet trống)'
    );
  }
  return reason || '';
}
