const express = require('express');
const router = express.Router();
const friendController = require('../controllers/friendController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', friendController.getFriends);
router.get('/pending', friendController.getPendingRequests);

// tìm bạn theo số điện thoại (qua user-service)
router.get('/search', friendController.searchByPhone);
router.post('/request', friendController.sendFriendRequest);
router.post('/accept/:id', friendController.acceptRequest);
router.delete('/reject/:id', friendController.rejectRequest);
router.delete('/:id', friendController.removeFriend);
router.post('/block', friendController.blockUser);
router.delete('/unblock/:userId', friendController.unblockUser);

module.exports = router;
