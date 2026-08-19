const express = require('express');
const router = express.Router({ mergeParams: true });
const teamController = require('../controllers/teamController');
const { protect, authorizeOrGrant } = require('../middleware/auth');

router.use(protect);

router.get('/', teamController.getTeams);
router.post('/', authorizeOrGrant(['owner', 'admin'], 'organization.team.create'), teamController.createTeam);
router.put('/:id', authorizeOrGrant(['owner', 'admin'], 'organization.team.update'), teamController.updateTeam);
router.delete('/:id', authorizeOrGrant(['owner', 'admin'], 'organization.team.delete'), teamController.deleteTeam);

module.exports = router;
