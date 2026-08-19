const express = require('express');
const router = express.Router({ mergeParams: true });
const channelController = require('../controllers/teamController');
const { protect, authorizeOrGrant } = require('../middleware/auth');

router.use(protect);

router.get('/', channelController.getChannels);
router.post('/', authorizeOrGrant(['owner', 'admin'], 'communication.channel.create'), channelController.createChannel);
router.put('/:id', authorizeOrGrant(['owner', 'admin'], 'communication.channel.update'), channelController.updateChannel);
router.delete('/:id', authorizeOrGrant(['owner', 'admin'], 'communication.channel.delete'), channelController.deleteChannel);

module.exports = router;
