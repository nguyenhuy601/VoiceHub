const express = require('express');
const router = express.Router();
const channelController = require('../controllers/channelController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', channelController.getChannels);
router.post('/', channelController.createChannel);
router.get('/:id', channelController.getChannel);
router.put('/:id', channelController.updateChannel);
router.delete('/:id', channelController.deleteChannel);
router.get('/:id/messages', channelController.getChannelMessages);

module.exports = router;
