const express = require('express');
const router = express.Router({ mergeParams: true });
const teamController = require('../controllers/teamController');
const { protect, authorizeOrGrant } = require('../middleware/auth');
const { requireOrgReadAccess } = require('../middleware/requireOrgReadAccess');
const { registerObjectIdParams, requireMountedObjectIds } = require('../middleware/objectIdParam');

router.use(protect);
router.use(requireMountedObjectIds(['orgId', 'deptId']));
registerObjectIdParams(router, ['id']);

router.get('/', requireOrgReadAccess, teamController.getTeams);
router.post('/', authorizeOrGrant(['owner', 'admin'], 'organization.team.create'), teamController.createTeam);
router.put('/:id', authorizeOrGrant(['owner', 'admin'], 'organization.team.update'), teamController.updateTeam);
router.delete('/:id', authorizeOrGrant(['owner', 'admin'], 'organization.team.delete'), teamController.deleteTeam);

module.exports = router;
