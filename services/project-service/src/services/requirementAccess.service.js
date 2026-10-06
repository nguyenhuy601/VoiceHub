const {
  fetchTaskWorkspaceScope,
  canCreateTaskInScope,
} = require('./taskWorkspaceScope');
const { fetchRequirementAccessPolicy } = require('../clients/requirementAccessPolicy.client');
const {
  resolveRequirementPersona,
  hasProjectRoleKeysOnProject,
  hasProjectRoleKeys,
  userHasApproverRoleOnProject,
} = require('../utils/requirement/resolveRequirementPersona');
const { createInflightCoalesce } = require('../utils/requirement/inflightCoalesce');
const {
  canPreviewCustomerRawRequirement,
} = require('../utils/requirement/customerRawPreviewAuthz');
const {
  REQUIREMENT_APPROVER_PROJECT_ROLE_KEYS,
  REQUIREMENT_SUBMITTER_PROJECT_ROLE_KEYS,
} = require('../constants/requirementLifecycle');
const { logger } = require('@enterprise/shared');

const coalescePersonaLoad = createInflightCoalesce();

/** Short TTL — same order as FE access staleTime; multi-replica miss OK. */
const PERSONA_TTL_MS = 45 * 1000;
const personaCache = new Map();

function resolveUserId(userId) {
  return String(userId || '').trim();
}

function personaCacheKey(uid, orgId) {
  return `${uid}:${orgId}`;
}

function readPersonaCache(key) {
  const row = personaCache.get(key);
  if (!row) return null;
  if (Date.now() - row.at > PERSONA_TTL_MS) {
    personaCache.delete(key);
    return null;
  }
  return row.value;
}

function writePersonaCache(key, value) {
  if (!key || value == null) return;
  personaCache.set(key, { at: Date.now(), value });
}

function invalidatePersonaContextCache(userId, organizationId) {
  const uid = resolveUserId(userId);
  const orgId = String(organizationId || '').trim();
  if (uid && orgId) {
    personaCache.delete(personaCacheKey(uid, orgId));
    return;
  }
  if (orgId) {
    for (const key of personaCache.keys()) {
      if (key.endsWith(`:${orgId}`)) personaCache.delete(key);
    }
  }
}

async function loadPersonaContextUncached(uid, orgId) {
  const [scope, policy] = await Promise.all([
    fetchTaskWorkspaceScope(uid, orgId),
    fetchRequirementAccessPolicy(orgId),
  ]);
  if (!scope) return null;

  const membershipRole = String(scope.membershipRole || '').toLowerCase();
  const persona = await resolveRequirementPersona({
    userId: uid,
    organizationId: orgId,
    membershipRole,
    policy,
  });

  return { scope, policy, persona, membershipRole };
}

async function loadPersonaContext(userId, organizationId) {
  const uid = resolveUserId(userId);
  const orgId = String(organizationId || '').trim();
  if (!uid || !orgId) return null;
  const key = personaCacheKey(uid, orgId);
  const cached = readPersonaCache(key);
  if (cached) return cached;
  return coalescePersonaLoad(key, async () => {
    const value = await loadPersonaContextUncached(uid, orgId);
    if (value) writePersonaCache(key, value);
    return value;
  });
}

function buildAccessFromPersona(scope, persona) {
  const actions = persona?.actions || {};
  const visibility = persona?.visibility || {};
  const canCreateFromPack = actions.createProject && canCreateTaskInScope(scope);

  return {
    canView: Boolean(actions.view),
    canImport: Boolean(actions.import),
    canSubmit: Boolean(actions.submit),
    canApprove: Boolean(actions.approve),
    canCreateFromPack,
    canRunAiPlanning: Boolean(actions.runAiPlanning),
    showCollaborateNav: Boolean(visibility.collaborateRequirements),
    showAdminRequirements: Boolean(visibility.adminRequirements),
    isProductUser: Boolean(persona?.isProductUser),
    persona: persona?.persona || 'member',
    personasMatched: Array.isArray(persona?.personasMatched) ? persona.personasMatched : ['member'],
    visibleSections: {
      collaborateRequirements: Boolean(visibility.collaborateRequirements),
      adminRequirements: Boolean(visibility.adminRequirements),
    },
  };
}

