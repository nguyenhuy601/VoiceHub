const express = require('express');
const router = express.Router({ mergeParams: true });
const teamController = require('../controllers/teamController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', teamController.getTeams);
router.post('/', authorize(['org_admin', 'department_head']), teamController.createTeam);
router.put('/:id', authorize(['org_admin', 'department_head', 'team_leader']), teamController.updateTeam);
router.delete('/:id', authorize(['org_admin', 'department_head']), teamController.deleteTeam);

module.exports = router;
