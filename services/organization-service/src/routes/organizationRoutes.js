const express = require('express');
const router = express.Router();
const organizationController = require('../controllers/organizationController');
const memberController = require('../controllers/memberController');
const hrPositionController = require('../controllers/hrPositionController');
const { protect, authorize, authorizeOrGrant } = require('../middleware/auth');

router.use(protect); // All routes require authentication

/**
 * @openapi
 * /api/organizations/my:
 *   get:
 *     tags: [Organizations]
 *     summary: Danh sách org của user hiện tại
 *     description: Trả các organization user đang là thành viên.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách organizations
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccess'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/my', organizationController.getMyOrganizations);
router.get('/by-slug/:slug', organizationController.getOrganizationBySlug);
router.get('/invitations', memberController.getMyInvitations);
router.post('/invitations/:invitationId/respond', memberController.respondToInvitation);
router.post('/', organizationController.createOrganization);

router.get('/:orgId/shell', organizationController.getOrgShell);
router.get('/:orgId/documents-overview', organizationController.getDocumentsOverview);
router.get('/:orgId/structure', organizationController.getOrganizationStructure);

// Huy: Dynamic Organizational Structure API
const structureController = require('../controllers/structureController');
router.get('/:orgId/structure/templates', structureController.listTemplates);
router.get('/:orgId/structure/levels', authorizeOrGrant(['owner', 'admin'], 'organization.structure.view'), structureController.getLevels);
router.put('/:orgId/structure/levels', authorizeOrGrant(['owner', 'admin'], 'organization.structure.update'), structureController.putLevels);
router.get('/:orgId/structure/units', authorizeOrGrant(['owner', 'admin'], 'organization.structure.view'), structureController.listUnits);
router.post('/:orgId/structure/units', authorizeOrGrant(['owner', 'admin'], 'organization.structure.update'), structureController.createUnitHandler);
router.put('/:orgId/structure/units/:unitId', authorizeOrGrant(['owner', 'admin'], 'organization.structure.update'), structureController.updateUnitHandler);
router.delete('/:orgId/structure/units/:unitId', authorizeOrGrant(['owner', 'admin'], 'organization.structure.update'), structureController.deleteUnitHandler);
router.post('/:orgId/structure/apply-template', authorizeOrGrant(['owner', 'admin'], 'organization.structure.update'), structureController.applyTemplate);
router.post('/:orgId/structure/backfill', authorizeOrGrant(['owner', 'admin'], 'organization.structure.update'), structureController.backfill);
router.get(
  '/:orgId/structure/units/:unitId/members',
  authorizeOrGrant(['owner', 'admin'], 'organization.structure.view'),
  structureController.listUnitMembers
);
router.put(
  '/:orgId/structure/units/:unitId/members',
  authorizeOrGrant(['owner', 'admin'], 'organization.structure.update'),
  structureController.setUnitMembers
);

router.get('/:orgId/accessible-channel-ids', organizationController.getAccessibleChannelIds);
router.get('/:orgId/task-workspace-scope', organizationController.getTaskWorkspaceScope);

const orgRoleAdminController = require('../controllers/orgRoleAdmin.controller');

/**
 * @openapi
 * /api/organizations/{orgId}/org-roles:
 *   get:
 *     tags: [Organizations]
 *     summary: List Org Role catalog (runtime sync từ Master Data)
 *     description: Catalog lớp B — keys đã enable. Yêu cầu owner/admin.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Roles catalog
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccess'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get(
  '/:orgId/org-roles',
  authorizeOrGrant(['owner', 'admin'], 'organization.organization_role.view'),
  orgRoleAdminController.listCatalog
);
router.post(
  '/:orgId/org-roles',
  authorizeOrGrant(['owner', 'admin'], 'organization.organization_role.update'),
  orgRoleAdminController.createCatalog
);
router.put(
  '/:orgId/org-roles/reorder',
  authorizeOrGrant(['owner', 'admin'], 'organization.organization_role.update'),
  orgRoleAdminController.reorderCatalog
);
router.patch(
  '/:orgId/org-roles/:roleId',
  authorizeOrGrant(['owner', 'admin'], 'organization.organization_role.update'),
  orgRoleAdminController.updateCatalog
);
router.delete(
  '/:orgId/org-roles/:roleId',
  authorizeOrGrant(['owner', 'admin'], 'organization.organization_role.update'),
  orgRoleAdminController.deleteCatalog
);

router.get(
  '/:orgId/org-role-assignments',
  authorizeOrGrant(['owner', 'admin'], 'organization.organization_role.view'),
  orgRoleAdminController.listAssignments
);
router.put(
  '/:orgId/org-role-assignments',
  authorizeOrGrant(['owner', 'admin'], 'organization.organization_role.update'),
  orgRoleAdminController.setAssignments
);

/**
 * @openapi
 * /api/organizations/{orgId}/hr-positions:
 *   get:
 *     tags: [Organizations]
 *     summary: List HR Positions (enabled Master Data)
 *     description: Chức danh enabled — cùng nguồn User Edit / Pos Assign.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Positions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccess'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get(
  '/:orgId/hr-positions',
  authorizeOrGrant(['owner', 'admin'], 'organization.position.view'),
  hrPositionController.listCatalog
);
router.post(
  '/:orgId/hr-positions',
  authorizeOrGrant(['owner', 'admin'], 'organization.position.create'),
  hrPositionController.createCatalog
);

router.get(
  '/:orgId/channels/:channelId/access',
  authorizeOrGrant(['owner', 'admin'], 'communication.channel.view'),
  organizationController.listChannelAccess
);
router.post(
  '/:orgId/channels/:channelId/access/grant',
  authorizeOrGrant(['owner', 'admin'], 'communication.channel.update'),
  organizationController.grantChannelAccess
);
router.post(
  '/:orgId/channels/:channelId/access/revoke',
  authorizeOrGrant(['owner', 'admin'], 'communication.channel.update'),
  organizationController.revokeChannelAccess
);
router.get(
  '/:orgId/channels/:channelId/role-access',
  authorizeOrGrant(['owner', 'admin'], 'communication.channel.view'),
  organizationController.listChannelRoleAccess
);
router.put(
  '/:orgId/channels/:channelId/role-access',
  authorizeOrGrant(['owner', 'admin'], 'communication.channel.update'),
  organizationController.saveChannelRoleAccess
);
router.get(
  '/:orgId/divisions/:divisionId/role-access',
  authorizeOrGrant(['owner', 'admin'], 'organization.division.view'),
  organizationController.listDivisionRoleAccess
);
router.put(
  '/:orgId/divisions/:divisionId/role-access',
  authorizeOrGrant(['owner', 'admin'], 'organization.division.update'),
  organizationController.saveDivisionRoleAccess
);
router.get(
  '/:orgId/departments/:departmentId/role-access',
  authorizeOrGrant(['owner', 'admin'], 'organization.department.view'),
  organizationController.listDepartmentRoleAccess
);
router.put(
  '/:orgId/departments/:departmentId/role-access',
  authorizeOrGrant(['owner', 'admin'], 'organization.department.update'),
  organizationController.saveDepartmentRoleAccess
);
router.get(
  '/:orgId/teams/:teamId/role-access',
  authorizeOrGrant(['owner', 'admin'], 'organization.team.view'),
  organizationController.listTeamRoleAccess
);
router.put(
  '/:orgId/teams/:teamId/role-access',
  authorizeOrGrant(['owner', 'admin'], 'organization.team.update'),
  organizationController.saveTeamRoleAccess
);

const projectVisibilityPolicyController = require('../controllers/projectVisibilityPolicy.controller');
const orgMasterDataController = require('../controllers/orgMasterData.controller');
router.get(
  '/:orgId/project-visibility-policy',
  authorize(['owner', 'admin', 'hr', 'member']),
  projectVisibilityPolicyController.getProjectVisibilityPolicy
);
router.put(
  '/:orgId/project-visibility-policy',
  authorizeOrGrant(['owner', 'admin'], 'organization.policy.update'),
  projectVisibilityPolicyController.putProjectVisibilityPolicy
);

const requirementAccessPolicyController = require('../controllers/requirementAccessPolicy.controller');
router.get(
  '/:orgId/requirement-access-policy',
  authorize(['owner', 'admin', 'hr', 'member']),
  requirementAccessPolicyController.getRequirementAccessPolicy
);
router.put(
  '/:orgId/requirement-access-policy',
  authorizeOrGrant(['owner', 'admin'], 'organization.policy.update'),
  requirementAccessPolicyController.putRequirementAccessPolicy
);

/**
 * @openapi
 * /api/organizations/{orgId}/master-data:
 *   get:
 *     tags: [Organizations]
 *     summary: Master Data catalog + enabled keys
 *     description: Lớp A — enable/disable keys theo company size template.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Master Data + catalogs
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccess'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get(
  '/:orgId/master-data',
  authorizeOrGrant(['owner', 'admin'], 'organization.master_data.view'),
  orgMasterDataController.getMasterData
);

/**
 * @openapi
 * /api/organizations/{orgId}/master-data/enabled:
 *   patch:
 *     tags: [Organizations]
 *     summary: Patch enabled Master Data keys
 *     description: Cập nhật enabled*Keys; sync OrgRoleCatalog sau khi lưu.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               companySize: { type: string, enum: [startup, sme, mid, enterprise] }
 *               enabledDepartmentKeys:
 *                 type: array
 *                 items: { type: string }
 *               enabledPositionKeys:
 *                 type: array
 *                 items: { type: string }
 *               enabledOrganizationRoleKeys:
 *                 type: array
 *                 items: { type: string }
 *               enabledProjectRoleKeys:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       200:
 *         description: Updated catalog
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccess'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.patch(
  '/:orgId/master-data/enabled',
  authorizeOrGrant(['owner', 'admin'], 'organization.master_data.update'),
  orgMasterDataController.patchMasterDataEnabled
);

router.get('/:id', organizationController.getOrganization);
router.put('/:id', authorize(['owner', 'admin']), organizationController.updateOrganization);
router.delete('/:id', authorize(['owner']), organizationController.deleteOrganization);

module.exports = router;
