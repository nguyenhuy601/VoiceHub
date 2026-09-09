/**
 * Pure approval chain helpers (Phase 5) — unit-testable.
 * Approver roleKey MUST resolve to master Project / Organization Role catalogs.
 */

const {
  MASTER_PROJECT_ROLE_KEYS,
  resolveCanonicalProjectRoleKey,
  MASTER_ORGANIZATION_ROLE_KEYS,
  resolveCanonicalOrganizationRoleKey,
} = require('@enterprise/shared/config/masterData');

const APPROVAL_STATUSES = Object.freeze([
  'pending',
  'approved',
  'rejected',
  'cancelled',
]);

const APPROVER_TYPES = Object.freeze(['project_role', 'user', 'org_role']);

function canonicalizeStepRoleKey(approverType, roleKey) {
  const raw = String(roleKey || '').trim().toLowerCase();
  if (!raw) return '';
  if (approverType === 'org_role') {
    return resolveCanonicalOrganizationRoleKey(raw);
  }
  return resolveCanonicalProjectRoleKey(raw);
}

function normalizePolicySteps(raw = []) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((s, i) => {
      const approverType = String(s.approverType || 'project_role').trim();
      const roleKey = canonicalizeStepRoleKey(approverType, s.roleKey) || undefined;
      return {
        order: Number(s.order) || i + 1,
        approverType,
        roleKey,
        userId: s.userId ? String(s.userId) : undefined,
        quorum: Math.max(1, Number(s.quorum) || 1),
      };
    })
    .filter((s) => APPROVER_TYPES.includes(s.approverType))
    .sort((a, b) => a.order - b.order);
}

/**
 * T3 — reject custom / unknown role keys at save.
 * @returns {{ ok: boolean, message?: string, invalidKeys?: string[], statusCode?: number }}
 */
function validatePolicySteps(steps = []) {
  const normalized = normalizePolicySteps(steps);
  if (!normalized.length) {
    return { ok: false, message: 'steps bắt buộc', statusCode: 400 };
  }
  const projectSet = new Set(MASTER_PROJECT_ROLE_KEYS);
  const orgSet = new Set(MASTER_ORGANIZATION_ROLE_KEYS);
  const invalid = [];
  for (const s of normalized) {
    if (s.approverType === 'user') {
      if (!s.userId) {
        return { ok: false, message: 'Bước user cần userId', statusCode: 400 };
      }
      continue;
    }
    if (s.approverType === 'project_role') {
      if (!s.roleKey || !projectSet.has(s.roleKey)) {
        invalid.push(s.roleKey || '(empty)');
      }
    }
    if (s.approverType === 'org_role') {
      if (!s.roleKey || !orgSet.has(s.roleKey)) {
        invalid.push(s.roleKey || '(empty)');
      }
    }
  }
  if (invalid.length) {
    return {
      ok: false,
      message: `Approver roleKey không thuộc master catalog: ${invalid.join(', ')}`,
      invalidKeys: invalid,
      statusCode: 400,
    };
  }
  return { ok: true, steps: normalized };
}

/**
 * Can actor decide current step?
 * @param {{ approverType, roleKey?, userId? }} step
 * @param {{ userId, projectRoleKeys?: string[], orgRoleKeys?: string[], isOrgAdmin?: boolean }} actor
 */
function actorCanDecideStep(step, actor = {}) {
  if (!step) return false;
  if (actor.isOrgAdmin) return true;
  const uid = String(actor.userId || '');
  const type = String(step.approverType || '');
  if (type === 'user') {
    return Boolean(step.userId && String(step.userId) === uid);
  }
  if (type === 'project_role') {
    const need = canonicalizeStepRoleKey('project_role', step.roleKey);
    if (!need) return false;
    const keys = new Set(
      (actor.projectRoleKeys || []).map((k) => canonicalizeStepRoleKey('project_role', k))
    );
    return keys.has(need);
  }
  if (type === 'org_role') {
    const need = canonicalizeStepRoleKey('org_role', step.roleKey);
    if (!need) return false;
    const keys = new Set(
      (actor.orgRoleKeys || []).map((k) => canonicalizeStepRoleKey('org_role', k))
    );
    return keys.has(need);
  }
  return false;
}

