const express = require('express');
const friendService = require('../services/friend.service');
const { logger } = require('@enterprise/shared');

const router = express.Router();

/**
 * S2S: đảm bảo user là bạn (accepted) với danh sách peers — không qua lời mời.
 * POST /api/friends/internal/ensure-accepted
 * Body: { userId, peerUserIds: string[], source?: string }
 */
router.post('/ensure-accepted', async (req, res) => {
  try {
    const userId = String(req.body?.userId || '').trim();
    const peerUserIds = Array.isArray(req.body?.peerUserIds) ? req.body.peerUserIds : [];
    const source = String(req.body?.source || 'system').trim() || 'system';

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required',
        errorCode: 'FRIEND_ENSURE_USER_REQUIRED',
      });
    }

    const data = await friendService.ensureAcceptedWithPeers(userId, peerUserIds, { source });
    return res.json({ success: true, data });
  } catch (error) {
    logger.error('internal ensure-accepted error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to ensure friendships',
      errorCode: 'FRIEND_ENSURE_FAILED',
    });
  }
});

module.exports = router;
