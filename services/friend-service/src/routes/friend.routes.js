const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const friendController = require('../controllers/friend.controller');

router.use(protect);

router.get('/search', friendController.searchByPhone.bind(friendController));
router.get('/pending', friendController.getFriendRequests.bind(friendController));
router.post('/request', friendController.sendFriendRequest.bind(friendController));
router.post('/:friendId/accept', friendController.acceptFriendRequest.bind(friendController));
router.post('/:friendId/reject', friendController.rejectFriendRequest.bind(friendController));
router.get('/', friendController.getFriends.bind(friendController));
router.get('/:friendId/relationship', friendController.getRelationship.bind(friendController));
router.post('/:friendId/block', friendController.blockUser.bind(friendController));
router.post('/:friendId/unblock', friendController.unblockUser.bind(friendController));

module.exports = router;