async function resolveRequirementAccess({ userId, organizationId }) {
  const denied = {
    canView: false,
    canImport: false,
    canSubmit: false,
    canApprove: false,
    canCreateFromPack: false,
    canRunAiPlanning: false,
    showCollaborateNav: false,
    showAdminRequirements: false,
    isProductUser: false,
    persona: 'member',
    personasMatched: ['member'],
    visibleSections: {
      collaborateRequirements: false,
      adminRequirements: false,
    },
  };

  const ctx = await loadPersonaContext(userId, organizationId);
  if (!ctx) return denied;

  return buildAccessFromPersona(ctx.scope, ctx.persona);
}

async function canUserRunAiPlanning(uid, orgId, projectId = null) {
  const ctx = await loadPersonaContext(uid, orgId);
  if (!ctx) return { ok: false, via: null };
  if (ctx.persona.actions?.runAiPlanning) {
    if (ctx.persona.isApprover) return { ok: true, via: 'approver' };
    if (ctx.persona.isOperator) return { ok: true, via: 'org_admin' };
    return { ok: true, via: 'policy' };
  }
  const pid = String(projectId || '').trim();
  if (await hasProjectRoleKeys(uid, orgId, REQUIREMENT_APPROVER_PROJECT_ROLE_KEYS)) {
    return { ok: true, via: 'project_role:approver' };
  }
  if (pid) {
    const projectApprover = await userHasApproverRoleOnProject(
      uid,
      pid,
      REQUIREMENT_APPROVER_PROJECT_ROLE_KEYS
    );
    if (projectApprover.ok) return { ok: true, via: projectApprover.via };
  }
  return { ok: false, via: null };
}

