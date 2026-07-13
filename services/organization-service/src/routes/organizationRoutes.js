const express = require('express');
const router = express.Router();
const organizationController = require('../controllers/organizationController');
const memberController = require('../controllers/memberController');
const joinApplicationController = require('../controllers/joinApplicationController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect); // All routes require authentication

router.get('/my', organizationController.getMyOrganizations);
router.get('/by-slug/:slug', organizationController.getOrganizationBySlug);
router.get(
  '/my/pending-join-applications',
  joinApplicationController.listMyPendingJoinApplications
);
router.get(
  '/my/join-applications-to-review',
  joinApplicationController.listJoinApplicationsToReview
);
router.get('/invitations', memberController.getMyInvitations);
router.post('/invitations/:invitationId/respond', memberController.respondToInvitation);
router.post('/', organizationController.createOrganization);

/** Đơn gia nhập — đặt trước /:id để không bị nuốt bởi route một phân đoạn */
router.get(
  '/:orgId/join-application-form/public',
  joinApplicationController.getJoinApplicationFormPublic
);
router.get(
  '/:orgId/join-application-form',
  authorize(['owner', 'admin']),
  joinApplicationController.getJoinApplicationForm
);
router.put(
  '/:orgId/join-application-form',
  authorize(['owner', 'admin']),
  joinApplicationController.updateJoinApplicationForm
);
router.post('/:orgId/join-applications', joinApplicationController.submitJoinApplication);
router.get(
  '/:orgId/join-applications',
  authorize(['owner', 'admin']),
  joinApplicationController.listJoinApplications
);
router.patch(
  '/:orgId/join-applications/:applicationId',
  authorize(['owner', 'admin']),
  joinApplicationController.reviewJoinApplication
);

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

router.get('/:id', organizationController.getOrganization);
router.put('/:id', authorize(['owner', 'admin']), organizationController.updateOrganization);
router.delete('/:id', authorize(['owner']), organizationController.deleteOrganization);

module.exports = router;
