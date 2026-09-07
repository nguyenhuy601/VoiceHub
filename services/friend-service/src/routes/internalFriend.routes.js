const express = require('express');
const controller = require('../controllers/internalFriend.controller');

const router = express.Router();

/**
 * S2S: đảm bảo user là bạn (accepted) với danh sách peers — không qua lời mời.
 * POST /api/friends/internal/ensure-accepted
 * Body: { userId, peerUserIds: string[], source?: string }
 */
router.post('/ensure-accepted', controller.ensureAccepted);

module.exports = router;