async function assertRequirementPermission({
  userId,
  organizationId,
  permission,
  projectId = null,
} = {}) {
  const uid = resolveUserId(userId);
  const orgId = String(organizationId || '').trim();
  const pid = String(projectId || '').trim();
  if (!uid || !orgId) {
    const err = new Error('userId và organizationId bắt buộc');
    err.statusCode = 400;
    throw err;
  }

  const ctx = await loadPersonaContext(uid, orgId);
  if (!ctx) {
    const err = new Error('Không có quyền truy cập organization');
    err.statusCode = 403;
    throw err;
  }

  const { scope, persona } = ctx;
  const perm = String(permission || '').trim();
  const actions = persona.actions || {};

  switch (perm) {
    case 'requirement:view':
      if (actions.view) return { scope, via: persona.persona };
      break;
    case 'requirement:import':
      if (actions.import) return { scope, via: persona.persona };
      break;
    case 'requirement:submit':
      if (actions.submit) return { scope, via: persona.persona };
      if (
        pid &&
        (await hasProjectRoleKeysOnProject(uid, pid, REQUIREMENT_SUBMITTER_PROJECT_ROLE_KEYS))
      ) {
        return { scope, via: 'project_role:business_analyst' };
      }
      break;
    case 'requirement:approve':
      if (actions.approve) {
        return { scope, via: persona.persona };
      }
      // Lifecycle keys (not org policy) — policy may wipe projectRoleKeys to []
      if (
        await hasProjectRoleKeys(uid, orgId, REQUIREMENT_APPROVER_PROJECT_ROLE_KEYS)
      ) {
        return { scope, via: 'project_role:approver' };
      }
      if (
        pid &&
        (await hasProjectRoleKeysOnProject(uid, pid, REQUIREMENT_APPROVER_PROJECT_ROLE_KEYS))
      ) {
        return { scope, via: 'project_role:product_owner' };
      }
      // FE SoT: same resolveUserProjectPermissions + role matrix (not creator dump)
      if (pid) {
        const projectApprover = await userHasApproverRoleOnProject(
          uid,
          pid,
          REQUIREMENT_APPROVER_PROJECT_ROLE_KEYS
        );
        if (projectApprover.ok) {
          return { scope, via: projectApprover.via || 'project_role:approver' };
        }
        logger.warn('[requirement] approve forbidden', {
          errorCode: 'REQUIREMENT_APPROVE_FORBIDDEN',
          projectId: pid,
          viaAttempted: ['persona', 'org_role_keys', 'project_membership', 'project_access_sot'],
          roleKeys: projectApprover.roleKeys || [],
        });
      } else {
        logger.warn('[requirement] approve forbidden', {
          errorCode: 'REQUIREMENT_APPROVE_FORBIDDEN',
          projectId: null,
          viaAttempted: ['persona', 'org_role_keys'],
        });
      }
      {
        const err = new Error(
          'Chỉ Product Manager, Project Manager hoặc Product Owner được duyệt requirements'
        );
        err.statusCode = 403;
        err.errorCode = 'REQUIREMENT_APPROVE_FORBIDDEN';
        throw err;
      }
    case 'requirement:create-project':
      if (actions.createProject && canCreateTaskInScope(scope)) {
        return { scope, via: 'can_create_task' };
      }
      {
        const err = new Error('Bạn không có quyền tạo dự án từ requirement pack');
        err.statusCode = 403;
        err.errorCode = 'REQUIREMENT_CREATE_PROJECT_FORBIDDEN';
        throw err;
      }
    case 'requirement:run-ai-planning':
      if (actions.runAiPlanning) return { scope, via: persona.persona };
      // Same SoT as approve — project PO/PM may run Phase HOW after Gate 1
      if (
        await hasProjectRoleKeys(uid, orgId, REQUIREMENT_APPROVER_PROJECT_ROLE_KEYS)
      ) {
        return { scope, via: 'project_role:approver' };
      }
      if (
        pid &&
        (await hasProjectRoleKeysOnProject(uid, pid, REQUIREMENT_APPROVER_PROJECT_ROLE_KEYS))
      ) {
        return { scope, via: 'project_role:product_owner' };
      }
      if (pid) {
        const projectApprover = await userHasApproverRoleOnProject(
          uid,
          pid,
          REQUIREMENT_APPROVER_PROJECT_ROLE_KEYS
        );
        if (projectApprover.ok) {
          return { scope, via: projectApprover.via || 'project_role:approver' };
        }
      }
      {
        const err = new Error(
          'Chỉ Product Owner, Product Manager hoặc Project Manager được chạy AI Resource Planning'
        );
        err.statusCode = 403;
        err.errorCode = 'REQUIREMENT_AI_PLANNING_FORBIDDEN';
        throw err;
      }
    default:
      break;
  }

  const err = new Error(`Không có quyền: ${perm}`);
  err.statusCode = 403;
  err.errorCode = 'REQUIREMENT_FORBIDDEN';
  throw err;
}

/**
 * Preview Customer Requirement Raw only — not Analysis/SRS confirm pack.
 * Allows project creators without submitter/operator import persona.
 */
async function assertRequirementImportOrCreateProjectScope({ userId, organizationId }) {
  const uid = resolveUserId(userId);
  const orgId = String(organizationId || '').trim();
  if (!uid || !orgId) {
    const err = new Error('userId và organizationId bắt buộc');
    err.statusCode = 400;
    throw err;
  }

  const ctx = await loadPersonaContext(uid, orgId);
  if (!ctx) {
    const err = new Error('Không có quyền truy cập organization');
    err.statusCode = 403;
    throw err;
  }

  const { scope, persona } = ctx;
  const actions = persona.actions || {};
  if (canPreviewCustomerRawRequirement({ actions, scope })) {
    const via = actions.import ? persona.persona : 'can_create_project';
    return { scope, via };
  }

  const err = new Error('Không có quyền: requirement:import');
  err.statusCode = 403;
  err.errorCode = 'REQUIREMENT_FORBIDDEN';
  throw err;
}

module.exports = {
  assertRequirementPermission,
  assertRequirementImportOrCreateProjectScope,
  canPreviewCustomerRawRequirement,
  resolveRequirementAccess,
  canUserRunAiPlanning,
  loadPersonaContext,
  invalidatePersonaContextCache,
  PERSONA_TTL_MS,
};
