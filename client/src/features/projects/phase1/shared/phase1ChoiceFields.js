/**
 * Cột có danh sách gợi ý. Người dùng chọn hoặc gõ giá trị khác.
 * value = giá trị lưu; labelKey = chữ hiện trên danh sách.
 */

const PRIORITY = Object.freeze([
  { value: 'Critical', labelKey: 'workspace.phase1ChoicePriorityCritical' },
  { value: 'High', labelKey: 'workspace.phase1ChoicePriorityHigh' },
  { value: 'Medium', labelKey: 'workspace.phase1ChoicePriorityMedium' },
  { value: 'Low', labelKey: 'workspace.phase1ChoicePriorityLow' },
]);

const LEVEL = Object.freeze([
  { value: 'Module', labelKey: 'workspace.phase1ChoiceLevelModule' },
  { value: 'Capability', labelKey: 'workspace.phase1ChoiceLevelCapability' },
  { value: 'Feature', labelKey: 'workspace.phase1ChoiceLevelFeature' },
  { value: 'Requirement', labelKey: 'workspace.phase1ChoiceLevelRequirement' },
]);

const SCOPE = Object.freeze([
  { value: 'in', labelKey: 'workspace.phase1ScopeIn' },
  { value: 'out', labelKey: 'workspace.phase1ScopeOut' },
]);

const ANALYSIS_STATUS = Object.freeze([
  { value: 'Draft', labelKey: 'workspace.phase1AnalysisStatusDraft' },
  { value: 'Reviewed', labelKey: 'workspace.phase1AnalysisStatusReviewed' },
  { value: 'Approved', labelKey: 'workspace.phase1AnalysisStatusApproved' },
]);

const DIRECTION = Object.freeze([
  { value: 'in', labelKey: 'workspace.phase1DirectionIn' },
  { value: 'out', labelKey: 'workspace.phase1DirectionOut' },
  { value: 'inout', labelKey: 'workspace.phase1DirectionInout' },
]);

const CATEGORY = Object.freeze([
  'Performance',
  'Security',
  'Usability',
  'Reliability',
  'Maintainability',
].map((value) => ({ value, labelKey: '' })));

const INTERFACE_TYPE = Object.freeze(
  ['API', 'UI', 'File', 'Message'].map((value) => ({ value, labelKey: '' }))
);

const IMPACT = Object.freeze([
  { value: 'low', labelKey: 'workspace.phase1PlanningImpact_low' },
  { value: 'medium', labelKey: 'workspace.phase1PlanningImpact_medium' },
  { value: 'high', labelKey: 'workspace.phase1PlanningImpact_high' },
]);

const DEPENDENCY = Object.freeze(
  ['FS', 'SS', 'FF', 'SF'].map((value) => ({ value, labelKey: '' }))
);

const BY_KEY = Object.freeze({
  priority: PRIORITY,
  level: LEVEL,
  scopeType: SCOPE,
  status: ANALYSIS_STATUS,
  direction: DIRECTION,
  category: CATEGORY,
  interfaceType: INTERFACE_TYPE,
  impact: IMPACT,
  probability: IMPACT,
  dependencyType: DEPENDENCY,
});

const PRIORITY_ALIAS = Object.freeze({
  must: 'Critical',
  should: 'High',
  could: 'Medium',
  wont: 'Low',
  "won't": 'Low',
});

function sameText(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

export function choiceOptions(fieldKey) {
  return BY_KEY[fieldKey] || null;
}

function optionLabel(option, t) {
  if (option.labelKey && typeof t === 'function') return t(option.labelKey);
  return option.value;
}

export function showChoice(fieldKey, stored, t) {
  const raw = stored == null ? '' : String(stored);
  const options = choiceOptions(fieldKey);
  if (!options || !raw.trim()) return raw;
  const hit = options.find((option) => sameText(option.value, raw));
  return hit ? optionLabel(hit, t) : raw;
}

export function commitChoice(fieldKey, typed, t) {
  const raw = String(typed ?? '');
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const alias = PRIORITY_ALIAS[trimmed.toLowerCase()];
  if (fieldKey === 'priority' && alias) return alias;
  const options = choiceOptions(fieldKey);
  if (!options) return trimmed;
  const hit = options.find(
    (option) => sameText(option.value, trimmed) || sameText(optionLabel(option, t), trimmed)
  );
  return hit ? hit.value : raw;
}
