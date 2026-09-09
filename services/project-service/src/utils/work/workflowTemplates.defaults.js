/**
 * Org-level WorkflowTemplate seeds theo company size (Phase 4).
 * Pure data — không đụng DB.
 */

const DEFAULT_CHANGE_STATUS_PERMISSION = 'task:change_status';

const STARTUP_TEMPLATE = Object.freeze({
  key: 'startup',
  name: 'Startup',
  description: 'Todo → In progress → Done',
  companySizes: Object.freeze(['startup']),
  statuses: [
    { key: 'todo', label: 'Todo', category: 'todo', sortOrder: 1, isInitial: true, isFinal: false },
    {
      key: 'in_progress',
      label: 'In progress',
      category: 'in_progress',
      sortOrder: 2,
      isInitial: false,
      isFinal: false,
    },
    { key: 'done', label: 'Done', category: 'done', sortOrder: 3, isInitial: false, isFinal: true },
  ],
  transitions: [
    { fromKey: 'todo', toKey: 'in_progress', name: 'Start' },
    {
      fromKey: 'in_progress',
      toKey: 'done',
      name: 'Complete',
      validators: ['assignee_present'],
      requiresApprovalPolicyKey: 'task_done_startup',
    },
    { fromKey: 'in_progress', toKey: 'todo', name: 'Backlog' },
    { fromKey: 'done', toKey: 'in_progress', name: 'Reopen' },
  ],
});

/** SME — giữa startup và mid: thêm Review */
const SME_TEMPLATE = Object.freeze({
  key: 'sme',
  name: 'SME',
  description: 'Todo → In progress → Review → Done',
  companySizes: Object.freeze(['sme']),
  statuses: [
    { key: 'todo', label: 'Todo', category: 'todo', sortOrder: 1, isInitial: true, isFinal: false },
    {
      key: 'in_progress',
      label: 'In progress',
      category: 'in_progress',
      sortOrder: 2,
      isInitial: false,
      isFinal: false,
    },
    { key: 'review', label: 'Review', category: 'in_progress', sortOrder: 3, isInitial: false, isFinal: false },
    { key: 'done', label: 'Done', category: 'done', sortOrder: 4, isInitial: false, isFinal: true },
  ],
  transitions: [
    { fromKey: 'todo', toKey: 'in_progress', name: 'Start' },
    { fromKey: 'in_progress', toKey: 'review', name: 'Submit review', validators: ['assignee_present'] },
    {
      fromKey: 'review',
      toKey: 'done',
      name: 'Accept',
      validators: ['assignee_present'],
      requiresApprovalPolicyKey: 'task_done',
    },
    { fromKey: 'review', toKey: 'in_progress', name: 'Rework' },
    { fromKey: 'in_progress', toKey: 'todo', name: 'Backlog' },
    { fromKey: 'done', toKey: 'in_progress', name: 'Reopen' },
  ],
});

/** Mid-size — rút gọn enterprise */
const MID_TEMPLATE = Object.freeze({
  key: 'mid',
  name: 'Mid-size',
  description: 'Open → Dev → Code Review → QA → Done',
  companySizes: Object.freeze(['mid']),
  statuses: [
    { key: 'open', label: 'Open', category: 'todo', sortOrder: 1, isInitial: true, isFinal: false },
    { key: 'dev', label: 'Dev', category: 'in_progress', sortOrder: 2, isInitial: false, isFinal: false },
    {
      key: 'code_review',
      label: 'Code Review',
      category: 'in_progress',
      sortOrder: 3,
      isInitial: false,
      isFinal: false,
    },
    { key: 'qa', label: 'QA', category: 'in_progress', sortOrder: 4, isInitial: false, isFinal: false },
    { key: 'done', label: 'Done', category: 'done', sortOrder: 5, isInitial: false, isFinal: true },
  ],
  transitions: [
    { fromKey: 'open', toKey: 'dev', name: 'Develop' },
    { fromKey: 'dev', toKey: 'code_review', name: 'Request review', validators: ['assignee_present'] },
    { fromKey: 'code_review', toKey: 'qa', name: 'To QA' },
    {
      fromKey: 'qa',
      toKey: 'done',
      name: 'Pass QA',
      validators: ['assignee_present'],
      requiresApprovalPolicyKey: 'task_done',
    },
    { fromKey: 'code_review', toKey: 'dev', name: 'Changes requested' },
    { fromKey: 'qa', toKey: 'dev', name: 'QA failed' },
    { fromKey: 'done', toKey: 'dev', name: 'Reopen' },
  ],
});