/**
 * Apply one decision to chain state (pure).
 */
function applyDecisionToChain({
  steps = [],
  currentStep = 0,
  decisions = [],
  actor = {},
  decision = 'approve',
  comment = '',
  at = new Date(),
} = {}) {
  const normalized = normalizePolicySteps(steps);
  if (!normalized.length) {
    return { ok: false, message: 'Policy không có bước duyệt', statusCode: 400 };
  }
  if (currentStep < 0 || currentStep >= normalized.length) {
    return { ok: false, message: 'currentStep không hợp lệ', statusCode: 400 };
  }
  const step = normalized[currentStep];
  if (!actorCanDecideStep(step, actor)) {
    return {
      ok: false,
      message: 'Bạn không phải approver của bước hiện tại',
      statusCode: 403,
    };
  }

  const dec = String(decision || '').toLowerCase();
  if (dec !== 'approve' && dec !== 'reject') {
    return { ok: false, message: 'decision phải là approve|reject', statusCode: 400 };
  }

  const nextDecisions = [
    ...decisions,
    {
      stepIndex: currentStep,
      userId: String(actor.userId || ''),
      decision: dec,
      at,
      comment: String(comment || '').trim().slice(0, 1000),
    },
  ];

  if (dec === 'reject') {
    return {
      ok: true,
      nextStatus: 'rejected',
      currentStep,
      decisions: nextDecisions,
    };
  }

  const approvalsAtStep = nextDecisions.filter(
    (d) => d.stepIndex === currentStep && d.decision === 'approve'
  ).length;
  if (approvalsAtStep < step.quorum) {
    return {
      ok: true,
      nextStatus: 'pending',
      currentStep,
      decisions: nextDecisions,
      awaitingQuorum: true,
    };
  }

  const nextStep = currentStep + 1;
  if (nextStep >= normalized.length) {
    return {
      ok: true,
      nextStatus: 'approved',
      currentStep: nextStep,
      decisions: nextDecisions,
    };
  }
  return {
    ok: true,
    nextStatus: 'pending',
    currentStep: nextStep,
    decisions: nextDecisions,
  };
}

function isChainComplete(status) {
  return String(status) === 'approved';
}

