const {
  fetchTaskWorkspaceScope,
  canCreateTaskInScope,
} = require('./taskWorkspaceScope');
const {
  isRequirementSubmitterUser,
  isRequirementApproverUser,
} = require('../utils/requirementProductUser');
const { canImportViaOrgRole } = require('../utils/requirementAccessPolicy');
const { assertCanViewOrgCapacity } = require('./resourceCapacity.service');

function resolveUserId(userId) {
  return String(userId || '').trim();
}

async function resolveRequirementAccess({ userId, organizationId }) {
  const uid = resolveUserId(userId);
  const orgId = String(organizationId || '').trim();
  const denied = {
    canView: false,
    canImport: false,
    canSubmit: false,
    canApprove: false,
    canCreateFromPack: false,
    canRunAiPlanning: false,
    showCollaborateNav: false,
    isProductUser: false,
  };
  if (!uid || !orgId) return denied;

  const scope = await fetchTaskWorkspaceScope(uid, orgId);
  if (!scope) return denied;

  const role = String(scope.membershipRole || '').toLowerCase();
  const [isSubmitter, isApprover] = await Promise.all([
    isRequirementSubmitterUser(uid, orgId),
    isRequirementApproverUser(uid, orgId),
  ]);
  const isProductUser = isSubmitter || isApprover;
  const canImportViaAdmin = canImportViaOrgRole(role);
  const canImport = canImportViaAdmin || isSubmitter;
  const canSubmit = isSubmitter || canImportViaAdmin;
  const canApprove = isApprover;
  const canCreateFromPack = canCreateTaskInScope(scope);

  let canRunAiPlanning = false;
  try {
    await assertCanViewOrgCapacity(uid, orgId);
    canRunAiPlanning = true;
  } catch {
    canRunAiPlanning = false;
  }

  return {
    canView: true,
    canImport,
    canSubmit,
    canApprove,
    canCreateFromPack,
    canRunAiPlanning,
    showCollaborateNav: isProductUser,
    isProductUser,
  };
}

async function assertRequirementPermission({ userId, organizationId, permission }) {
  const uid = resolveUserId(userId);
  const orgId = String(organizationId || '').trim();
  if (!uid || !orgId) {
    const err = new Error('userId và organizationId bắt buộc');
    err.statusCode = 400;
    throw err;
  }

  const scope = await fetchTaskWorkspaceScope(uid, orgId);
  if (!scope) {
    const err = new Error('Không có quyền truy cập organization');
    err.statusCode = 403;
    throw err;
  }

  const role = String(scope.membershipRole || '').toLowerCase();
  const perm = String(permission || '').trim();

  switch (perm) {
    case 'requirement:view':
      return { scope, via: 'org_member' };
    case 'requirement:import':
    case 'requirement:submit': {
      if (canImportViaOrgRole(role)) return { scope, via: role };
      if (await isRequirementSubmitterUser(uid, orgId)) return { scope, via: 'submitter' };
      break;
    }
    case 'requirement:approve': {
      if (await isRequirementApproverUser(uid, orgId)) return { scope, via: 'approver' };
      const err = new Error(
        'Chỉ Product Manager, Project Manager hoặc Product Owner được duyệt requirements'
      );
      err.statusCode = 403;
      err.errorCode = 'REQUIREMENT_APPROVE_FORBIDDEN';
      throw err;
    }
    case 'requirement:create-project': {
      if (canCreateTaskInScope(scope)) return { scope, via: 'can_create_task' };
      const err = new Error('Bạn không có quyền tạo dự án từ requirement pack');
      err.statusCode = 403;
      err.errorCode = 'REQUIREMENT_CREATE_PROJECT_FORBIDDEN';
      throw err;
    }
    case 'requirement:run-ai-planning': {
      try {
        const capacity = await assertCanViewOrgCapacity(uid, orgId);
        return {
          scope,
          via: capacity.isOrgAdmin ? 'org_admin' : 'resource_manager',
        };
      } catch (capacityErr) {
        const err = new Error(
          'Chỉ Org Admin hoặc Resource Manager được chạy AI Resource Planning'
        );
        err.statusCode = 403;
        err.errorCode = 'REQUIREMENT_AI_PLANNING_FORBIDDEN';
        err.cause = capacityErr;
        throw err;
      }
    }
    default:
      break;
  }

  const err = new Error(`Không có quyền: ${perm}`);
  err.statusCode = 403;
  err.errorCode = 'REQUIREMENT_FORBIDDEN';
  throw err;
}

module.exports = {
  assertRequirementPermission,
  resolveRequirementAccess,
};
