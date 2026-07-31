/**
 * Pure approval chain helpers (Phase 5) — unit-testable.
 */

const APPROVAL_STATUSES = Object.freeze([
  'pending',
  'approved',
  'rejected',
  'cancelled',
]);

const APPROVER_TYPES = Object.freeze(['project_role', 'user', 'org_role']);

function normalizePolicySteps(raw = []) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((s, i) => ({
      order: Number(s.order) || i + 1,
      approverType: String(s.approverType || 'project_role').trim(),
      roleKey: String(s.roleKey || '').trim().toLowerCase() || undefined,
      userId: s.userId ? String(s.userId) : undefined,
      quorum: Math.max(1, Number(s.quorum) || 1),
    }))
    .filter((s) => APPROVER_TYPES.includes(s.approverType))
    .sort((a, b) => a.order - b.order);
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
    const need = String(step.roleKey || '').toLowerCase();
    if (!need) return false;
    const keys = new Set((actor.projectRoleKeys || []).map((k) => String(k).toLowerCase()));
    return keys.has(need);
  }
  if (type === 'org_role') {
    const need = String(step.roleKey || '').toLowerCase();
    if (!need) return false;
    const keys = new Set((actor.orgRoleKeys || []).map((k) => String(k).toLowerCase()));
    return keys.has(need);
  }
  return false;
}

/**
 * Apply one decision to chain state (pure).
 * @returns {{ ok: boolean, message?: string, statusCode?: number, nextStatus?: string, currentStep?: number, decisions?: array }}
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

  // approve — quorum: count approvals at this stepIndex
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

/**
 * T1: incomplete chain must not complete.
 */
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

const BUILTIN_POLICIES = Object.freeze([
  {
    key: 'task_done',
    name: 'Task Done',
    description: 'Developer → Tech Lead → QA → PM',
    entityTypes: ['task'],
    steps: [
      { order: 1, approverType: 'project_role', roleKey: 'tech_lead', quorum: 1 },
      { order: 2, approverType: 'project_role', roleKey: 'qa', quorum: 1 },
      { order: 3, approverType: 'project_role', roleKey: 'project_manager', quorum: 1 },
    ],
  },
  {
    key: 'mr_merge',
    name: 'Merge Request',
    description: 'Stub: Dev → Leader → Architect',
    entityTypes: ['merge_request'],
    steps: [
      { order: 1, approverType: 'project_role', roleKey: 'tech_lead', quorum: 1 },
      { order: 2, approverType: 'project_role', roleKey: 'architect', quorum: 1 },
    ],
  },
  {
    key: 'release_deploy',
    name: 'Release Deploy',
    description: 'Stub: QA → Release Manager',
    entityTypes: ['release'],
    steps: [
      { order: 1, approverType: 'project_role', roleKey: 'qa', quorum: 1 },
      { order: 2, approverType: 'project_role', roleKey: 'release_manager', quorum: 1 },
    ],
  },
]);

module.exports = {
  APPROVAL_STATUSES,
  APPROVER_TYPES,
  BUILTIN_POLICIES,
  normalizePolicySteps,
  actorCanDecideStep,
  applyDecisionToChain,
  isChainComplete,
  isApprovalSystemV2Enabled,
  isApprovalMrReleaseStubEnabled,
};
