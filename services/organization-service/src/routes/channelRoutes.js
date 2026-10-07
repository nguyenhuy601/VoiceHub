const express = require('express');
const router = express.Router({ mergeParams: true });
const channelController = require('../controllers/teamController');
const { protect, authorizeOrGrant } = require('../middleware/auth');
const { requireOrgReadAccess } = require('../middleware/requireOrgReadAccess');
const { registerObjectIdParams, requireMountedObjectIds } = require('../middleware/objectIdParam');

router.use(protect);
router.use(requireMountedObjectIds(['orgId', 'deptId']));
registerObjectIdParams(router, ['id']);

router.get('/', requireOrgReadAccess, channelController.getChannels);
router.post('/', authorizeOrGrant(['owner', 'admin'], 'communication.channel.create'), channelController.createChannel);
router.put('/:id', authorizeOrGrant(['owner', 'admin'], 'communication.channel.update'), channelController.updateChannel);
router.delete('/:id', authorizeOrGrant(['owner', 'admin'], 'communication.channel.delete'), channelController.deleteChannel);

module.exports = router;
