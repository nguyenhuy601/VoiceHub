const express = require('express');
const controller = require('../controllers/internalOrganization.controller');
const skillRegistryController = require('../controllers/skillRegistry.controller');
const {
  getInternalProjectVisibilityContext,
} = require('../controllers/projectVisibilityPolicy.controller');
const {
  getInternalRequirementAccessPolicy,
} = require('../controllers/requirementAccessPolicy.controller');

const router = express.Router();

/** voice-service: quyền voice kênh org (S2S, không dùng route admin /channels/.../access). */
router.get(
  '/voice-channel-access/:organizationId/:userId/:channelId',
  controller.getVoiceChannelAccess
);

/** GET membership role — role-permission-service requireOrgMember gọi S2S. */
router.get('/membership/:organizationId/:userId', controller.getMembershipRole);

/** GET active memberships — RBAC V2 rebind UserRole sau direct-replace (S2S). */
router.get('/memberships/:organizationId', controller.listActiveMemberships);

/** Tên tổ chức cho webhook / service nội bộ (serverId RBAC = organizationId). */
router.get('/org/:organizationId/summary', controller.getOrgSummary);

/**
 * POST body: { organizationId, userIds?, mentionLabels?, channelId?, messageText? }
 */
router.post('/ai-task-context', controller.postAiTaskContext);

/**
 * POST body: { organizationId, userId }
 * Đồng bộ Membership + members[] sau gán/gỡ role hierarchy.
 */
router.post('/sync-membership-placement', controller.syncMembershipPlacement);

/** Đồng bộ lại toàn bộ thành viên active trong org (sửa dữ liệu cũ). */
router.post('/sync-membership-placement-org', controller.syncMembershipPlacementOrg);

/** Backfill RoleScopeAssignment từ hierarchy roles hiện có. */
router.post('/backfill-role-scope-assignments', controller.backfillRoleScopeAssignments);

/**
 * Seed/UAT — đồng bộ hierarchy roles (div_/dep_/team_) bất chấp structure cache.
 * Body: { organizationId }
 */
router.post('/sync-hierarchy-roles', controller.syncHierarchyRolesInternal);

/**
 * Seed/UAT — upsert membership (S2S). Body: { organizationId, userId, role? }
 */
router.post('/ensure-membership', controller.ensureMembership);

/**
 * Seed/UAT — chuyển owner. Body: { organizationId, newOwnerUserId }
 * Demote owner cũ → admin; set owner mới; cập nhật Organization.ownerId.
 */
router.post('/transfer-owner', controller.transferOwner);

/**
 * Single-company reset — liệt kê mọi org.
 * Chỉ gọi với x-gateway-internal-token (internalGatewayAuth).
 */
router.get('/organizations', controller.listOrganizationsInternal);

/** Xóa 1 org + dữ liệu liên quan trên các service (cascade). */
router.post('/purge-organization', controller.purgeOrganization);

/** Xóa toàn bộ tổ chức trong DB (single-company pivot / reset môi trường). */
router.post('/purge-all-organizations', controller.purgeAllOrganizations);

/** project-service: actor placement + org visibility policy */
router.get(
  '/organizations/:organizationId/users/:userId/project-visibility-context',
  getInternalProjectVisibilityContext
);

/** project-service: org requirement access policy */
router.get(
  '/organizations/:organizationId/requirement-access-policy',
  getInternalRequirementAccessPolicy
);

/** project-service: enabled master project role keys for ensureOrgProjectRoles */
router.get(
  '/organizations/:organizationId/master-data/enabled-project-roles',
  controller.getEnabledProjectRoles
);

/** project-service: enabled master position keys for member-candidates scoring */
router.get(
  '/organizations/:organizationId/master-data/enabled-positions',
  controller.getEnabledPositions
);

/** project-service: department roster (headcount) cho Resource Capacity / Planner */
router.get('/organizations/:orgId/departments/roster', controller.getDepartmentRoster);

/** project-service: user People Graph placement */
router.get('/organizations/:orgId/users/:userId/placement', controller.getUserPlacement);

/** project-service S2S: create workgroup channel for a level-2 parent task */
router.post('/project-workgroup-channel', controller.createProjectWorkgroupChannel);

/**
 * chat-service S2S: resolve project channel by kind (e.g. announcement).
 * GET /project-channel/:organizationId/:projectId?kind=announcement
 */
router.get('/project-channel/:organizationId/:projectId', controller.getProjectChannel);

/** project-service S2S: update workgroup channel members */
router.put('/project-workgroup-channel/:channelId/members', controller.updateProjectWorkgroupMembers);

/** project-service / user-service S2S: resolve skills against org registry */
router.post(
  '/organizations/:organizationId/skills/resolve-batch',
  skillRegistryController.resolveBatchInternal
);
router.post('/organizations/:organizationId/skills/seed', skillRegistryController.seedInternal);
router.post(
  '/organizations/:organizationId/skills/by-ids',
  skillRegistryController.getSkillsByIdsInternal
);

module.exports = router;