const ENTERPRISE_TEMPLATE = Object.freeze({
  key: 'enterprise',
  name: 'Enterprise',
  description: 'Open → Analysis → Dev → Code Review → QA → UAT → Deploy → Done',
  companySizes: Object.freeze(['enterprise']),
  statuses: [
    { key: 'open', label: 'Open', category: 'todo', sortOrder: 1, isInitial: true, isFinal: false },
    { key: 'analysis', label: 'Analysis', category: 'in_progress', sortOrder: 2, isInitial: false, isFinal: false },
    { key: 'dev', label: 'Dev', category: 'in_progress', sortOrder: 3, isInitial: false, isFinal: false },
    { key: 'code_review', label: 'Code Review', category: 'in_progress', sortOrder: 4, isInitial: false, isFinal: false },
    { key: 'qa', label: 'QA', category: 'in_progress', sortOrder: 5, isInitial: false, isFinal: false },
    { key: 'uat', label: 'UAT', category: 'in_progress', sortOrder: 6, isInitial: false, isFinal: false },
    { key: 'deploy', label: 'Deploy', category: 'in_progress', sortOrder: 7, isInitial: false, isFinal: false },
    { key: 'done', label: 'Done', category: 'done', sortOrder: 8, isInitial: false, isFinal: true },
  ],
  transitions: [
    { fromKey: 'open', toKey: 'analysis', name: 'Analyze' },
    { fromKey: 'analysis', toKey: 'dev', name: 'Develop' },
    { fromKey: 'dev', toKey: 'code_review', name: 'Request review', validators: ['assignee_present'] },
    { fromKey: 'code_review', toKey: 'qa', name: 'To QA' },
    { fromKey: 'qa', toKey: 'uat', name: 'To UAT' },
    { fromKey: 'uat', toKey: 'deploy', name: 'Approve UAT' },
    {
      fromKey: 'deploy',
      toKey: 'done',
      name: 'Deployed',
      validators: ['assignee_present'],
      requiresApprovalPolicyKey: 'task_done_enterprise',
    },
    { fromKey: 'code_review', toKey: 'dev', name: 'Changes requested' },
    { fromKey: 'qa', toKey: 'dev', name: 'QA failed' },
    { fromKey: 'uat', toKey: 'qa', name: 'UAT failed' },
    { fromKey: 'analysis', toKey: 'open', name: 'Back to open' },
  ],
});

/** Legacy Default — tương thích seed cũ todo/in_progress/review/done */
const DEFAULT_BOARD_TEMPLATE = Object.freeze({
  key: 'default_board',
  name: 'Default Board',
  description: 'Todo → In progress → Review → Done (legacy seed)',
  companySizes: Object.freeze([]),
  statuses: [
    { key: 'todo', label: 'Todo', category: 'todo', sortOrder: 1, isInitial: true, isFinal: false },
    {
      key: 'in_progress',
      label: 'In progress',
      category: 'in_progress',
      sortOrder: 2,
      isInitial: false,
      isFinal: false,
    },
    { key: 'review', label: 'Review', category: 'in_progress', sortOrder: 3, isInitial: false, isFinal: false },
    { key: 'done', label: 'Done', category: 'done', sortOrder: 4, isInitial: false, isFinal: true },
    {
      key: 'cancelled',
      label: 'Cancelled',
      category: 'cancelled',
      sortOrder: 5,
      isInitial: false,
      isFinal: true,
    },
  ],
  transitions: [
    { fromKey: 'todo', toKey: 'in_progress', name: 'Start' },
    { fromKey: 'in_progress', toKey: 'review', name: 'Review' },
    { fromKey: 'review', toKey: 'done', name: 'Done', validators: ['assignee_present'] },
    { fromKey: 'todo', toKey: 'cancelled', name: 'Cancel' },
    { fromKey: 'in_progress', toKey: 'cancelled', name: 'Cancel' },
    { fromKey: 'review', toKey: 'cancelled', name: 'Cancel' },
    { fromKey: 'review', toKey: 'in_progress', name: 'Rework' },
    { fromKey: 'in_progress', toKey: 'todo', name: 'Back' },
  ],
});

const BUILTIN_TEMPLATES = Object.freeze([
  STARTUP_TEMPLATE,
  SME_TEMPLATE,
  MID_TEMPLATE,
  ENTERPRISE_TEMPLATE,
  DEFAULT_BOARD_TEMPLATE,
]);

const COMPANY_SIZE_TO_TEMPLATE_KEY = Object.freeze({
  startup: 'startup',
  sme: 'sme',
  mid: 'mid',
  enterprise: 'enterprise',
});

function isWorkflowEngineV2Enabled() {
  const raw = String(process.env.WORKFLOW_ENGINE_V2 ?? '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

/** Map org settings.companySize → builtin template key */
function suggestedTemplateKeyForCompanySize(companySize) {
  const k = String(companySize || '')
    .trim()
    .toLowerCase();
  return COMPANY_SIZE_TO_TEMPLATE_KEY[k] || 'startup';
}

function getBuiltinTemplateByKey(key) {
  const k = String(key || '').trim();
  return BUILTIN_TEMPLATES.find((t) => t.key === k) || null;
}

module.exports = {
  DEFAULT_CHANGE_STATUS_PERMISSION,
  STARTUP_TEMPLATE,
  SME_TEMPLATE,
  MID_TEMPLATE,
  ENTERPRISE_TEMPLATE,
  DEFAULT_BOARD_TEMPLATE,
  BUILTIN_TEMPLATES,
  COMPANY_SIZE_TO_TEMPLATE_KEY,
  isWorkflowEngineV2Enabled,
  suggestedTemplateKeyForCompanySize,
  getBuiltinTemplateByKey,
};