function isApprovalSystemV2Enabled() {
  const raw = String(process.env.APPROVAL_SYSTEM_V2 ?? '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

function isApprovalMrReleaseStubEnabled() {
  const raw = String(process.env.APPROVAL_MR_RELEASE_STUB ?? '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

/** Company-size Task Done chains (master keys only). */
const TASK_DONE_STEPS_BY_SIZE = Object.freeze({
  startup: Object.freeze([
    { order: 1, approverType: 'project_role', roleKey: 'technical_lead', quorum: 1 },
    { order: 2, approverType: 'project_role', roleKey: 'project_manager', quorum: 1 },
  ]),
  sme: Object.freeze([
    { order: 1, approverType: 'project_role', roleKey: 'technical_lead', quorum: 1 },
    { order: 2, approverType: 'project_role', roleKey: 'qa_engineer', quorum: 1 },
    { order: 3, approverType: 'project_role', roleKey: 'project_manager', quorum: 1 },
  ]),
  mid: Object.freeze([
    { order: 1, approverType: 'project_role', roleKey: 'technical_lead', quorum: 1 },
    { order: 2, approverType: 'project_role', roleKey: 'qa_engineer', quorum: 1 },
    { order: 3, approverType: 'project_role', roleKey: 'project_manager', quorum: 1 },
  ]),
  enterprise: Object.freeze([
    { order: 1, approverType: 'project_role', roleKey: 'technical_lead', quorum: 1 },
    { order: 2, approverType: 'project_role', roleKey: 'qa_lead', quorum: 1 },
    { order: 3, approverType: 'project_role', roleKey: 'project_manager', quorum: 1 },
    { order: 4, approverType: 'org_role', roleKey: 'department_manager', quorum: 1 },
  ]),
});

function taskDoneStepsForCompanySize(companySize = 'startup') {
  const k = String(companySize || 'startup')
    .trim()
    .toLowerCase();
  return TASK_DONE_STEPS_BY_SIZE[k] || TASK_DONE_STEPS_BY_SIZE.startup;
}

/**
 * Builtin catalog seeds. `task_done` steps default to sme-length;
 * `task_done_startup` / `task_done_enterprise` for size-specific apply.
 */
const BUILTIN_POLICIES = Object.freeze([
  {
    key: 'task_done',
    name: 'Task Done',
    description: 'Technical Lead → QA → Project Manager (default / SME)',
    entityTypes: ['task'],
    companySizes: ['sme', 'mid'],
    steps: [...TASK_DONE_STEPS_BY_SIZE.sme],
  },
  {
    key: 'task_done_startup',
    name: 'Task Done (Startup)',
    description: 'Technical Lead → Project Manager',
    entityTypes: ['task'],
    companySizes: ['startup'],
    steps: [...TASK_DONE_STEPS_BY_SIZE.startup],
  },
  {
    key: 'task_done_enterprise',
    name: 'Task Done (Enterprise)',
    description: 'TL → QA Lead → PM → Department Manager',
    entityTypes: ['task'],
    companySizes: ['enterprise'],
    steps: [...TASK_DONE_STEPS_BY_SIZE.enterprise],
  },
  {
    key: 'mr_merge',
    name: 'Merge Request',
    description: 'Stub: Technical Lead → Solution Architect',
    entityTypes: ['merge_request'],
    companySizes: ['startup', 'sme', 'mid', 'enterprise'],
    steps: [
      { order: 1, approverType: 'project_role', roleKey: 'technical_lead', quorum: 1 },
      { order: 2, approverType: 'project_role', roleKey: 'solution_architect', quorum: 1 },
    ],
  },
  {
    key: 'release_deploy',
    name: 'Release Deploy',
    description: 'Stub: QA Lead → DevOps → Project Manager',
    entityTypes: ['release'],
    companySizes: ['sme', 'mid', 'enterprise'],
    steps: [
      { order: 1, approverType: 'project_role', roleKey: 'qa_lead', quorum: 1 },
      { order: 2, approverType: 'project_role', roleKey: 'devops_engineer', quorum: 1 },
      { order: 3, approverType: 'project_role', roleKey: 'project_manager', quorum: 1 },
    ],
  },
  {
    key: 'change_request_default',
    name: 'Change Request',
    description: 'Business Analyst → Product Owner → Project Manager',
    entityTypes: ['change_request'],
    companySizes: ['startup', 'sme', 'mid', 'enterprise'],
    steps: [
      { order: 1, approverType: 'project_role', roleKey: 'business_analyst', quorum: 1 },
      { order: 2, approverType: 'project_role', roleKey: 'product_owner', quorum: 1 },
      { order: 3, approverType: 'project_role', roleKey: 'project_manager', quorum: 1 },
    ],
  },
]);

/** Map company size → preferred task_done policy key for workflow bind */
function suggestedTaskDonePolicyKey(companySize) {
  const k = String(companySize || 'startup')
    .trim()
    .toLowerCase();
  if (k === 'startup') return 'task_done_startup';
  if (k === 'enterprise') return 'task_done_enterprise';
  return 'task_done';
}

module.exports = {
  APPROVAL_STATUSES,
  APPROVER_TYPES,
  BUILTIN_POLICIES,
  TASK_DONE_STEPS_BY_SIZE,
  normalizePolicySteps,
  validatePolicySteps,
  actorCanDecideStep,
  applyDecisionToChain,
  isChainComplete,
  isApprovalSystemV2Enabled,
  isApprovalMrReleaseStubEnabled,
  taskDoneStepsForCompanySize,
  suggestedTaskDonePolicyKey,
  canonicalizeStepRoleKey,
};
