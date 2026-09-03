/**
 * Optional job title / seniority line for AI planning suggestion rows.
 */
export function formatAiPlanningSuggestionProfile(s, t) {
  const jobTitle = String(s?.jobTitle || '').trim();
  const seniority = String(s?.seniorityBand || '').trim();
  if (!jobTitle && !seniority) return null;
  const jobPart = jobTitle ? jobTitle : '';
  const seniorityPart = seniority
    ? jobTitle
      ? ` · ${seniority}`
      : seniority
    : '';
  return t('requirements.aiPlanningSuggestionProfile', {
    jobTitle: jobPart,
    seniority: seniorityPart,
  });
}
