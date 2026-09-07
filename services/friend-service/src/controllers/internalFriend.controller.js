const friendService = require('../services/friend.service');
const { logger } = require('@enterprise/shared');

async function ensureAccepted(req, res) {
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
}

module.exports = {
  ensureAccepted,
};
