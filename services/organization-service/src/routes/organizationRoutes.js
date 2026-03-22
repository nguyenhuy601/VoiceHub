const express = require('express');
const router = express.Router();
const organizationController = require('../controllers/organizationController');
const memberController = require('../controllers/memberController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect); // All routes require authentication

router.get('/my', organizationController.getMyOrganizations);
router.get('/invitations', memberController.getMyInvitations);
router.post('/invitations/:invitationId/respond', memberController.respondToInvitation);
router.post('/', organizationController.createOrganization);

router.get('/:id', organizationController.getOrganization);
router.put('/:id', authorize(['owner', 'admin']), organizationController.updateOrganization);
router.delete('/:id', authorize(['owner']), organizationController.deleteOrganization);

module.exports = router;
