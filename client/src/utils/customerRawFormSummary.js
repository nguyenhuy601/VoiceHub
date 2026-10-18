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
    issues.push(t('workspace.phase1RawFormNotRecognized'));
  }
  for (const sheet of formValidation.missingSheets || []) {
    issues.push(t('workspace.phase1RawFormMissingSheet').replace('{sheet}', sheet));
  }
  const bySheet = formValidation.missingHeadersBySheet || {};
  for (const [sheet, cols] of Object.entries(bySheet)) {
    issues.push(
      t('workspace.phase1RawFormMissingCols')
        .replace('{sheet}', sheet)
        .replace('{cols}', (cols || []).join(', '))
    );
  }
  return issues;
}

export function formatCustomerRawFormTooltip(formValidation, t) {
  if (isCustomerRawFormOk(formValidation)) {
    return t('workspace.phase1RawFormOkTooltip');
  }
  const issues = formatCustomerRawFormIssues(formValidation, t);
  if (!issues.length) {
    return t('workspace.phase1RawFormInvalidTooltip');
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
    return t('requirements.phase1LlmInsufficientAbsent');
  }
  if (r === 'SOURCE_SHEET_EMPTY' || r === 'SOURCE_UNAVAILABLE') {
    return t('requirements.phase1LlmInsufficientEmpty');
  }
  return reason || '';
}
