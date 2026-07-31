const express = require('express');
const router = express.Router();
const organizationController = require('../controllers/organizationController');
const memberController = require('../controllers/memberController');
const hrPositionController = require('../controllers/hrPositionController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect); // All routes require authentication

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
router.get('/:orgId/structure/levels', authorize(['owner', 'admin']), structureController.getLevels);
router.put('/:orgId/structure/levels', authorize(['owner', 'admin']), structureController.putLevels);
router.get('/:orgId/structure/units', authorize(['owner', 'admin']), structureController.listUnits);
router.post('/:orgId/structure/units', authorize(['owner', 'admin']), structureController.createUnitHandler);
router.put('/:orgId/structure/units/:unitId', authorize(['owner', 'admin']), structureController.updateUnitHandler);
router.delete('/:orgId/structure/units/:unitId', authorize(['owner', 'admin']), structureController.deleteUnitHandler);
router.post('/:orgId/structure/apply-template', authorize(['owner', 'admin']), structureController.applyTemplate);
router.post('/:orgId/structure/backfill', authorize(['owner', 'admin']), structureController.backfill);
router.get(
  '/:orgId/structure/units/:unitId/members',
  authorize(['owner', 'admin']),
  structureController.listUnitMembers
);
router.put(
  '/:orgId/structure/units/:unitId/members',
  authorize(['owner', 'admin']),
  structureController.setUnitMembers
);

router.get('/:orgId/accessible-channel-ids', organizationController.getAccessibleChannelIds);
router.get('/:orgId/task-workspace-scope', organizationController.getTaskWorkspaceScope);

const orgRoleAdminController = require('../controllers/orgRoleAdmin.controller');
router.get(
  '/:orgId/org-roles',
  authorize(['owner', 'admin']),
  orgRoleAdminController.listCatalog
);
router.post(
  '/:orgId/org-roles',
  authorize(['owner', 'admin']),
  orgRoleAdminController.createCatalog
);
router.put(
  '/:orgId/org-roles/reorder',
  authorize(['owner', 'admin']),
  orgRoleAdminController.reorderCatalog
);
router.patch(
  '/:orgId/org-roles/:roleId',
  authorize(['owner', 'admin']),
  orgRoleAdminController.updateCatalog
);
router.delete(
  '/:orgId/org-roles/:roleId',
  authorize(['owner', 'admin']),
  orgRoleAdminController.deleteCatalog
);

router.get(
  '/:orgId/org-role-assignments',
  authorize(['owner', 'admin']),
  orgRoleAdminController.listAssignments
);
router.put(
  '/:orgId/org-role-assignments',
  authorize(['owner', 'admin']),
  orgRoleAdminController.setAssignments
);

// HR Positions (job titles) — cho phép tạo catalog mà không cần gán cho nhân viên
router.get(
  '/:orgId/hr-positions',
  authorize(['owner', 'admin']),
  hrPositionController.listCatalog
);
router.post(
  '/:orgId/hr-positions',
  authorize(['owner', 'admin']),
  hrPositionController.createCatalog
);

const responsibilityController = require('../controllers/responsibilityController');
router.get(
  '/:orgId/responsibilities',
  authorize(['owner', 'admin']),
  responsibilityController.list
);
router.post(
  '/:orgId/responsibilities',
  authorize(['owner', 'admin']),
  responsibilityController.create
);
router.post(
  '/:orgId/responsibilities/seed-default',
  authorize(['owner', 'admin']),
  responsibilityController.seed
);
router.patch(
  '/:orgId/responsibilities/:key',
  authorize(['owner', 'admin']),
  responsibilityController.patch
);
router.get(
  '/:orgId/responsibilities/users-by-key/:key',
  authorize(['owner', 'admin']),
  responsibilityController.usersByKey
);
router.get(
  '/:orgId/responsibilities/users/:userId',
  authorize(['owner', 'admin']),
  responsibilityController.getUser
);
router.put(
  '/:orgId/responsibilities/users/:userId',
  authorize(['owner', 'admin']),
  responsibilityController.putUser
);

router.get(
  '/:orgId/channels/:channelId/access',
  authorize(['owner', 'admin']),
  organizationController.listChannelAccess
);
router.post(
  '/:orgId/channels/:channelId/access/grant',
  authorize(['owner', 'admin']),
  organizationController.grantChannelAccess
);
router.post(
  '/:orgId/channels/:channelId/access/revoke',
  authorize(['owner', 'admin']),
  organizationController.revokeChannelAccess
);
router.get(
  '/:orgId/channels/:channelId/role-access',
  authorize(['owner', 'admin']),
  organizationController.listChannelRoleAccess
);
router.put(
  '/:orgId/channels/:channelId/role-access',
  authorize(['owner', 'admin']),
  organizationController.saveChannelRoleAccess
);
router.get(
  '/:orgId/divisions/:divisionId/role-access',
  authorize(['owner', 'admin']),
  organizationController.listDivisionRoleAccess
);
router.put(
  '/:orgId/divisions/:divisionId/role-access',
  authorize(['owner', 'admin']),
  organizationController.saveDivisionRoleAccess
);
router.get(
  '/:orgId/departments/:departmentId/role-access',
  authorize(['owner', 'admin']),
  organizationController.listDepartmentRoleAccess
);
router.put(
  '/:orgId/departments/:departmentId/role-access',
  authorize(['owner', 'admin']),
  organizationController.saveDepartmentRoleAccess
);
router.get(
  '/:orgId/teams/:teamId/role-access',
  authorize(['owner', 'admin']),
  organizationController.listTeamRoleAccess
);
router.put(
  '/:orgId/teams/:teamId/role-access',
  authorize(['owner', 'admin']),
  organizationController.saveTeamRoleAccess
);

const projectVisibilityPolicyController = require('../controllers/projectVisibilityPolicy.controller');
router.get(
  '/:orgId/project-visibility-policy',
  authorize(['owner', 'admin', 'hr', 'member']),
  projectVisibilityPolicyController.getProjectVisibilityPolicy
);
router.put(
  '/:orgId/project-visibility-policy',
  authorize(['owner', 'admin']),
  projectVisibilityPolicyController.putProjectVisibilityPolicy
);

router.get('/:id', organizationController.getOrganization);
router.put('/:id', authorize(['owner', 'admin']), organizationController.updateOrganization);
router.delete('/:id', authorize(['owner']), organizationController.deleteOrganization);

module.exports = router;
