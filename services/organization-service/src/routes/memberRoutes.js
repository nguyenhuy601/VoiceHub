const express = require('express');
const router = express.Router({ mergeParams: true });
const memberController = require('../controllers/memberController');
const memberImportController = require('../controllers/memberImportController');
const { memberImportUpload } = require('../middleware/memberImportUpload');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', memberController.getMembers);
router.get('/with-roles', memberController.getMembersWithRoles);
router.get(
  '/next-employee-code',
  authorize(['owner', 'admin', 'hr']),
  memberController.previewNextEmployeeCode
);
router.post('/leave', memberController.leaveOrganization);
router.post('/', authorize(['owner', 'admin', 'hr']), memberController.inviteMember);
router.post('/invite', authorize(['owner', 'admin', 'hr']), memberController.inviteMember);
router.post('/invite-link', authorize(['owner', 'admin', 'hr']), memberController.createInviteLink);
router.post('/join-link', memberController.joinViaLink);
router.put('/:userId/role', authorize(['owner', 'admin']), memberController.updateMemberRole);
router.delete('/:userId', authorize(['owner', 'admin']), memberController.removeMember);

// Excel import (strict rejection, HR internal)
// template TRƯỚC :batchId — tránh "template" bị nuốt thành batchId → 400
router.get('/import/template', authorize(['owner', 'admin', 'hr']), memberImportController.downloadTemplate);
router.post(
  '/import/preview',
  authorize(['owner', 'admin', 'hr']),
  memberImportUpload.single('file'),
  memberImportController.previewExcel
);
router.post(
  '/import/confirm',
  authorize(['owner', 'admin', 'hr']),
  memberImportController.confirmExcel
);
router.post('/import', authorize(['owner', 'admin', 'hr']), memberImportUpload.single('file'), memberImportController.importExcel);
router.get('/import/:batchId', authorize(['owner', 'admin', 'hr']), memberImportController.getBatchStatus);

module.exports = router;
