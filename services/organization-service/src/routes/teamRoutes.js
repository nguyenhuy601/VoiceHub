const express = require('express');
const router = express.Router({ mergeParams: true });
const teamController = require('../controllers/teamController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', teamController.getTeams);
router.post('/', authorize(['owner', 'admin']), teamController.createTeam);
router.put('/:id', authorize(['owner', 'admin']), teamController.updateTeam);
router.delete('/:id', authorize(['owner', 'admin']), teamController.deleteTeam);

module.exports = router;
