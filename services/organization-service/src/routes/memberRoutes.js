const express = require('express');
const router = express.Router({ mergeParams: true });
const memberController = require('../controllers/memberController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', memberController.getMembers);
router.post('/invite', authorize(['org_admin']), memberController.inviteMember);
router.put('/:userId/role', authorize(['org_admin']), memberController.updateMemberRole);
router.delete('/:userId', authorize(['org_admin']), memberController.removeMember);

module.exports = router;
