const express = require('express');
const router = express.Router({ mergeParams: true });
const memberController = require('../controllers/memberController');
const memberImportController = require('../controllers/memberImportController');
const { memberImportUpload } = require('../middleware/memberImportUpload');
const { protect, authorizeOrGrant } = require('../middleware/auth');

router.use(protect);

router.get('/', memberController.getMembers);
router.get('/with-roles', memberController.getMembersWithRoles);
router.get(
  '/next-employee-code',
  authorizeOrGrant(['owner', 'admin', 'hr'], 'organization.employee.view'),
  memberController.previewNextEmployeeCode
);
router.post('/leave', memberController.leaveOrganization);
router.post('/', authorizeOrGrant(['owner', 'admin', 'hr'], 'organization.employee.invite'), memberController.inviteMember);
router.post('/invite', authorizeOrGrant(['owner', 'admin', 'hr'], 'organization.employee.invite'), memberController.inviteMember);
router.post('/invite-link', authorizeOrGrant(['owner', 'admin', 'hr'], 'organization.employee.invite'), memberController.createInviteLink);
router.post('/join-link', memberController.joinViaLink);
router.put('/:userId/role', authorizeOrGrant(['owner', 'admin'], 'organization.employee.update'), memberController.updateMemberRole);
router.delete('/:userId', authorizeOrGrant(['owner', 'admin'], 'organization.employee.delete'), memberController.removeMember);

// Excel import (strict rejection, HR internal)
// template TRƯỚC :batchId — tránh "template" bị nuốt thành batchId → 400
router.get('/import/template', authorizeOrGrant(['owner', 'admin', 'hr'], 'organization.employee.invite'), memberImportController.downloadTemplate);
router.post(
  '/import/preview',
  authorizeOrGrant(['owner', 'admin', 'hr'], 'organization.employee.invite'),
  memberImportUpload.single('file'),
  memberImportController.previewExcel
);
router.post(
  '/import/confirm',
  authorizeOrGrant(['owner', 'admin', 'hr'], 'organization.employee.invite'),
  memberImportController.confirmExcel
);
router.post('/import', authorizeOrGrant(['owner', 'admin', 'hr'], 'organization.employee.invite'), memberImportUpload.single('file'), memberImportController.importExcel);
router.get('/import/:batchId', authorizeOrGrant(['owner', 'admin', 'hr'], 'organization.employee.invite'), memberImportController.getBatchStatus);

module.exports = router;
