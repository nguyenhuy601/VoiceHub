const express = require('express');
const { protect, authorize, authorizeOrGrant } = require('../middleware/auth');
const hierarchyController = require('../controllers/hierarchyController');
const organizationController = require('../controllers/organizationController');

const router = express.Router({ mergeParams: true });
const STRUCTURE_ADMIN = ['owner', 'admin'];

router.use(protect);

/**
 * Huy P5: Legacy Branch→Division→Department→Team routes — DEPRECATED for new admin UI.
 * Prefer GET/PUT /:orgId/structure/levels|units|apply-template. Kept for dual-read clients
 * and workspace until cutover; new writes should go through structureController + OU.
 */
router.get('/branches', hierarchyController.listBranches);
router.post('/branches', authorize(['owner', 'admin']), hierarchyController.createBranch);
// Huy: PUT chi nhánh — sửa / vô hiệu hóa (domain Cơ cấu tổ chức)
router.put('/branches/:branchId', authorize(['owner', 'admin']), hierarchyController.updateBranch);

router.get('/branches/:branchId/divisions', hierarchyController.listDivisions);
router.post('/branches/:branchId/divisions', authorize(['owner', 'admin']), hierarchyController.createDivision);
router.get('/divisions', hierarchyController.listDivisions);
router.post('/divisions', authorize(['owner', 'admin']), hierarchyController.createDivision);
router.put('/divisions/:divisionId', authorize(['owner', 'admin']), hierarchyController.updateDivision);

router.get('/divisions/:divisionId/departments', hierarchyController.listDepartmentsByDivision);
router.post('/divisions/:divisionId/departments', authorizeOrGrant(STRUCTURE_ADMIN, 'organization.department.create'), hierarchyController.createDepartmentByDivision);
router.post('/departments', authorizeOrGrant(STRUCTURE_ADMIN, 'organization.department.create'), hierarchyController.createDepartmentRoot);

router.get('/departments/:deptId/teams', hierarchyController.listTeamsByDepartment);
router.post('/departments/:deptId/teams', authorizeOrGrant(STRUCTURE_ADMIN, 'organization.team.create'), hierarchyController.createTeamByDepartment);
router.post('/divisions/:divisionId/teams', authorizeOrGrant(STRUCTURE_ADMIN, 'organization.team.create'), hierarchyController.createTeamByDivision);
router.post('/teams', authorizeOrGrant(STRUCTURE_ADMIN, 'organization.team.create'), hierarchyController.createTeamRoot);
router.put('/teams/:teamId', authorizeOrGrant(STRUCTURE_ADMIN, 'organization.team.update'), hierarchyController.updateTeamByHierarchy);
router.get(
  '/teams/:teamId/role-access',
  authorize(['owner', 'admin']),
  organizationController.listTeamRoleAccess
);
router.put(
  '/teams/:teamId/role-access',
  authorize(['owner', 'admin']),
  organizationController.saveTeamRoleAccess
);

router.get('/teams/:teamId/channels', hierarchyController.listChannelsByTeam);
router.post('/teams/:teamId/channels', authorizeOrGrant(STRUCTURE_ADMIN, 'communication.channel.create'), hierarchyController.createChannelByTeam);
router.put('/teams/:teamId/channels/:channelId', authorizeOrGrant(STRUCTURE_ADMIN, 'communication.channel.update'), hierarchyController.updateChannelByTeam);
router.post('/channels', authorizeOrGrant(STRUCTURE_ADMIN, 'communication.channel.create'), hierarchyController.createChannelByScope);
router.put('/channels/:channelId', authorizeOrGrant(STRUCTURE_ADMIN, 'communication.channel.update'), hierarchyController.updateChannelByScope);
router.delete('/channels/:channelId', authorizeOrGrant(STRUCTURE_ADMIN, 'communication.channel.delete'), hierarchyController.deleteChannelByScope);

module.exports = router;
