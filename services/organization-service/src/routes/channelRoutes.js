const express = require('express');
const router = express.Router({ mergeParams: true });
const channelController = require('../controllers/teamController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', channelController.getChannels);
router.post('/', authorize(['owner', 'admin']), channelController.createChannel);
router.put('/:id', authorize(['owner', 'admin']), channelController.updateChannel);
router.delete('/:id', authorize(['owner', 'admin']), channelController.deleteChannel);

module.exports = router;
